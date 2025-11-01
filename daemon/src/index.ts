import express from 'express';
import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Docker from 'dockerode';
import forge from 'node-forge';
import { PassThrough } from 'stream';

// Runtime helpers for archives and uploads
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tar = require('tar-stream');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require('multer');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Server: SSHServer } = require('ssh2');

const app = express();
app.use(express.json());

const PORT = Number(process.env.DAEMON_PORT || 9443);
const CERTS_DIR = process.env.CERTS_DIR || '/certs';
const DATA_DIR = process.env.DATA_DIR || '/data';
const SERVERS_DIR = path.join(DATA_DIR, 'servers');
const SSH_DIR = path.join(DATA_DIR, 'ssh');
const PANEL_URL = process.env.PANEL_URL || '';
const REGISTRATION_SECRET = process.env.REGISTRATION_SECRET || '';
const JOIN_CODE = process.env.JOIN_CODE || '';
const PUBLIC_IP_ENV = process.env.PUBLIC_IP || '';
const PANEL_API_KEY = process.env.PANEL_API_KEY || process.env.AGENT_API_KEY || '';
const SFTP_PORT = Number(process.env.SFTP_PORT || 2222);
const SFTP_PASSWORD = process.env.SFTP_PASSWORD || PANEL_API_KEY || '';

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

async function ensureHostKey(): Promise<string> {
  ensureDir(SSH_DIR);
  const hostKeyPath = path.join(SSH_DIR, 'host_rsa.key');
  if (fs.existsSync(hostKeyPath)) return hostKeyPath;
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const privPem = forge.pki.privateKeyToPem(keys.privateKey);
  fs.writeFileSync(hostKeyPath, privPem, { mode: 0o600 });
  return hostKeyPath;
}

async function bootstrapIfNeeded(): Promise<void> {
  const { cert, key, ca } = loadTls();
  if (cert && key && ca) {
    ensureDir(SERVERS_DIR);
    ensureDir(DATA_DIR);
    ensureDir(SSH_DIR);
    return;
  }
  await performRegistration(true);
}

/**
 * Perform agent registration and certificate issuance.
 * If force=true, always generate a new keypair and CSR.
 * If force=false and an existing private key is present, reuse it to generate CSR.
 */
async function performRegistration(force = false): Promise<void> {
  if (!PANEL_URL || (!JOIN_CODE && !REGISTRATION_SECRET)) {
    console.error('PANEL_URL plus JOIN_CODE or REGISTRATION_SECRET not set. Cannot register.');
    process.exit(1);
  }
  try {
    ensureDir(path.dirname(KEY_PATH));
    ensureDir(path.dirname(CERT_PATH));
    ensureDir(path.dirname(CA_PATH));
    ensureDir(SERVERS_DIR);
    ensureDir(DATA_DIR);
    ensureDir(SSH_DIR);

    // Private key and CSR
    let privKey: any;
    let pubKey: any;
    if (!force && fs.existsSync(KEY_PATH)) {
      try {
        const privPemExisting = fs.readFileSync(KEY_PATH, 'utf8');
        privKey = forge.pki.privateKeyFromPem(privPemExisting);
        pubKey = forge.pki.setRsaPublicKey(privKey.n, privKey.e);
      } catch {
        // fall through to new keypair
      }
    }
    if (!privKey || !pubKey) {
      const keys = forge.pki.rsa.generateKeyPair(2048);
      privKey = keys.privateKey;
      pubKey = keys.publicKey;
      const privPemNew = forge.pki.privateKeyToPem(privKey);
      fs.writeFileSync(KEY_PATH, privPemNew, { mode: 0o600 });
    }

    const csr = forge.pki.createCertificationRequest();
    csr.publicKey = pubKey;
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
    csr.sign(privKey);

    const csrPem = forge.pki.certificationRequestToPem(csr);
    const privPem = forge.pki.privateKeyToPem(privKey);

    // Registration payload
    const capacity = {
      cpuCores: os.cpus().length,
      memoryMb: Math.round(os.totalmem() / (1024 * 1024)),
      diskMb: null as any, // optional
    };
    const dnsName = process.env.NODE_NAME || os.hostname() || host;
    const apiUrl = `https://${dnsName}:${PORT}`;
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
    console.log('Registration complete: certificate issued.');
  } catch (e: any) {
    console.error('Registration failed:', e?.message || e);
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

  // Per-container instantaneous statistics (non-stream)
  app.get('/stats/:id', async (req, res) => {
    const id = req.params.id;
    try {
      const container = docker.getContainer(`vc-${id}`);

      // Basic CPU/memory/net from Docker
      const stats: any = await container.stats({ stream: false } as any);
      const now = new Date().toISOString();
      const cpuStats = stats.cpu_stats || {};
      const preCpu = stats.precpu_stats || {};
      const cpuDelta = Math.max(0, (cpuStats.cpu_usage?.total_usage || 0) - (preCpu.cpu_usage?.total_usage || 0));
      const systemDelta = Math.max(1, (cpuStats.system_cpu_usage || 0) - (preCpu.system_cpu_usage || 0));
      const online = (cpuStats.online_cpus || cpuStats.cpu_usage?.percpu_usage?.length || 1);
      const cpuPercent = Math.max(0, Math.min(1000, (cpuDelta / systemDelta) * online * 100));

      const memStats = stats.memory_stats || {};
      const cache = Number(memStats.stats?.cache || 0);
      const memUsage = Math.max(0, Number(memStats.usage || 0) - cache);
      const memLimit = Math.max(0, Number(memStats.limit || 0));

      // Network RX/TX sum
      let rx = 0, tx = 0;
      const nets = stats.networks || {};
      for (const k of Object.keys(nets)) {
        rx += Number(nets[k]?.rx_bytes || 0);
        tx += Number(nets[k]?.tx_bytes || 0);
      }

      // Block IO read/write sum
      let blkRead = 0, blkWrite = 0;
      const io = stats.blkio_stats?.io_service_bytes_recursive || [];
      if (Array.isArray(io)) {
        for (const rec of io) {
          const op = (rec?.op || '').toString().toLowerCase();
          const v = Number(rec?.value || 0);
          if (op === 'read') blkRead += v;
          if (op === 'write') blkWrite += v;
        }
      }

      const pids = Number(stats.pids_stats?.current || 0);

      // Server disk usage on persistent volume
      const root = serverDir(id);
      ensureDir(root);
      async function folderSize(dir: string): Promise<number> {
        let total = 0;
        const ents = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const ent of ents) {
          const full = path.join(dir, ent.name);
          try {
            const st = await fs.promises.stat(full);
            if (ent.isDirectory()) total += await folderSize(full);
            else total += st.size;
          } catch {}
        }
        return total;
      }
      let diskUsedBytes = 0;
      try { diskUsedBytes = await folderSize(root); } catch {}

      // Try to detect Minecraft players via server list ping on mapped host port
      let players: { online?: number; max?: number } | undefined = undefined;
      try {
        const info = await container.inspect();
        const ports = (info.NetworkSettings && info.NetworkSettings.Ports) || {};
        const mc = ports['25565/tcp'];
        const hostPort = Array.isArray(mc) && mc[0] && mc[0].HostPort ? Number(mc[0].HostPort) : undefined;
        if (hostPort) {
          players = await pingMinecraft('127.0.0.1', hostPort, Number(process.env.MC_PING_TIMEOUT_MS || 800));
        }
      } catch {}

      res.json({
        ts: now,
        cpuPercent,
        mem: { usage: memUsage, limit: memLimit },
        net: { rxBytes: rx, txBytes: tx },
        blkio: { readBytes: blkRead, writeBytes: blkWrite },
        pids,
        disk: { usedBytes: diskUsedBytes },
        players: players || null,
      });
    } catch (e: any) {
      const code = e?.statusCode;
      const msg = String(e?.message || '');
      if (code === 404 || /no such container/i.test(msg)) {
        return res.status(404).json({ error: 'container_not_found' });
      }
      res.status(500).json({ error: e?.message || 'stats_failed' });
    }
  });

  // Minimal Minecraft server list ping (status) over TCP
  async function pingMinecraft(host: string, port: number, timeoutMs = 800): Promise<{ online: number; max: number } | undefined> {
    return await new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      let done = false;
      const finish = (v?: any) => {
        if (done) return;
        done = true;
        try { socket.destroy(); } catch {}
        resolve(v);
      };
      const t = setTimeout(() => finish(undefined), timeoutMs);
      socket.connect(port, host, () => {
        // Handshake + Status request for protocol 47+ (modern)
        function writeVarInt(val: number) {
          const out: number[] = [];
          // eslint-disable-next-line no-constant-condition
          while (true) {
            if ((val & 0xffffff80) === 0) { out.push(val); break; }
            out.push((val & 0x7f) | 0x80);
            val >>>= 7;
          }
          return Buffer.from(out);
        }
        const protocol = 47;
        const hostBuf = Buffer.from(host, 'utf8');
        const data = Buffer.concat([
          Buffer.from([0x00]), // handshake packet id
          writeVarInt(protocol),
          writeVarInt(hostBuf.length), hostBuf,
          Buffer.from([(port >> 8) & 0xff, port & 0xff]),
          writeVarInt(1), // next state: status
        ]);
        const packet = Buffer.concat([writeVarInt(data.length), data]);
        socket.write(packet);
        // status request
        socket.write(Buffer.from([0x01, 0x00]));
      });
      let buf = Buffer.alloc(0);
      socket.on('data', (d: Buffer) => {
        buf = Buffer.concat([buf, d]);
        // Try to parse JSON payload
        try {
          // Skip length + packet id VarInts very loosely
          const str = buf.toString('utf8');
          const firstBrace = str.indexOf('{');
          const lastBrace = str.lastIndexOf('}');
          if (firstBrace >= 0 && lastBrace > firstBrace) {
            const json = JSON.parse(str.slice(firstBrace, lastBrace + 1));
            const p = json?.players;
            if (p && typeof p.online === 'number' && typeof p.max === 'number') {
              clearTimeout(t);
              finish({ online: p.online, max: p.max });
            }
          }
        } catch {
          // ignore partial frames
        }
      });
      socket.on('error', () => finish(undefined));
      socket.on('close', () => finish(undefined));
    });
  }

  app.get('/inventory', async (_req, res) => {
    try {
      const list = await docker.listContainers({ all: true });
      const containers = list.map(info => {
        const name = (info.Names && info.Names[0]) ? info.Names[0].replace(/^\//, '') : info.Id.substring(0, 12);
        const m = name.match(/^vc-(\d+)$/);
        const serverId = m ? Number(m[1]) : undefined;
        const running = info.State === 'running';
        const ports = (info.Ports || []).map(p => ({
          privatePort: p.PrivatePort,
          publicPort: p.PublicPort || null,
          type: p.Type || 'tcp',
        }));
        return { id: info.Id, name, serverId, running, ports };
      });
      res.json({ containers });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'inventory_failed' });
    }
  });

  // Platform update: restart platform containers (backend/frontend; optionally daemon)
  app.post('/platform/update', async (req, res) => {
    try {
      const includeDaemon = !!(req.body?.includeDaemon);
      const list = await docker.listContainers({ all: true });
      const wants = new Set(['backend', 'frontend']);
      if (includeDaemon) wants.add('daemon');
      const selfId = process.env.HOSTNAME || '';
      const delayed: string[] = [];
      let restarted = { backend: 0, frontend: 0, daemon: 0 };
      for (const info of list) {
        const labels = info.Labels || {};
        const service = labels['com.docker.compose.service'] || '';
        if (!wants.has(service)) continue;
        try {
          const c = docker.getContainer(info.Id);
          // Pull image if RepoTags exist (optional best-effort)
          const imageRef = info.Image || info.ImageID;
          try {
            if (imageRef && typeof imageRef === 'string' && imageRef.includes(':')) {
              await new Promise<void>((resolve) => {
                docker.pull(imageRef, (err: any, stream: any) => {
                  if (err) return resolve(); // ignore pull errors for locally built images
                  docker.modem.followProgress(stream, (_err2: any) => resolve());
                });
              });
            }
          } catch {
            // ignore
          }
          if (service === 'daemon' && info.Id && info.Id.startsWith(selfId)) {
            // Schedule self restart after the response
            delayed.push(info.Id);
          } else {
            await c.restart({ t: Number(process.env.RESTART_TIMEOUT || 5) } as any);
            (restarted as any)[service] = (restarted as any)[service] + 1;
          }
        } catch {
          // ignore individual container restart errors
        }
      }
      res.json({ ok: true, restarted, scheduled: delayed.length });
      // Perform delayed restarts
      for (const id of delayed) {
        setTimeout(async () => {
          try {
            await docker.getContainer(id).restart({ t: Number(process.env.RESTART_TIMEOUT || 5) } as any);
          } catch {}
        }, 1000);
      }
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'platform_update_failed' });
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

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const ping = setInterval(() => {
        try { res.write(': ping\n\n'); } catch {}
      }, 25000);

      // Use callback overload to obtain a stream and satisfy TS types
      container.logs(opts, (err: any, stream: any) => {
        if (err || !stream) {
          clearInterval(ping);
          const code = err?.statusCode;
          const msg = String(err?.message || '');
          if (code === 404 || /no such container/i.test(msg)) {
            return res.status(404).json({ error: 'container_not_found' });
          }
          return res.status(500).json({ error: err?.message || 'logs_failed' });
        }

        // Demux stdout/stderr when needed
        const out = new PassThrough();
        const errOut = new PassThrough();
        try {
          (docker as any).modem.demuxStream(stream, out, errOut);
        } catch {
          // If not multiplexed (TTY), just use the stream directly
          stream.on('data', (chunk: Buffer) => {
            const line = chunk.toString('utf8');
            res.write(`data: ${JSON.stringify(line)}\n\n`);
          });
        }

        const onChunk = (chunk: Buffer) => {
          const line = chunk.toString('utf8');
          res.write(`data: ${JSON.stringify(line)}\n\n`);
        };
        out.on('data', onChunk);
        errOut.on('data', onChunk);

        const endAll = () => {
          clearInterval(ping);
          try { out.destroy(); } catch {}
          try { errOut.destroy(); } catch {}
          try { stream.destroy(); } catch {}
          try { res.end(); } catch {}
        };

        stream.on('end', endAll);
        stream.on('error', endAll);

        const reqRaw = (res as any).req || undefined;
        if (reqRaw && typeof reqRaw.on === 'function') {
          reqRaw.on('close', endAll);
        }
      });
    } catch (e: any) {
      const code = e?.statusCode;
      const msg = String(e?.message || '');
      if (code === 404 || /no such container/i.test(msg)) {
        return res.status(404).json({ error: 'container_not_found' });
      }
      res.status(500).json({ error: e?.message || 'logs_failed' });
    }
  });

  // Fetch last logs (non-stream), robust across TTY/non-TTY and follow=false
  app.get('/logs_last/:id', async (req, res) => {
    const id = req.params.id;
    try {
      const container = docker.getContainer(`vc-${id}`);
      const tail = Number(req.query.tail || 200);
      const opts = { follow: false, stdout: true, stderr: true, tail } as any;

      let result: any;
      try {
        // Prefer promise form; returns Buffer for follow=false
        result = await container.logs(opts);
      } catch (err: any) {
        const code = err?.statusCode;
        const msg = String(err?.message || '');
        if (code === 404 || /no such container/i.test(msg)) {
          return res.status(404).json({ error: 'container_not_found' });
        }
        return res.status(500).json({ error: err?.message || 'logs_failed' });
      }

      // Handle Buffer/string vs stream defensively
      let output = '';
      if (result && typeof (result as any).on === 'function') {
        // It's a stream (unexpected for follow=false, but handle)
        const stream: any = result;
        stream.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
        stream.on('end', () => {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.send(output);
        });
        stream.on('error', (err: any) => {
          res.status(500).json({ error: err?.message || 'logs_failed' });
        });
      } else {
        // Buffer or string
        if (Buffer.isBuffer(result)) output = result.toString('utf8');
        else if (typeof result === 'string') output = result;
        else output = String(result || '');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(output);
      }
    } catch (e: any) {
      const code = e?.statusCode;
      const msg = String(e?.message || '');
      if (code === 404 || /no such container/i.test(msg)) {
        return res.status(404).json({ error: 'container_not_found' });
      }
      res.status(500).json({ error: e?.message || 'logs_failed' });
    }
  });

  // Console: run a command via docker exec and return its output
  app.post('/exec/:id', async (req, res) => {
    const id = req.params.id;
    const cmd = (req.body?.cmd || '').toString();
    if (!cmd || cmd.length > 2000) return res.status(400).json({ error: 'invalid_cmd' });
    try {
      const container = docker.getContainer(`vc-${id}`);

      // Special marker to run mc-send-to-console as uid 1000 without shell indirection
      if (cmd.startsWith('__MC_PIPE__ ')) {
        const arg = cmd.slice('__MC_PIPE__ '.length);
        const exec = await container.exec({
          AttachStdout: true,
          AttachStderr: true,
          Tty: false,
          Cmd: ['mc-send-to-console', arg],
          User: '1000',
        } as any);
        const stream = await exec.start({ hijack: true, stdin: false } as any);
        let output = '';
        await new Promise<void>((resolve, reject) => {
          stream.on('data', (d: Buffer) => (output += d.toString('utf8')));
          stream.on('end', resolve);
          stream.on('error', reject);
        });
        return res.json({ ok: true, output });
      }

      // Fallback generic shell exec
      const wantsUser1000 = /(^|\s)mc-send-to-console(\s|$)/.test(cmd);
      const exec = await container.exec({
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        Cmd: ['/bin/sh', '-lc', cmd],
        ...(wantsUser1000 ? { User: '1000' } : {}),
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

  // Persistent port allocation store
  const PORT_STORE_PATH = path.join(DATA_DIR, 'port-allocations.json');
  type PortAllocation = { serverId: number; range: [number, number]; ports: number[]; protocol: 'tcp' | 'udp' | 'mixed' };
  function loadPortStore(): Record<string, PortAllocation> {
    try {
      if (!fs.existsSync(PORT_STORE_PATH)) return {};
      const text = fs.readFileSync(PORT_STORE_PATH, 'utf8');
      const json = JSON.parse(text);
      return typeof json === 'object' && json ? json : {};
    } catch {
      return {};
    }
  }
  function savePortStore(store: Record<string, PortAllocation>) {
    try {
      ensureDir(DATA_DIR);
      fs.writeFileSync(PORT_STORE_PATH, JSON.stringify(store, null, 2));
    } catch {}
  }
  async function listUsedHostPorts(): Promise<Set<number>> {
    const used = new Set<number>();
    try {
      const list = await docker.listContainers({ all: true });
      for (const info of list) {
        const ports = info.Ports || [];
        for (const prt of ports) {
          if (typeof prt.PublicPort === 'number') used.add(prt.PublicPort);
        }
      }
    } catch {}
    // Also reserve ports from persisted store to avoid race conditions
    const store = loadPortStore();
    for (const key of Object.keys(store)) {
      const alloc = store[key];
      for (const p of alloc.ports) used.add(p);
    }
    return used;
  }
  function allocateContiguous(range: [number, number], count: number, used: Set<number>, seed = 0): number[] | null {
    const [start, end] = range;
    const total = Math.max(0, end - start + 1);
    if (count <= 0 || total < count) return null;
    let idxStart = (seed % total + total) % total;
    for (let tries = 0; tries < total; tries++, idxStart = (idxStart + 1) % total) {
      const candidateStart = start + idxStart;
      if (candidateStart + count - 1 > end) continue;
      let ok = true;
      for (let i = 0; i < count; i++) {
        const port = candidateStart + i;
        if (used.has(port)) {
          ok = false;
          break;
        }
      }
      if (ok) {
        const ports = Array.from({ length: count }, (_, i) => candidateStart + i);
        for (const p of ports) used.add(p);
        return ports;
      }
    }
    return null;
  }
  function allocateDistinct(range: [number, number], count: number, used: Set<number>, seed = 0): number[] | null {
    const [start, end] = range;
    const total = Math.max(0, end - start + 1);
    if (count <= 0 || total < count) return null;
    const result: number[] = [];
    let idx = (seed % total + total) % total;
    let tries = 0;
    while (result.length < count && tries < total * 2) {
      const candidate = start + idx;
      if (!used.has(candidate)) {
        used.add(candidate);
        result.push(candidate);
      }
      idx = (idx + 1) % total;
      tries++;
    }
    return result.length === count ? result : null;
  }

  // In-memory process table for SteamCMD provisioner
  const steamProcesses = new Map<number, any>();

  app.post('/provision', async (req, res) => {
    const {
      serverId,
      name,
      image = 'nginx:alpine',
      cpu,
      ramMB,
      env = {},
      mountPath = '/srv',
      cmd = [],
      exposePorts = [],
      forceRecreate = false,
      hostPortPolicy,
      provisioner = 'docker',
      steam,
    } = req.body || {};
    if (!serverId || !name) return res.status(400).json({ error: 'serverId and name required' });

    const containerName = `vc-${serverId}`;

    try {
      // Ensure persistent server directory
      const srvDir = serverDir(serverId);
      ensureDir(SERVERS_DIR);
      ensureDir(srvDir);

      // Exposed ports from request: support "<port>/<proto>" to validate protocol
      const exposed: Record<string, {}> = {};
      const internalPorts: Array<{ containerPort: number; proto: 'tcp' | 'udp' }> = [];
      for (const p of exposePorts || []) {
        const s = String(p);
        let containerPort = Number(s.split('/')[0]);
        let proto: 'tcp' | 'udp' = (s.includes('/') && s.split('/')[1] === 'udp') ? 'udp' : 'tcp';
        if (!Number.isFinite(containerPort) || containerPort <= 0) continue;
        internalPorts.push({ containerPort, proto });
        exposed[`${containerPort}/${proto}`] = {};
      }

      // Host port allocation
      let portBindings: Record<string, Array<{ HostPort: string }>> | undefined = undefined;
      let chosenHostPort: number | undefined = undefined;

      const store = loadPortStore();
      const key = String(serverId);
      const existingAlloc = store[key];

      // Validate protocol family hint
      const policyRange: [number, number] | undefined = (hostPortPolicy && Array.isArray(hostPortPolicy.hostRange)) ? hostPortPolicy.hostRange : undefined;
      const policyContig = hostPortPolicy?.contiguous && Number(hostPortPolicy.contiguous) > 0 ? Number(hostPortPolicy.contiguous) : undefined;
      const policyProto: 'tcp' | 'udp' | 'mixed' = (hostPortPolicy?.protocol as any) || 'mixed';

      if (internalPorts.length > 0 && policyRange) {
        const used = await listUsedHostPorts();
        let allocated: number[] | null = null;

        if (policyContig && policyContig > 1) {
          allocated = allocateContiguous(policyRange, Math.max(policyContig, internalPorts.length), used, serverId);
        } else {
          allocated = allocateDistinct(policyRange, internalPorts.length, used, serverId);
        }

        // Reuse existing allocation if present and sufficient
        if (existingAlloc && Array.isArray(existingAlloc.ports) && existingAlloc.ports.length >= (allocated?.length || internalPorts.length)) {
          allocated = existingAlloc.ports.slice(0, Math.max(policyContig || internalPorts.length, internalPorts.length));
        }

        if (allocated && allocated.length > 0) {
          // Persist allocation
          store[key] = { serverId: Number(serverId), range: policyRange, ports: allocated, protocol: policyProto };
          savePortStore(store);

          // If using Docker, build PortBindings mapping internal ports to allocated host ports
          // If using SteamCMD, we'll pass allocated[0] to the process as -port
          if (provisioner === 'docker') {
            portBindings = {};
            for (let i = 0; i < internalPorts.length; i++) {
              const entry = internalPorts[i];
              const host = allocated[i] || allocated[0];
              const bindingKey = `${entry.containerPort}/${entry.proto}`;
              portBindings[bindingKey] = [{ HostPort: String(host) }];
            }
          }
          // Use the first mapped port as chosenHostPort for convenience
          chosenHostPort = allocated[0];
        }
      }

      if (provisioner === 'steamcmd') {
        // Ensure steamcmd is available
        const candidates = [
          process.env.STEAMCMD_PATH || '',
          '/usr/bin/steamcmd',
          '/usr/local/bin/steamcmd',
          '/opt/steamcmd/steamcmd.sh',
        ].filter(Boolean);
        let steamcmdPath: string | null = null;
        for (const c of candidates) {
          try {
            if (c && fs.existsSync(c)) { steamcmdPath = c; break; }
          } catch {}
        }
        if (!steamcmdPath) {
          return res.status(500).json({ error: 'steamcmd_not_found', detail: 'Install SteamCMD and set STEAMCMD_PATH env or place it at /usr/bin/steamcmd' });
        }

        const appId = Number(steam?.appId || 0);
        if (!appId) return res.status(400).json({ error: 'steam_appid_required' });
        const branch = (steam?.branch || 'public').toString();

        // Install/update into srvDir via SteamCMD
        const installArgs = [
          '+login', 'anonymous',
          '+force_install_dir', srvDir,
          '+app_update', String(appId),
          '-beta', branch,
          '+quit',
        ];

        await new Promise<void>((resolve, reject) => {
          const cp = require('child_process').spawn(steamcmdPath, installArgs, { stdio: 'inherit' });
          cp.on('error', reject);
          cp.on('exit', (code: number) => (code === 0 ? resolve() : reject(new Error('steamcmd_install_failed'))));
        });

        // Build launch command per appId (SRCDS family)
        let runCmd: string;
        let runArgs: string[];
        const hostPort = Number(chosenHostPort || 27015);
        if (appId === 4020) { // Garry's Mod
          runCmd = path.join(srvDir, 'srcds_run');
          runArgs = ['-game', 'garrysmod', '-console', '-port', String(hostPort), '+exec', 'server.cfg'];
        } else if (appId === 740) { // CS:GO
          runCmd = path.join(srvDir, 'srcds_run');
          runArgs = ['-game', 'csgo', '-console', '-port', String(hostPort), '+map', 'de_dust2'];
        } else if (appId === 232250) { // TF2
          runCmd = path.join(srvDir, 'srcds_run');
          runArgs = ['-game', 'tf', '-console', '-port', String(hostPort), '+map', 'cp_dustbowl'];
        } else if (appId === 222860) { // L4D2
          runCmd = path.join(srvDir, 'srcds_run');
          runArgs = ['-game', 'left4dead2', '-console', '-port', String(hostPort)];
        } else if (appId === 629760) { // Mordhau
          runCmd = path.join(srvDir, 'MordhauServer-Linux-Shipping');
          runArgs = ['-Port=' + String(hostPort)];
        } else {
          // Generic SRCDS default
          runCmd = path.join(srvDir, 'srcds_run');
          runArgs = ['-console', '-port', String(hostPort)];
        }

        // Append user-provided args
        const extraArgs: string[] = Array.isArray(steam?.args) ? steam!.args!.map(a => String(a)) : [];
        runArgs.push(...extraArgs);

        // Start process and persist state
        const child = require('child_process').spawn(runCmd, runArgs, {
          cwd: srvDir,
          env: { ...process.env, VC_SERVER_ID: String(serverId), VC_NAME: name },
          stdio: 'ignore',
          detached: true,
        });
        steamProcesses.set(Number(serverId), child);
        try { fs.writeFileSync(path.join(srvDir, 'steam.json'), JSON.stringify({ appId, branch, runCmd, runArgs, port: hostPort }, null, 2)); } catch {}

        return res.json({ ok: true, id: `proc-${serverId}`, existed: false, volume: mountPath, port: hostPort, provisioner: 'steamcmd' });
      }

      // Docker path
      // Pre-pull image with auth + fallbacks
      await pullImageWithFallback(image, req.body?.registryAuth);

      // Environment variables: flatten object to ["KEY=value"]
      const envArr: string[] = [`VC_SERVER_ID=${serverId}`, `VC_NAME=${name}`];
      if (env && typeof env === 'object') {
        for (const [k, v] of Object.entries(env)) {
          envArr.push(`${k}=${String(v)}`);
        }
      }

      // CPU units to NanoCpus:
      let nanoCpus: number | undefined = undefined;
      if (typeof cpu === 'number' && isFinite(cpu) && cpu > 0) {
        const unitsPerCore = Number(process.env.CPU_UNITS_PER_CORE || 100);
        const coresAvail = Math.max(1, (os.cpus()?.length || 1));
        let coreLimit = cpu / (unitsPerCore > 0 ? unitsPerCore : 100);
        coreLimit = Math.max(0.01, Math.min(coresAvail, coreLimit));
        nanoCpus = Math.round(coreLimit * 1e9);
      }

      // If container exists and forceRecreate, remove it to apply new config
      // Existence check by name
      let existingId: string | null = null;
      try {
        const matches = await docker.listContainers({ all: true, filters: { name: [containerName] } as any });
        if (Array.isArray(matches) && matches.length > 0) {
          existingId = matches[0].Id;
        }
      } catch {}

      if (existingId && forceRecreate) {
        try {
          const c = docker.getContainer(existingId);
          try { await c.stop({ t: Number(process.env.STOP_TIMEOUT || 5) } as any); } catch {}
          await c.remove({ force: true });
          existingId = null;
        } catch {}
      }

      if (existingId) {
        return res.json({ ok: true, id: existingId, existed: true, volume: mountPath, port: chosenHostPort });
      }

      try {
        const container = await docker.createContainer({
          name: containerName,
          Image: image,
          Tty: false,
          OpenStdin: false,
          AttachStdin: false,
          AttachStdout: true,
          AttachStderr: true,
          HostConfig: {
            Binds: [`${srvDir}:${mountPath}`],
            NanoCpus: nanoCpus,
            Memory: typeof ramMB === 'number' ? ramMB * 1024 * 1024 : undefined,
            RestartPolicy: { Name: 'unless-stopped' },
            ...(portBindings ? { PortBindings: portBindings } : {}),
          } as any,
          Env: envArr,
          ExposedPorts: Object.keys(exposed).length ? exposed : undefined,
          Cmd: Array.isArray(cmd) ? cmd : [],
        } as any);
        return res.json({ ok: true, id: container.id, existed: false, volume: mountPath, port: chosenHostPort });
      } catch (e: any) {
        const msg = String(e?.message || '');
        if (e?.statusCode === 409 || /already in use/i.test(msg) || /Conflict/i.test(msg)) {
          try {
            const matches = await docker.listContainers({ all: true, filters: { name: [containerName] } as any });
            if (Array.isArray(matches) && matches.length > 0) {
              const info = matches[0];
              return res.json({ ok: true, id: info.Id, existed: true, volume: mountPath });
            }
            try {
              const c1 = docker.getContainer(containerName);
              await c1.inspect();
              return res.json({ ok: true, id: c1.id, existed: true, volume: mountPath });
            } catch {}
            try {
              const c2 = docker.getContainer(`/${containerName}`);
              await c2.inspect();
              return res.json({ ok: true, id: c2.id, existed: true, volume: mountPath });
            } catch {}
          } catch {}
        }
        console.error('provision_error:', e);
        return res.status(500).json({ error: e?.message || 'provision_failed' });
      }
    } catch (e: any) {
      console.error('provision_unexpected:', e);
      res.status(500).json({ error: e?.message || 'provision_failed' });
    }
  });
        exposed[`${containerPort}/${proto}`] = {};
      }

      // CPU units to NanoCpus:
      let nanoCpus: number | undefined = undefined;
      if (typeof cpu === 'number' && isFinite(cpu) && cpu > 0) {
        const unitsPerCore = Number(process.env.CPU_UNITS_PER_CORE || 100);
        const coresAvail = Math.max(1, (os.cpus()?.length || 1));
        let coreLimit = cpu / (unitsPerCore > 0 ? unitsPerCore : 100);
        coreLimit = Math.max(0.01, Math.min(coresAvail, coreLimit));
        nanoCpus = Math.round(coreLimit * 1e9);
      }

      // Host port allocation
      let portBindings: Record<string, Array<{ HostPort: string }>> | undefined = undefined;
      let chosenHostPort: number | undefined = undefined;

      const store = loadPortStore();
      const key = String(serverId);
      const existingAlloc = store[key];

      // Validate protocol family hint
      const policyRange: [number, number] | undefined = (hostPortPolicy && Array.isArray(hostPortPolicy.hostRange)) ? hostPortPolicy.hostRange : undefined;
      const policyContig = hostPortPolicy?.contiguous && Number(hostPortPolicy.contiguous) > 0 ? Number(hostPortPolicy.contiguous) : undefined;
      const policyProto: 'tcp' | 'udp' | 'mixed' = (hostPortPolicy?.protocol as any) || 'mixed';

      if (internalPorts.length > 0 && policyRange) {
        const used = await listUsedHostPorts();
        let allocated: number[] | null = null;

        if (policyContig && policyContig > 1) {
          allocated = allocateContiguous(policyRange, Math.max(policyContig, internalPorts.length), used, serverId);
        } else {
          allocated = allocateDistinct(policyRange, internalPorts.length, used, serverId);
        }

        // Reuse existing allocation if present and sufficient
        if (existingAlloc && Array.isArray(existingAlloc.ports) && existingAlloc.ports.length >= (allocated?.length || internalPorts.length)) {
          allocated = existingAlloc.ports.slice(0, Math.max(policyContig || internalPorts.length, internalPorts.length));
        }

        if (allocated && allocated.length > 0) {
          // Persist allocation
          store[key] = { serverId: Number(serverId), range: policyRange, ports: allocated, protocol: policyProto };
          savePortStore(store);

          // Build PortBindings mapping internal ports to allocated host ports
          portBindings = {};
          for (let i = 0; i < internalPorts.length; i++) {
            const entry = internalPorts[i];
            const host = allocated[i] || allocated[0];
            const bindingKey = `${entry.containerPort}/${entry.proto}`;
            portBindings[bindingKey] = [{ HostPort: String(host) }];
            // Use the first mapped port as chosenHostPort for convenience
            if (chosenHostPort === undefined) chosenHostPort = host;
          }
        }
      } else if ((typeof image === 'string' && image.includes('itzg/minecraft-server'))) {
        // Fallback to legacy MC-only allocation if policy not provided
        const containerPort = 25565;
        const base = Number(process.env.MC_PORT_BASE || 25000);
        const range = Number(process.env.MC_PORT_RANGE || 10000);
        const maxTries = Number(process.env.MC_PORT_MAX_TRIES || 200);
        const used = await listUsedHostPorts();
        let candidate = base + ((serverId * 17) % Math.max(1, range));
        let tries = 0;
        while (used.has(candidate) && tries < maxTries) {
          candidate = base + (((candidate - base + 1) % Math.max(1, range)));
          tries++;
        }
        chosenHostPort = candidate;
        exposed[`${containerPort}/tcp`] = {};
        portBindings = { [`${containerPort}/tcp`]: [{ HostPort: String(chosenHostPort) }] };
        // Persist legacy allocation too
        store[key] = { serverId: Number(serverId), range: [base, base + range - 1], ports: [candidate], protocol: 'tcp' };
        savePortStore(store);
      }

      // If container exists and forceRecreate, remove it to apply new config
      if (existingId && forceRecreate) {
        try {
          const c = docker.getContainer(existingId);
          try { await c.stop({ t: Number(process.env.STOP_TIMEOUT || 5) } as any); } catch {}
          await c.remove({ force: true });
          existingId = null;
        } catch {}
      }

      if (existingId) {
        return res.json({ ok: true, id: existingId, existed: true, volume: mountPath, port: chosenHostPort });
      }

      try {
        const container = await docker.createContainer({
          name: containerName,
          Image: image,
          Tty: false,
          OpenStdin: false,
          AttachStdin: false,
          AttachStdout: true,
          AttachStderr: true,
          HostConfig: {
            Binds: [`${srvDir}:${mountPath}`],
            NanoCpus: nanoCpus,
            Memory: typeof ramMB === 'number' ? ramMB * 1024 * 1024 : undefined,
            RestartPolicy: { Name: 'unless-stopped' },
            ...(portBindings ? { PortBindings: portBindings } : {}),
          } as any,
          Env: envArr,
          ExposedPorts: Object.keys(exposed).length ? exposed : undefined,
          Cmd: Array.isArray(cmd) ? cmd : [],
        } as any);
        return res.json({ ok: true, id: container.id, existed: false, volume: mountPath, port: chosenHostPort });
      } catch (e: any) {
        const msg = String(e?.message || '');
        if (e?.statusCode === 409 || /already in use/i.test(msg) || /Conflict/i.test(msg)) {
          try {
            const matches = await docker.listContainers({ all: true, filters: { name: [containerName] } as any });
            if (Array.isArray(matches) && matches.length > 0) {
              const info = matches[0];
              return res.json({ ok: true, id: info.Id, existed: true, volume: mountPath });
            }
            try {
              const c1 = docker.getContainer(containerName);
              await c1.inspect();
              return res.json({ ok: true, id: c1.id, existed: true, volume: mountPath });
            } catch {}
            try {
              const c2 = docker.getContainer(`/${containerName}`);
              await c2.inspect();
              return res.json({ ok: true, id: c2.id, existed: true, volume: mountPath });
            } catch {}
          } catch {}
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
      // Release any persisted host port allocations for this server
      try {
        const PORT_STORE_PATH = path.join(DATA_DIR, 'port-allocations.json');
        const text = fs.existsSync(PORT_STORE_PATH) ? fs.readFileSync(PORT_STORE_PATH, 'utf8') : '';
        const store = text ? JSON.parse(text) : {};
        if (store && store[id]) {
          delete store[id];
          fs.writeFileSync(PORT_STORE_PATH, JSON.stringify(store, null, 2));
        }
      } catch {}
      res.json({ ok: true });
    } catch (e: any) {
      const code = e?.statusCode;
      const msg = String(e?.message || '');
      // Deleting a missing container is idempotent success
      if (code === 404 || /no such container/i.test(msg)) {
        // Still release allocation
        try {
          const PORT_STORE_PATH = path.join(DATA_DIR, 'port-allocations.json');
          const text = fs.existsSync(PORT_STORE_PATH) ? fs.readFileSync(PORT_STORE_PATH, 'utf8') : '';
          const store = text ? JSON.parse(text) : {};
          if (store && store[id]) {
            delete store[id];
            fs.writeFileSync(PORT_STORE_PATH, JSON.stringify(store, null, 2));
          }
        } catch {}
        return res.json({ ok: true, missing: true });
      }
      res.status(500).json({ error: e?.message || 'delete_failed' });
    }
  });

  // Simple file manager on persistent volume /data/servers/<id> mounted at /srv inside containers
  const upload = multer({ storage: multer.memoryStorage() });
  // Normalize a requested path where "/data" inside container maps to root of serverDir on host.
  function normalizeRequestedPath(p?: string): string {
    const raw = (p || '/').toString();
    if (raw === '/data' || raw.startsWith('/data/')) {
      const trimmed = raw.slice('/data'.length);
      return trimmed && trimmed !== '' ? trimmed : '/';
    }
    return raw;
  }

  app.get('/fs/:id/list', async (req, res) => {
    try {
      const root = serverDir(req.params.id);
      ensureDir(root);
      const reqPath = normalizeRequestedPath(req.query.path as string);
      const target = safeResolve(root, reqPath);
      // If target directory does not exist yet, return empty listing instead of 500
      let exists = false;
      try { exists = fs.existsSync(target); } catch {}
      if (!exists) {
        return res.json({ path: target.replace(root, '') || '/', items: [], root, absPath: target });
      }
      const entries = await fs.promises.readdir(target, { withFileTypes: true });
      const items = await Promise.all(entries.map(async (ent) => {
        const full = path.join(target, ent.name);
        let st: fs.Stats | null = null;
        try { st = await fs.promises.stat(full); } catch {}
        return {
          name: ent.name,
          type: ent.isDirectory() ? 'dir' : 'file',
          size: ent.isDirectory() ? null : (st ? st.size : null),
          mtime: st ? st.mtime : null,
        };
      }));
      res.json({ path: target.replace(root, '') || '/', items, root, absPath: target });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'list_failed' });
    }
  });

  app.get('/fs/:id/download', async (req, res) => {
    try {
      const root = serverDir(req.params.id);
      ensureDir(root);
      const reqPath = normalizeRequestedPath(req.query.path as string);
      const target = safeResolve(root, reqPath);
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
      const reqPath = normalizeRequestedPath(req.query.path as string);
      const dirPath = safeResolve(root, reqPath);
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
      const reqPath = normalizeRequestedPath(req.body?.path as string);
      const dirPath = safeResolve(root, reqPath);
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
      const reqPath = normalizeRequestedPath(req.body?.path as string);
      const p = safeResolve(root, reqPath);
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
      const fromReq = normalizeRequestedPath(req.body?.from as string);
      const toReq = normalizeRequestedPath(req.body?.to as string);
      const from = safeResolve(root, fromReq);
      const to = safeResolve(root, toReq);
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

function statToAttrs(st: fs.Stats) {
  return {
    mode: st.mode,
    uid: (st as any).uid || 0,
    gid: (st as any).gid || 0,
    size: st.size,
    atime: Math.floor(st.atimeMs / 1000),
    mtime: Math.floor(st.mtimeMs / 1000),
  };
}

function startSftpServer() {
  if (!SFTP_PASSWORD) {
    console.warn('SFTP disabled (SFTP_PASSWORD not set)');
    return;
  }
  const hostKeyPathPromise = ensureHostKey();
  hostKeyPathPromise.then((hostKeyPath) => {
    const server = new SSHServer(
      {
        hostKeys: [fs.readFileSync(hostKeyPath)],
        ident: 'VelvaCloud-sftp',
      },
      (client: any) => {
        let srvId: number | null = null;
        client
          .on('authentication', (ctx: any) => {
            try {
              const m = (ctx.username || '').match(/^(server|srv)\-(\d+)$/i);
              if (!m) return ctx.reject(['password']);
              srvId = Number(m[2]);
              if (ctx.method === 'password' && SFTP_PASSWORD && ctx.password === SFTP_PASSWORD) {
                return ctx.accept();
              }
              return ctx.reject(['password']);
            } catch {
              return ctx.reject(['password']);
            }
          })
          .on('ready', () => {
            if (!srvId) {
              client.end();
              return;
            }
            const root = serverDir(srvId);
            ensureDir(root);
            client.on('session', (accept: any, _reject: any) => {
              const session = accept();
              session.on('sftp', (acceptSftp: any, _rejectSftp: any) => {
                const sftp = acceptSftp();
                const handles = new Map<string, any>();
                let handleCount = 0;
                const newHandle = (obj: any) => {
                  const h = Buffer.alloc(4);
                  h.writeUInt32BE(++handleCount, 0);
                  handles.set(h.toString('hex'), obj);
                  return h;
                };
                const getHandle = (h: Buffer) => handles.get(h.toString('hex'));

                sftp.on('REALPATH', (reqid: number, p: string) => {
                  try {
                    const full = safeResolve(root, p || '/');
                    const rel = '/' + path.relative(root, full).replace(/\\/g, '/');
                    sftp.name(reqid, [{ filename: rel, longname: rel, attrs: {} }]);
                  } catch {
                    sftp.status(reqid, 4);
                  }
                });

                sftp.on('STAT', async (reqid: number, p: string) => {
                  try {
                    const full = safeResolve(root, p);
                    const st = await fs.promises.stat(full);
                    sftp.attrs(reqid, statToAttrs(st));
                  } catch {
                    sftp.status(reqid, 2);
                  }
                });

                sftp.on('LSTAT', async (reqid: number, p: string) => {
                  try {
                    const full = safeResolve(root, p);
                    const st = await fs.promises.lstat(full);
                    sftp.attrs(reqid, statToAttrs(st));
                  } catch {
                    sftp.status(reqid, 2);
                  }
                });

                sftp.on('OPENDIR', async (reqid: number, p: string) => {
                  try {
                    const full = safeResolve(root, p);
                    const entries = await fs.promises.readdir(full, { withFileTypes: true });
                    const handle = newHandle({ type: 'dir', path: full, entries, idx: 0 });
                    sftp.handle(reqid, handle);
                  } catch {
                    sftp.status(reqid, 2);
                  }
                });

                sftp.on('READDIR', async (reqid: number, handle: Buffer) => {
                  const h = getHandle(handle);
                  if (!h || h.type !== 'dir') return sftp.status(reqid, 4);
                  const batch = [];
                  for (let i = 0; i < 50 && h.idx < h.entries.length; i++, h.idx++) {
                    const ent = h.entries[h.idx];
                    const full = path.join(h.path, ent.name);
                    let st: fs.Stats | null = null;
                    try {
                      st = await fs.promises.stat(full);
                    } catch {}
                    batch.push({
                      filename: ent.name,
                      longname: ent.name,
                      attrs: st ? statToAttrs(st) : {},
                    });
                  }
                  if (batch.length > 0) {
                    sftp.name(reqid, batch);
                  } else {
                    sftp.status(reqid, 1);
                  }
                });

                sftp.on('OPEN', async (reqid: number, p: string, flags: number, _attrs: any) => {
                  try {
                    const full = safeResolve(root, p);
                    // Translate SFTP flags to Node flags
                    const SSH_FXF_READ = 0x00000001;
                    const SSH_FXF_WRITE = 0x00000002;
                    const SSH_FXF_APPEND = 0x00000004;
                    const SSH_FXF_CREAT = 0x00000008;
                    const SSH_FXF_TRUNC = 0x00000010;
                    const SSH_FXF_EXCL = 0x00000020;

                    let nodeFlags = 'r';
                    const canRead = !!(flags & SSH_FXF_READ);
                    const canWrite = !!(flags & SSH_FXF_WRITE);
                    const append = !!(flags & SSH_FXF_APPEND);
                    const creat = !!(flags & SSH_FXF_CREAT);
                    const trunc = !!(flags & SSH_FXF_TRUNC);
                    const excl = !!(flags & SSH_FXF_EXCL);

                    if (append) nodeFlags = canRead ? 'a+' : 'a';
                    else if (trunc || creat) nodeFlags = canRead ? 'w+' : 'w';
                    else if (canRead && canWrite) nodeFlags = 'r+';
                    else if (canWrite) nodeFlags = 'w';
                    else nodeFlags = 'r';

                    // Ensure directory exists on create
                    if (creat) {
                      ensureDir(path.dirname(full));
                    }

                    const fd = await fs.promises.open(full, nodeFlags, 0o644);
                    const handle = newHandle({ type: 'file', fd });
                    sftp.handle(reqid, handle);
                  } catch (e: any) {
                    sftp.status(reqid, 4);
                  }
                });

                sftp.on('READ', async (reqid: number, handle: Buffer, offset: number, length: number) => {
                  const h = getHandle(handle);
                  if (!h || h.type !== 'file') return sftp.status(reqid, 4);
                  try {
                    const buf = Buffer.alloc(length);
                    const { bytesRead } = await h.fd.read(buf, 0, length, offset);
                    if (bytesRead > 0) sftp.data(reqid, buf.subarray(0, bytesRead));
                    else sftp.status(reqid, 1); // EOF
                  } catch {
                    sftp.status(reqid, 4);
                  }
                });

                sftp.on('WRITE', async (reqid: number, handle: Buffer, offset: number, data: Buffer) => {
                  const h = getHandle(handle);
                  if (!h || h.type !== 'file') return sftp.status(reqid, 4);
                  try {
                    await h.fd.write(data, 0, data.length, offset);
                    sftp.status(reqid, 0);
                  } catch {
                    sftp.status(reqid, 4);
                  }
                });

                sftp.on('CLOSE', async (reqid: number, handle: Buffer) => {
                  const h = getHandle(handle);
                  if (h && h.type === 'file') {
                    try { await h.fd.close(); } catch {}
                  }
                  handles.delete(handle.toString('hex'));
                  sftp.status(reqid, 0);
                });

                sftp.on('REMOVE', async (reqid: number, p: string) => {
                  try {
                    const full = safeResolve(root, p);
                    await fs.promises.unlink(full);
                    sftp.status(reqid, 0);
                  } catch {
                    sftp.status(reqid, 2);
                  }
                });

                sftp.on('RMDIR', async (reqid: number, p: string) => {
                  try {
                    const full = safeResolve(root, p);
                    await fs.promises.rmdir(full);
                    sftp.status(reqid, 0);
                  } catch {
                    sftp.status(reqid, 4);
                  }
                });

                sftp.on('MKDIR', async (reqid: number, p: string, _attrs: any) => {
                  try {
                    const full = safeResolve(root, p);
                    await fs.promises.mkdir(full, { recursive: false });
                    sftp.status(reqid, 0);
                  } catch {
                    sftp.status(reqid, 4);
                  }
                });

                sftp.on('RENAME', async (reqid: number, from: string, to: string) => {
                  try {
                    const f = safeResolve(root, from);
                    const t = safeResolve(root, to);
                    await fs.promises.rename(f, t);
                    sftp.status(reqid, 0);
                  } catch {
                    sftp.status(reqid, 4);
                  }
                });

                sftp.on('READLINK', (reqid: number, _p: string) => {
                  sftp.status(reqid, 4);
                });

                sftp.on('SETSTAT', (reqid: number, _p: string, _attrs: any) => {
                  // silently accept basic metadata updates
                  sftp.status(reqid, 0);
                });
              });
            });
          })
          .on('end', () => {})
          .on('close', () => {})
          .on('error', (_e: any) => {});
      },
    );
    server.listen(SFTP_PORT, '0.0.0.0', () => {
      console.log(`SFTP server listening on 0.0.0.0:${SFTP_PORT} (username: server-<id>, password: [SFTP_PASSWORD])`);
    });
  }).catch((e) => {
    console.error('SFTP host key generation failed:', e?.message || e);
  });
}

// removed duplicate bootstrap/start; see unified bootstrap at end of file

async function startHeartbeat() {
  try {
    const nodeIdPath = path.join(CERTS_DIR, 'nodeId');
    const noncePath = path.join(CERTS_DIR, 'nonce');
    if (!fs.existsSync(nodeIdPath) || !fs.existsSync(noncePath)) return;
    let nodeId = Number(fs.readFileSync(nodeIdPath, 'utf8').trim());
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
        if (!res.ok) {
          // If backend reports invalid node or signature failure, attempt re-registration
          const txt = await res.text();
          if (/invalid node/i.test(txt) || /signature/i.test(txt)) {
            console.warn('Heartbeat rejected by backend, attempting re-registration...');
            await performRegistration(false);
            // Reload nodeId/nonce after registration
            try {
              nodeId = Number(fs.readFileSync(nodeIdPath, 'utf8').trim());
              nonce = fs.readFileSync(noncePath, 'utf8').trim();
            } catch {}
          }
          return;
        }
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
  startSftpServer();
  startHeartbeat();
})();