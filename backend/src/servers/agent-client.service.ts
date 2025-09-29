import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import * as fs from 'fs';

function loadPEM(value?: string) {
  if (!value) return undefined;
  if (fs.existsSync(value)) {
    return fs.readFileSync(value);
  }
  try {
    const buf = Buffer.from(value, 'base64');
    if (buf.toString('utf8').includes('-----BEGIN')) return buf;
  } catch {}
  return Buffer.from(value, 'utf8');
}

function getTimeoutMs(): number {
  const v = Number(process.env.AGENT_HTTP_TIMEOUT_MS || '');
  if (Number.isFinite(v) && v >= 5000 && v <= 300000) return v;
  // Default to 60s to accommodate first-time image pulls on small nodes
  return 60000;
}

@Injectable()
export class AgentClientService {
  private readonly logger = new Logger(AgentClientService.name);
  private clients: Map<string, AxiosInstance> = new Map();

  private getClient(baseURL?: string): AxiosInstance {
    const url = baseURL || process.env.DAEMON_URL || '';
    const cached = this.clients.get(url);
    if (cached) return cached;

    const ca = loadPEM(process.env.DAEMON_CA);
    const cert = loadPEM(process.env.DAEMON_CLIENT_CERT);
    const key = loadPEM(process.env.DAEMON_CLIENT_KEY);

    if (!url || !ca || !cert || !key) {
      this.logger.warn('DAEMON_URL/DAEMON_CA/DAEMON_CLIENT_CERT/DAEMON_CLIENT_KEY not fully configured. Agent calls will be skipped.');
      const dummy = axios.create();
      this.clients.set(url, dummy);
      return dummy;
    }

    const skipHostname = (process.env.AGENT_SKIP_HOSTNAME_VERIFY || 'false') === 'true';

    const agent = new https.Agent({
      ca,
      cert,
      key,
      rejectUnauthorized: true,
      // In development, allow certificate CN/SAN hostname mismatch while still verifying CA
      ...(skipHostname
        ? {
            checkServerIdentity: () => undefined,
          }
        : {}),
    } as https.AgentOptions);

    const headers: Record<string, string> = {};
    if (process.env.AGENT_API_KEY) {
      headers['x-panel-api-key'] = process.env.AGENT_API_KEY;
    }

    const client = axios.create({ baseURL: url, httpsAgent: agent, timeout: getTimeoutMs(), headers });
    this.clients.set(url, client);
    return client;
  }

  async provision(baseURL: string | undefined, data: { serverId: number; name: string; image?: string; cpu?: number; ramMB?: number }) {
    try {
      const res = await this.getClient(baseURL).post('/provision', data);
      return res.data;
    } catch (e: any) {
      this.logger.warn(`Provision failed for server ${data.serverId}: ${e?.message || e}`);
      throw e;
    }
  }

  async start(baseURL: string | undefined, serverId: number) {
    try {
      const res = await this.getClient(baseURL).post(`/start/${serverId}`);
      return res.data;
    } catch (e: any) {
      this.logger.warn(`Start failed for server ${serverId}: ${e?.message || e}`);
      throw e;
    }
  }

  async stop(baseURL: string | undefined, serverId: number) {
    try {
      const res = await this.getClient(baseURL).post(`/stop/${serverId}`);
      return res.data;
    } catch (e: any) {
      this.logger.warn(`Stop failed for server ${serverId}: ${e?.message || e}`);
      throw e;
    }
  }

  async restart(baseURL: string | undefined, serverId: number) {
    try {
      const res = await this.getClient(baseURL).post(`/restart/${serverId}`);
      return res.data;
    } catch (e: any) {
      this.logger.warn(`Restart failed for server ${serverId}: ${e?.message || e}`);
      throw e;
    }
  }

  async delete(baseURL: string | undefined, serverId: number) {
    try {
      const res = await this.getClient(baseURL).delete(`/delete/${serverId}`);
      return res.data;
    } catch (e: any) {
      this.logger.warn(`Delete failed for server ${serverId}: ${e?.message || e}`);
      throw e;
    }
  }

  async inventory(baseURL: string | undefined): Promise<{ containers: Array<{ id: string; name: string; serverId?: number; running: boolean }> }> {
    const res = await this.getClient(baseURL).get('/inventory');
    return res.data;
  }
}