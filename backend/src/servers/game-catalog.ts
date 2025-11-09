import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export type GamePort = { name: string; containerPort: number; protocol: 'tcp' | 'udp' };
export type GameEntry = {
  id: string;
  name: string;
  provider: 'srds_runner' | 'docker';
  image?: string;              // for provider=docker
  appId?: number;              // for provider=srds_runner
  defaultBranch?: string;      // e.g., 'public' or 'x86-64'
  ports: GamePort[];
  defaults?: {
    args?: string[];
    env?: Record<string, string>;
  };
  notes?: string;
};

export class GameCatalog {
  private byId = new Map<string, GameEntry>();

  static load(catalogPath?: string): GameCatalog {
    const self = new GameCatalog();
    const candidates = [
      catalogPath,
      process.env.GAME_CATALOG_PATH,
      path.join(process.cwd(), 'config', 'games.yml'),
      path.join(process.cwd(), 'dist', 'config', 'games.yml'),
      path.join(process.cwd(), 'backend', 'config', 'games.yml'),
    ].filter(Boolean) as string[];
    for (const file of candidates) {
      try {
        if (!fs.existsSync(file)) continue;
        const text = fs.readFileSync(file, 'utf8');
        const doc = yaml.load(text) as any;
        const items: GameEntry[] = Array.isArray(doc) ? doc : (Array.isArray(doc?.games) ? doc.games : []);
        for (const it of items) {
          if (it && typeof it.id === 'string') {
            self.byId.set(it.id, it as GameEntry);
          }
        }
        // Loaded from first available file
        return self;
      } catch {
        continue;
      }
    }
    return self;
  }

  get(id: string): GameEntry | undefined {
    return this.byId.get(id);
  }
}