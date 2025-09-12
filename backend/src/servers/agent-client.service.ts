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

    const agent = new https.Agent({ ca, cert, key, rejectUnauthorized: true });
    const client = axios.create({ baseURL: url, httpsAgent: agent, timeout: 15000 });
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
}