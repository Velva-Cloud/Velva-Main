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
      const status = e?.response?.status;
      const err = e?.response?.data?.error;
      if (status === 404 && err === 'container_not_found') {
        // Pass through a stable error for upstream logic
        throw new Error('container_not_found');
      }
      const detail = err ? ` (${err})` : '';
      this.logger.warn(`Start failed for server ${serverId}: ${e?.message || e}${detail}`);
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

  async platformUpdate(baseURL: string | undefined, includeDaemon = false) {
    const res = await this.getClient(baseURL).post('/platform/update', { includeDaemon });
    return res.data;
  }

  // Stream logs via SSE from agent to client response
  async streamLogs(baseURL: string | undefined, serverId: number, res: any) {
    const client = this.getClient(baseURL);
    const agentRes = await client.get(`/logs/${serverId}?follow=1&tail=200`, { responseType: 'stream' });
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    agentRes.data.pipe(res);
  }

  async exec(baseURL: string | undefined, serverId: number, cmd: string): Promise<{ ok: boolean; output: string }> {
    const res = await this.getClient(baseURL).post(`/exec/${serverId}`, { cmd });
    return res.data;
  }

  async fsList(baseURL: string | undefined, serverId: number, path: string) {
    const res = await this.getClient(baseURL).get(`/fs/${serverId}/list`, { params: { path } });
    return res.data;
  }

  async fsDownloadStream(
    baseURL: string | undefined,
    serverId: number,
    path: string,
  ): Promise<{ headers: Record<string, any>; stream: any }> {
    const res = await this.getClient(baseURL).get(`/fs/${serverId}/download`, {
      params: { path },
      responseType: 'stream',
    });
    // Avoid exposing Axios internal header types in declaration output
    const headers = res.headers as any;
    return { headers, stream: res.data as any };
  }

  async fsUpload(baseURL: string | undefined, serverId: number, dirPath: string, filename: string, content: Buffer) {
    // Minimal multipart body using form-data
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', content, { filename });
    const headers = form.getHeaders();
    const res = await this.getClient(baseURL).post(`/fs/${serverId}/upload`, form, {
      params: { path: dirPath },
      headers,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    return res.data;
  }

  async fsMkdir(baseURL: string | undefined, serverId: number, dirPath: string) {
    const res = await this.getClient(baseURL).post(`/fs/${serverId}/mkdir`, { path: dirPath });
    return res.data;
  }

  async fsDelete(baseURL: string | undefined, serverId: number, targetPath: string) {
    const res = await this.getClient(baseURL).post(`/fs/${serverId}/delete`, { path: targetPath });
    return res.data;
  }

  async fsRename(baseURL: string | undefined, serverId: number, from: string, to: string) {
    const res = await this.getClient(baseURL).post(`/fs/${serverId}/rename`, { from, to });
    return res.data;
  }
}