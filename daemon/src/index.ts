import express from 'express';
import * as fs from 'fs';
import * as https from 'https';
import Docker from 'dockerode';

const docker = new Docker({ socketPath: process.env.DOCKER_SOCK || '/var/run/docker.sock' });

const app = express();
app.use(express.json());

// Simple mTLS auth: require client cert and ensure it's authorized
function requireMTLS(req: any, res: any, next: any) {
  const cert = req.socket.getPeerCertificate();
  if (!req.client.authorized || !cert) {
    return res.status(401).json({ error: 'mTLS required' });
  }
  next();
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, version: '0.1.0' });
});

app.get('/metrics', requireMTLS, async (_req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    res.json({
      containers: containers.length,
      running: containers.filter(c => c.State === 'running').length,
      images: (await docker.listImages()).length,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

function nameFor(id: number) {
  return `vc-server-${id}`;
}

// Provision container but do not start
app.post('/provision', requireMTLS, async (req, res) => {
  const { serverId, name, image = 'nginx:alpine', cpu, ramMB } = req.body || {};
  if (!serverId || !name) return res.status(400).json({ error: 'serverId and name required' });

  try {
    // pull image if not present
    await new Promise((resolve, reject) => {
      docker.pull(image, (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err2) => (err2 ? reject(err2) : resolve(null)));
      });
    });

    const container = await docker.createContainer({
      name: nameFor(serverId),
      Image: image,
      Tty: true,
      HostConfig: {
        NanoCpus: typeof cpu === 'number' ? Math.max(0, Math.floor(cpu * 1e9)) : undefined, // approximate
        Memory: typeof ramMB === 'number' ? ramMB * 1024 * 1024 : undefined,
        RestartPolicy: { Name: 'unless-stopped' },
      },
      Env: [
        `VC_SERVER_ID=${serverId}`,
        `VC_NAME=${name}`,
      ],
      Cmd: ['/bin/sh', '-lc', 'echo "Server container ready"; tail -f /dev/null'],
    });

    res.json({ containerId: container.id });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post('/start/:id', requireMTLS, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const container = docker.getContainer(nameFor(id));
    await container.start().catch(async (e) => {
      if (e.statusCode === 404) {
        return res.status(404).json({ error: 'container not found' });
      }
      throw e;
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post('/stop/:id', requireMTLS, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const container = docker.getContainer(nameFor(id));
    await container.stop({ t: 10 }).catch(async (e) => {
      if (e.statusCode === 304) return; // already stopped
      if (e.statusCode === 404) {
        return res.status(404).json({ error: 'container not found' });
      }
      throw e;
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post('/restart/:id', requireMTLS, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const container = docker.getContainer(nameFor(id));
    await container.restart();
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.delete('/delete/:id', requireMTLS, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const container = docker.getContainer(nameFor(id));
    await container.remove({ force: true });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

const PORT = Number(process.env.DAEMON_PORT || 9443);

// TLS setup
const cert = process.env.DAEMON_TLS_CERT && fs.existsSync(process.env.DAEMON_TLS_CERT) ? fs.readFileSync(process.env.DAEMON_TLS_CERT) : Buffer.from(process.env.DAEMON_TLS_CERT || '', 'utf8');
const key = process.env.DAEMON_TLS_KEY && fs.existsSync(process.env.DAEMON_TLS_KEY) ? fs.readFileSync(process.env.DAEMON_TLS_KEY) : Buffer.from(process.env.DAEMON_TLS_KEY || '', 'utf8');
const ca = process.env.DAEMON_TLS_CA && fs.existsSync(process.env.DAEMON_TLS_CA) ? fs.readFileSync(process.env.DAEMON_TLS_CA) : Buffer.from(process.env.DAEMON_TLS_CA || '', 'utf8');

if (!cert || !key || !ca || (cert.length === 0 || key.length === 0 || ca.length === 0)) {
  console.error('TLS certificates not configured. Please set DAEMON_TLS_CERT, DAEMON_TLS_KEY, DAEMON_TLS_CA.');
  process.exit(1);
}

const server = https.createServer(
  { cert, key, ca, requestCert: true, rejectUnauthorized: true },
  app,
);

server.listen(PORT, () => {
  console.log(`Daemon listening on https://0.0.0.0:${PORT} (mTLS required)`);
});