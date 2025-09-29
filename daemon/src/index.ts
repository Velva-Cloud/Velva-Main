import express from 'express';
import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Docker from 'dockerode';
import forge from 'node-forge';

// Runtime helpers for archives and uploads
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tar = require('tar-stream');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require('multer');

const app = express();
app.use(express.json());

const PORT = Number(process.env.DAEMON_PORT || 9443);
const CERTS_DIR = process.env.CERTS_DIR || '/certs';
const DATA_DIR = process.env.DATA_DIR || '/data';
const SERVERS_DIR = path.join(DATA_DIR, 'servers');
const PANEL_URL = process.env.PANEL_URL || '';
const REGISTRATION_SECRET = process.env.REGISTRATION_SECRET || '';
const JOIN_CODE = process.env.JOIN_CODE || '';
const PUBLIC_IP_ENV = process.env.PUBLIC_IP || '';
const PANEL_API_KEY = process.env.PANEL_API_KEY || process.env.AGENT_API_KEY || '';

const CERT_PATH = process.env.DAEMON_TLS_CERT || path.join(CERTS_DIR, 'agent.crt');
const KEY_PATH = process.env.DAEMON_TLS_KEY || path.join(CERTS_DIR, 'agent.key');
const CA_PATH = process.env.DAEMON_TLS_CA || path.join(CERTS_DIR, 'ca.crt');

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function serverDir(serverId: number | string) {
  return path.join(SERVERS_DIR, String(serverId));
}

function safeResolve(base: string, reqPath: string | undefined) {
  const req = reqPath || '';
  const full = path.resolve(base, '.' + (req.startsWith('/') ? req : `/${req}`));
  if (!full.startsWith(base)) {
    throw new Error('invalid_path');
  }
  return full;
}

const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });

async function detectPublicIp(timeoutMs = 3000): Promise<string | null> {
  if (PUBLIC_IP_ENV) return PUBLIC_IP_ENV;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal });
    clearTimeout(t);
    const j = (await r.json()) as any;
    return (j && j.ip) || null;
  } catch {
    return null;
  }
}

function loadTls(): { cert?: Buffer; key?: Buffer; ca?: Buffer } {
  try {
    const cert = fs.existsSync(CERT_PATH) ? fs.readFileSync(CERT_PATH) : undefined;
    const key = fs.existsSync(KEY_PATH) ? fs.readFileSync(KEY_PATH) : undefined;
    const ca = fs.existsSync(CA_PATH) ? fs.readFileSync(CA_PATH) : undefined;
    return { cert, key, ca };
  } catch {
    return {};
  }
}

function signMessage(privateKeyPem: string, message: string): string {
  const pkey = forge.pki.privateKeyFromPem(privateKeyPem) as forge.pki.rsa.PrivateKey;
  const md = forge.md.sha256.create();
  md.update(message, 'utf8');
  const sigBytes = pkey.sign(md);
  return forge.util.encode64(sigBytes);
}

async function bootstrapIfNeeded(): Promise<void> {
  const { cert, key, ca } = loadTls();
  if (cert && key && ca) return;
  if (!PANEL_URL || (!JOIN_CODE && !REGISTRATION_SECRET)) {
    console.error('TLS files missing and PANEL_URL plus JOIN_CODE or REGISTRATION_SECRET not set. Cannot bootstrap.');
    process.exit(1);
  }
  try {
    ensureDir(path.dirname(KEY_PATH));
    ensureDir(path.dirname(CERT_PATH));
    ensureDir(path.dirname(CA_PATH));
    ensureDir(SERVERS_DIR);
    ensureDir(DATA_DIR);

    // Keypair and CSR
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const csr = forge.pki.createCertificationRequest();
    csr.publicKey = keys.publicKey;
    const nodeName = process.env.NODE_NAME || os.hostname();
    csr.setSubject([{ name: 'commonName', value: nodeName }]);

    const pubIp = (await detectPublicIp()) || '127.0.0.1';
    // SANs: include IP and useful DNS names so panel hostname verification can pass in dev/prod
    const altNames: any[] = [{ type: 7, ip: pubIp }];
    const dnsCandidates = [
      nodeName,
      process.env.DOCKER_SERVICE_NAME || 'daemon',
      process.env.NODE_DNS_NAME || undefined,
    ].filter(Boolean) as string[];
    for (const dns of Array.from(new Set(dnsCandidates))) {
      altNames.push({ type: 2, value: dns }); // dNSName
    }
    const host = pubIp;
    csr.setAttributes([
      {
        name: 'extensionRequest',
        extensions: [{ name: 'subjectAltName', altNames }],
      },
    ]);
    csr.sign(keys.privateKey);

    const csrPem = forge.pki.certificationRequestToPem(csr);
    const privPem = forge.pki.privateKeyToPem(keys.privateKey);
    fs.writeFileSync(KEY_PATH, privPem, { mode: 0o600 });

    // Register
    const capacity = {
      cpuCores: os.cpus().length,
      memoryMb: Math.round(os.totalmem() / (1024 * 1024)),
      diskMb: null as any, // optional
    };
    const apiUrl = `https://${host}:${PORT}`;
    const registerBody = {
      name: process.env.NODE_NAME || undefined,
      location: process.env.NODE_LOCATION || undefined,
      apiUrl,
      publicIp: pubIp,
      capacity,
      csrPem,
    };

    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (JOIN_CODE) headers['x-join-code'] = JOIN_CODE;
    else headers['x-registration-secret'] = REGISTRATION_SECRET;

    const regRes = await fetch(`${PANEL_URL.replace(/\/*$/, '')}/nodes/agent/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify(registerBody),
    });
    if (!regRes.ok) {
      const txt = await regRes.text();
      throw new Error(`register_failed: ${regRes.status} ${txt}`);
    }
    const reg = (await regRes.json()) as { nodeId: number; approved: boolean; nonce: string };
    let nonce = reg.nonce;

    // Poll for approval
    let approved = reg.approved;
    const pollUrl = `${PANEL_URL.replace(/\/*$/, '')}/nodes/agent/poll`;
    for (let attempt = 0; attempt < 60; attempt++) {
      const signatureBase64 = signMessage(privPem, nonce);
      const pollRes = await fetch(pollUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nodeId: reg.nodeId, signatureBase64 }),
      });
      if (!pollRes.ok) {
        const txt = await pollRes.text();
        throw new Error(`poll_failed: ${pollRes.status} ${txt}`);
      }
      const data = (await pollRes.json()) as any;
      if (data.approved) {
        if (!data.nodeCertPem || !data.caCertPem) {
          throw new Error('approved_without_cert');
        }
        fs.writeFileSync(CERT_PATH, data.nodeCertPem, { mode: 0o644 });
        fs.writeFileSync(CA_PATH, data.caCertPem, { mode: 0o644 });
        nonce = data.nonce;
        fs.writeFileSync(path.join(CERTS_DIR, 'nonce'), nonce, { mode: 0o600 });
        fs.writeFileSync(path.join(CERTS_DIR, 'nodeId'), String(reg.nodeId), { mode: 0o600 });
        approved = true;
        break;
      } else {
        await new Promise((r) => setTimeout(r, 3000));
        if (data?.nonce) {
          nonce = data.nonce;
        }
      }
    }
    if (!approved) throw new Error('approval_timeout');
    console.log('Bootstrap complete: certificate issued.');
  } catch (e: any) {
    console.error('Bootstrap failed:', e?.message || e);
    process.exit(1);
  }
}

function startHttpsServer() {
  const { cert, key, ca } = loadTls();
  if (!cert || !key || !ca) {
    console.error('TLS files not found after bootstrap.');
    process.exit(1);
  }

  const tlsOpts: https.ServerOptions = {
    cert,
    key,
    ca,
    requestCert: true,
    rejectUnauthorized: true,
  };

  // Auth: allow either mTLS client certificate (preferred) or API key header
  app.use((req, res, next) => {
    const tlsSocket = req.socket as any; // TLSSocket at runtime
    const hasCert = tlsSocket.getPeerCertificate?.();
    const mtlsOk = tlsSocket.authorized && !!hasCert;
    const apiKey = req.headers['x-panel-api-key'];
    const apiOk = PANEL_API_KEY && typeof apiKey === 'string' && apiKey === PANEL_API_KEY;
    if (!mtlsOk && !apiOk) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  app.get('/metrics', async (_req, res) => {
    try {
      const containers = await docker.listContainers({ all: true });
      res.json({ containers: containers.length });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'docker_error' });
    }
  });

  app.get('/inventory', async (_req, res) => {
    try {
      const list = await docker.listContainers({ all: true });
      const containers = list.map(info => {
        const name = (info.Names && info.Names[0]) ? info.Names[0].replace(/^\//, '') : info.Id.substring(0, 12);
        const m = name.match(/^vc-(\d+)$/);
        const serverId = m ? Number(m[1]) : undefined;
        const running = info.State === 'running';
        return { id: info.Id, name, serverId, running };
      });
      res.json({ containers });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'inventory_failed' });
    }
  });

  // Console: stream logs via SSE
  app.get('/logs/:id', async (req, res) => {
    const id = req.params.id;
    try {
      const container = docker.getContainer(`vc-${id}`);
      const follow = req.query.follow === '1' || req.query.follow === 'true';
      const tail = Number(req.query.tail || 200);
      const opts = { follow, stdout: true, stderr: true, tail } as any;
      const stream = await container.logs(opts);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const ping = setInterval(() => {
        try { res.write(': ping\n\n'); } catch {}
      }, 25000);

      stream.on('data', (chunk: Buffer) => {
        const line = chunk.toString('utf8');
        res.write(`data: ${JSON.stringify(line)}\n\n`);
      });
      stream.on('end', () => {
        clearInterval(ping);
        try { res.end(); } catch {}
      });
      stream.on('error', (_e: any) => {
        clearInterval(ping);
        try { res.end(); } catch {}
      });

      const reqRaw = (res as any).req || undefined;
      if (reqRaw && typeof reqRaw.on === 'function') {
        reqRaw.on('close', () => { try { stream.destroy?.(); } catch {} clearInterval(ping); });
      }
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'logs_failed' });
    }
  });

  // Console: run a command via docker exec and return its output
  app.post('/exec/:id', async (req, res) => {
    const id = req.params.id;
    const cmd = (req.body?.cmd || '').toString();
    if (!cmd || cmd.length > 1000) return res.status(400).json({ error: 'invalid_cmd' });
    try {
      const container = docker.getContainer(`vc-${id}`);
      const exec = await container.exec({
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        Cmd: ['/bin/sh', '-lc', cmd],
      } as any);
      const stream = await exec.start({ hijack: true, stdin: false } as any);
      let output = '';
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (d: Buffer) => (output += d.toString('utf8')));
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      res.json({ ok: true, output });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'exec_failed' });
    }
  });

  app.post('/provision', async (req, res) => {
    const { serverId, name, image = 'nginx:alpine', cpu, ramMB } = req.body || {};
    if (!serverId || !name) return res.status(400).json({ error: 'serverId and name required' });

    const containerName = `vc-${serverId}`;

    try {
      // Idempotency: robust existence check by name via listContainers
      try {
        const matches = await docker.listContainers({ all: true, filters: { name: [containerName] } as any });
        if (Array.isArray(matches) && matches.length > 0) {
          const info = matches[0];
          return res.json({ ok: true, id: info.Id, existed: true });
        }
      } catch {
        // ignore pre-check failures and proceed
      }

      // Ensure persistent server directory and image presence
      const srvDir = serverDir(serverId);
      ensureDir(SERVERS_DIR);
      ensureDir(srvDir);

      await new Promise<void>((resolve, reject) => {
        docker.pull(image, (err: any, stream: any) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (err2: any) => (err2 ? reject(err2) : resolve()));
        });
      });

      try {
        const container = await docker.createContainer({
          name: containerName,
          Image: image,
          Tty: true,
          OpenStdin: true,
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
          HostConfig: {
            Binds: [`${srvDir}:/srv`],
            NanoCpus: typeof cpu === 'number' ? Math.round(cpu * 1e9) : undefined,
            Memory: typeof ramMB === 'number' ? ramMB * 1024 * 1024 : undefined,
            RestartPolicy: { Name: 'unless-stopped' },
          },
          Env: [`VC_SERVER_ID=${serverId}`, `VC_NAME=${name}`],
          Cmd: [],
        });
        return res.json({ ok: true, id: container.id, existed: false, volume: '/srv' });
      } catch (e: any) {
        // If name conflict happened due to a race, treat as existed
        const msg = String(e?.message || '');
        if (e?.statusCode === 409 || /already in use/i.test(msg) || /Conflict/i.test(msg)) {
          try {
            // Try listContainers to resolve by name
            const matches = await docker.listContainers({ all: true, filters: { name: [containerName] } as any });
            if (Array.isArray(matches) && matches.length > 0) {
              const info = matches[0];
              return res.json({ ok: true, id: info.Id, existed: true, volume: '/srv' });
            }
            // Fallback to inspect by name with and without leading slash
            try {
              const c1 = docker.getContainer(containerName);
              await c1.inspect();
              return res.json({ ok: true, id: c1.id, existed: true, volume: '/srv' });
            } catch {}
            try {
              const c2 = docker.getContainer(`/${containerName}`);
              await c2.inspect();
              return res.json({ ok: true, id: c2.id, existed: true, volume: '/srv' });
            } catch {}
          } catch {
            // ignore and fall through to error
          }
        }
        console.error('provision_error:', e);
        return res.status(500).json({ error: e?.message || 'provision_failed' });
      }
    } catch (e: any) {
      console.error('provision_unexpected:', e);
      res.status(500).json({ error: e?.message || 'provision_failed' });
    }
  });

  app.post('/start/:id', async (req, res) => {
    const id = req.params.id;
    try {
      const container = docker.getContainer(`vc-${id}`);
      await container.start();
      res.json({ ok: true });
    } catch (e: any) {
      const code = e?.statusCode;
      const msg = String(e?.message || '');
      // Treat already started (304) as success
      if (code === 304 || /already started/i.test(msg) || /not modified/i.test(msg)) {
        return res.json({ ok: true, already: true });
      }
      // Propagate not found as 404 with a stable error code
      if (code === 404 || /no such container/i.test(msg)) {
        return res.status(404).json({ error: 'container_not_found' });
      }
      res.status(500).json({ error: e?.message || 'start_failed' });
    }
  });

  app.post('/stop/:id', async (req, res) => {
    const id = req.params.id;
    try {
      const container = docker.getContainer(`vc-${id}`);
      await container.stop({ t: Number(process.env.STOP_TIMEOUT || 10) });
      res.json({ ok: true });
    } catch (e: any) {
      const code = e?.statusCode;
      const msg = String(e?.message || '');
      // Treat already stopped (304) as success
      if (code === 304 || /not running/i.test(msg) || /not modified/i.test(msg)) {
        return res.json({ ok: true, already: true });
      }
      // If container is missing, treat stop as a no-op success
      if (code === 404 || /no such container/i.test(msg)) {
        return res.json({ ok: true, missing: true });
      }
      res.status(500).json({ error: e?.message || 'stop_failed' });
    }
  });

  app.post('/restart/:id', async (req, res) => {
    const id = req.params.id;
    try {
      const container = docker.getContainer(`vc-${id}`);
      await container.restart({ t: Number(process.env.RESTART_TIMEOUT || 5) });
      res.json({ ok: true });
    } catch (e: any) {
      const code = e?.statusCode;
      const msg = String(e?.message || '');
      if (code === 404 || /no such container/i.test(msg)) {
        return res.status(404).json({ error: 'container_not_found' });
      }
      res.status(500).json({ error: e?.message || 'restart_failed' });
    }
  });

  app.delete('/delete/:id', async (req, res) => {
    const id = req.params.id;
    try {
      const container = docker.getContainer(`vc-${id}`);
      await container.remove({ force: true });
      res.json({ ok: true });
    } catch (e: any) {
      const code = e?.statusCode;
      const msg = String(e?.message || '');
      // Deleting a missing container is idempotent success
      if (code === 404 || /no such container/i.test(msg)) {
        return res.json({ ok: true, missing: true });
      }
      res.status(500).json({ error: e?.message || 'delete_failed' });
    }
  });

  // Simple file manager on persistent volume /data/servers/<id> mounted at /srv inside containers
  const upload = multer({ storage: multer.memoryStorage() });
  app.get('/fs/:id/list', async (req, res) => {
    try {
      const root = serverDir(req.params.id);
      ensureDir(root);
      const target = safeResolve(root, (req.query.path as string) || '/');
      const entries = await fs.promises.readdir(target, { withFileTypes: true });
      const items = await Promise.all(entries.map(async (ent) => {
        const full = path.join(target, ent.name);
        const st = await fs.promises.stat(full);
        return {
          name: ent.name,
          type: ent.isDirectory() ? 'dir' : 'file',
          size: ent.isDirectory() ? null : st.size,
          mtime: st.mtime,
        };
      }));
      res.json({ path: target.replace(root, '') || '/', items });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'list_failed' });
    }
  });

  app.get('/fs/:id/download', async (req, res) => {
    try {
      const root = serverDir(req.params.id);
      ensureDir(root);
      const target = safeResolve(root, (req.query.path as string) || '/');
      const st = await fs.promises.stat(target);
      if (st.isDirectory()) {
        // Return a tar archive of the directory
        const pack = tar.pack();
        const base = target;
        const walk = async (dir: string, rel: string) => {
          const ents = await fs.promises.readdir(dir, { withFileTypes: true });
          for (const ent of ents) {
            const full = path.join(dir, ent.name);
            const relPath = path.join(rel, ent.name);
            const stat = await fs.promises.stat(full);
            if (ent.isDirectory()) {
              await new Promise<void>((resolve) => pack.entry({ name: relPath + '/', type: 'directory', mode: stat.mode }, resolve));
              await walk(full, relPath);
            } else {
              const data = await fs.promises.readFile(full);
              await new Promise<void>((resolve) => pack.entry({ name: relPath, size: data.length, mode: stat.mode }, data, resolve));
            }
          }
        };
        await walk(base, '');
        pack.finalize();
        res.setHeader('Content-Type', 'application/x-tar');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(target)}.tar"`);
        pack.pipe(res);
      } else {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(target)}"`);
        fs.createReadStream(target).pipe(res);
      }
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'download_failed' });
    }
  });

  app.post('/fs/:id/upload', upload.single('file'), async (req, res) => {
    try {
      const root = serverDir(req.params.id);
      ensureDir(root);
      const dirPath = safeResolve(root, (req.query.path as string) || '/');
      await fs.promises.mkdir(dirPath, { recursive: true });
      const file = (req as any).file;
      if (!file) return res.status(400).json({ error: 'file_required' });
      const dest = path.join(dirPath, file.originalname);
      await fs.promises.writeFile(dest, file.buffer);
      res.json({ ok: true, path: dest.replace(root, '') });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'upload_failed' });
    }
  });

  app.post('/fs/:id/mkdir', async (req, res) => {
    try {
      const root = serverDir(req.params.id);
      ensureDir(root);
      const dirPath = safeResolve(root, (req.body?.path as string) || '/');
      await fs.promises.mkdir(dirPath, { recursive: true });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'mkdir_failed' });
    }
  });

  app.post('/fs/:id/delete', async (req, res) => {
    try {
      const root = serverDir(req.params.id);
      ensureDir(root);
      const p = safeResolve(root, (req.body?.path as string) || '/');
      await fs.promises.rm(p, { recursive: true, force: true });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'delete_failed' });
    }
  });

  app.post('/fs/:id/rename', async (req, res) => {
    try {
      const root = serverDir(req.params.id);
      ensureDir(root);
      const from = safeResolve(root, (req.body?.from as string) || '/');
      const to = safeResolve(root, (req.body?.to as string) || '/');
      await fs.promises.rename(from, to);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'rename_failed' });
    }
  });

  const server = https.createServer(tlsOpts, app);
  server.listen(PORT, () => {
    console.log(`VelvaCloud daemon listening on https://0.0.0.0:${PORT}`);
    console.log(`Persistent server data at ${SERVERS_DIR} (mounted into containers at /srv)`);
  });
}

async function startHeartbeat() {
  try {
    const nodeIdPath = path.join(CERTS_DIR, 'nodeId');
    const noncePath = path.join(CERTS_DIR, 'nonce');
    if (!fs.existsSync(nodeIdPath) || !fs.existsSync(noncePath)) return;
    const nodeId = Number(fs.readFileSync(nodeIdPath, 'utf8').trim());
    let nonce = fs.readFileSync(noncePath, 'utf8').trim();
    const privPem = fs.readFileSync(KEY_PATH, 'utf8');

    const hbUrl = `${PANEL_URL.replace(/\/+$/, '')}/nodes/agent/heartbeat`;

    setInterval(async () => {
      try {
        const signatureBase64 = signMessage(privPem, nonce);
        const res = await fetch(hbUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ nodeId, signatureBase64 }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as any;
        if (data?.nonce) {
          nonce = data.nonce;
          fs.writeFileSync(noncePath, nonce, { mode: 0o600 });
        }
      } catch {
        // ignore transient errors
      }
    }, Number(process.env.HEARTBEAT_INTERVAL_MS || 30000));
  } catch {
    // ignore
  }
}

(async () => {
  await bootstrapIfNeeded();
  startHttpsServer();
  startHeartbeat();
})();