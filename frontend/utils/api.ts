import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || '/api',
  withCredentials: true,
});

export default api;

export type CatalogGame = {
  id: string;
  name: string;
  provider: 'srds_runner' | 'docker';
  image?: string;
  appId?: number;
  defaultBranch?: string;
  ports: Array<{ name: string; containerPort: number; protocol: 'tcp' | 'udp' }>;
  defaults?: { args?: string[]; env?: Record<string, string> };
  notes?: string;
};