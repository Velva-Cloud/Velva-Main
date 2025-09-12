import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import * as fs from 'fs';

function loadPEM(value?: string) {
  if (!value) return undefined;
  // If looks like a path and exists, read it; else treat as raw PEM/base64
  if (fs.existsSync(value)) {
    return fs.readFileSync(value);
  }
  // Try base64
  try {
    const buf = Buffer.from(value, 'base64');
    // If it decodes to something that looks like PEM, use it; else return original
    if (buf.toString('utf8').includes('-----BEGIN')) return buf;
  } catch {
    // ignore
  }
  return Buffer.from(value, 'utf8');
}

@Injectable()
export class AgentClientService {
  private readonly logger = new Logger(AgentClientService.name);
  private client: AxiosInstance | null = null;

  private getClient(): AxiosInstance {
    if (this.client) return this.client;
    const baseURL = process.env.DAEMON_URL;
    const ca = loadPEM(process.env.DAEMON_CA);
    const cert = loadPEM(process.env.DAEMON_CLIENT_CERT);
    const key = loadPEM(process.env.DAEMON_CLIENT_KEY);

    if (!baseURL || !ca || !cert || !key) {
      this.logger.warn('DAEMON_URL/DAEMON_CA/DAEMON_CLIENT_CERT/DAEMON_CLIENT_KEY not fully configured. Agent calls will be skipped.');
      // Create a dummy client pointing nowhere to avoid null checks
      this.client = axios.create();
      return this.client;
    }

    const agent = new https.Agent({
      ca,
      cert,
      key,
      rejectUnauthorized: true,
    });

    this.client = axios.create({ baseURL, httpsAgent: agent, timeout: 15000 });
    return this.client;
  }

  async provision(data: { serverId: number; name: string; image?: string; cpu?: number; ramMB?: number }) {
    try {
      const res = await this.getClient().post('/provision', data);
      return res.data;
    } catch (e: any) {
      this.logger.warn(`Provision failed for server ${data.serverId}: ${e?.message || e}`);
      throw e;
    }
  }

  async start(serverId: number) {
    try {
      const res = await this.getClient().post(`/start/${serverId}`);
      return res.data;
    } catch (e: any) {
      this.logger.warn(`Start failed for server ${serverId}: ${e?.message || e}`);
      throw e;
    }
  }

  async stop(serverId: number) {
    try {
      const res = await this.getClient().post(`/stop/${serverId}`);
      return res.data;
    } catch (e: any) {
      this.logger.warn(`Stop failed for server ${serverId}: ${e?.message || e}`);
      throw e;
    }
  }

  async restart(serverId: number) {
    try {
      const res = await this.getClient().post(`/restart/${serverId}`);
      return res.data;
    } catch (e: any) {
      this.logger.warn(`Restart failed for server ${serverId}: ${e?.message || e}`);
      throw e;
    }
  }

  async delete(serverId: number) {
    try {
      const res = await this.getClient().delete(`/delete/${serverId}`);
      return res.data;
    } catch (e: any) {
      this.logger.warn(`Delete failed for server ${serverId}: ${e?.message || e}`);
      throw e;
    }
  }
}