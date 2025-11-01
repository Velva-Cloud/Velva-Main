/**
 * Port policy scaffold: defines host port ranges and contiguous allocation requirements per image family.
 * Internal container ports remain the game's defaults. The daemon should honor the hostPortPolicy hints.
 */

export type Protocol = 'tcp' | 'udp' | 'mixed';

export type HostPortPolicy = {
  hostRange: [number, number];
  contiguous?: number; // number of contiguous host ports required per server (e.g., Valheim needs 3)
  protocol: Protocol; // predominant protocol or 'mixed'
};

/**
 * Return recommended internal ports for a given image (container-side).
 * These defaults are used when plan.resources.exposePorts isn't set.
 */
export function getInternalPorts(image: string): Array<{ port: number; protocol: 'tcp' | 'udp' }> {
  const img = (image || '').toLowerCase();

  // Minecraft (Java)
  if (img.includes('itzg/minecraft-server')) {
    return [{ port: 25565, protocol: 'tcp' }];
  }
  // Minecraft (Bedrock)
  if (img.includes('itzg/minecraft-bedrock-server')) {
    return [{ port: 19132, protocol: 'udp' }];
  }
  // SRCDS family
  if (img.includes('cm2network/csgo')) return [{ port: 27015, protocol: 'udp' }];
  if (img.includes('cm2network/counter-strike')) return [{ port: 27015, protocol: 'udp' }];
  if (img.includes('cm2network/tf2')) return [{ port: 27015, protocol: 'udp' }];
  if (img.includes('cm2network/gmod')) return [{ port: 27015, protocol: 'udp' }];
  if (img.includes('cm2network/l4d2')) return [{ port: 27015, protocol: 'udp' }];

  // Rust
  if (img.includes('didstopia/rust-server')) {
    return [
      { port: 28015, protocol: 'udp' }, // game
      { port: 28016, protocol: 'tcp' }, // rcon
    ];
  }
  // Valheim
  if (img.includes('lloesche/valheim-server')) {
    return [
      { port: 2456, protocol: 'udp' },
      { port: 2457, protocol: 'udp' },
      { port: 2458, protocol: 'udp' },
    ];
  }
  // Factorio
  if (img.includes('factoriotools/factorio')) {
    return [{ port: 34197, protocol: 'udp' }];
  }
  // 7 Days to Die
  if (img.includes('didstopia/7dtd-server')) {
    return [
      { port: 26900, protocol: 'udp' }, // game
      { port: 8081, protocol: 'tcp' }, // telnet
    ];
  }
  // Project Zomboid
  if (img.includes('cyrinux/pzserver')) {
    // Base port; per-player ports are sequential after base, managed by the daemon via contiguous allocation
    return [{ port: 16261, protocol: 'udp' }];
  }
  // ARK
  if (img.includes('hermsi1337/ark-server')) {
    return [
      { port: 7777, protocol: 'udp' }, // game
      // query port often 27015/udp, rcon often 32330/tcp; leave to daemon if needed
    ];
  }
  // Terraria
  if (img.includes('beardedio/terraria')) {
    return [{ port: 7777, protocol: 'tcp' }];
  }
  // Palworld
  if (img.includes('thijsvanloef/palworld-server-docker')) {
    return [{ port: 8211, protocol: 'udp' }];
  }
  // V Rising
  if (img.includes('devidian/vrising-server')) {
    return [
      { port: 27015, protocol: 'udp' }, // query
      { port: 27016, protocol: 'udp' }, // game
    ];
  }
  // Satisfactory
  if (img.includes('wolveix/satisfactory-server')) {
    return [{ port: 7777, protocol: 'udp' }];
  }
  // Conan Exiles
  if (img.includes('notruffy/conanexiles')) {
    return [{ port: 7777, protocol: 'udp' }];
  }
  // Don't Starve Together
  if (img.includes('jammsen/docker-dontstarvetogether')) {
    // Typically managed via config files; no fixed port required here, leave empty or define as needed
    return [];
  }
  // Unturned
  if (img.includes('didstopia/unturned')) {
    return [{ port: 27015, protocol: 'udp' }];
  }
  // Eco
  if (img.includes('nicolas654/eco-server')) {
    return [{ port: 3000, protocol: 'tcp' }];
  }
  // Pavlov VR
  if (img.includes('cm2network/pavlov')) {
    return [{ port: 7000, protocol: 'udp' }];
  }
  // Mordhau
  if (img.includes('cm2network/mordhau')) {
    return [{ port: 7777, protocol: 'udp' }];
  }
  // Space Engineers via SteamCMD/WINE (generic)
  if (img.includes('ich777/steamcmd')) {
    // Let daemon manage based on GAME_ID; reserve block via policy below
    return [];
  }

  // Default: no explicit internal ports
  return [];
}

/**
 * Host port policy mapping per image family.
 * These ranges are suggestions the daemon should honor; backend passes them as hints.
 */
export function getHostPortPolicy(image: string): HostPortPolicy | undefined {
  const img = (image || '').toLowerCase();

  // Minecraft (Java)
  if (img.includes('itzg/minecraft-server')) {
    return { hostRange: [25000, 34999], protocol: 'tcp', contiguous: 1 };
  }
  // Minecraft (Bedrock)
  if (img.includes('itzg/minecraft-bedrock-server')) {
    return { hostRange: [35000, 35999], protocol: 'udp', contiguous: 1 };
  }
  // SRCDS family (CS:GO, TF2, GMod, L4D2)
  if (img.includes('cm2network/csgo') || img.includes('cm2network/counter-strike') || img.includes('cm2network/tf2') || img.includes('cm2network/gmod') || img.includes('cm2network/l4d2')) {
    return { hostRange: [36000, 39999], protocol: 'udp', contiguous: 1 };
  }
  // Rust
  if (img.includes('didstopia/rust-server')) {
    return { hostRange: [40000, 41999], protocol: 'mixed', contiguous: 1 };
  }
  // Valheim (needs 3 consecutive UDP ports)
  if (img.includes('lloesche/valheim-server')) {
    return { hostRange: [42000, 42999], protocol: 'udp', contiguous: 3 };
  }
  // Factorio
  if (img.includes('factoriotools/factorio')) {
    return { hostRange: [43000, 43999], protocol: 'udp', contiguous: 1 };
  }
  // 7 Days to Die (game UDP + telnet TCP)
  if (img.includes('didstopia/7dtd-server')) {
    return { hostRange: [44000, 45999], protocol: 'mixed', contiguous: 1 };
  }
  // Project Zomboid (base + per-player sequential UDP)
  if (img.includes('cyrinux/pzserver')) {
    return { hostRange: [46000, 46999], protocol: 'udp', contiguous: 10 }; // allocate at least 10 sequential ports per server as a baseline
  }
  // ARK
  if (img.includes('hermsi1337/ark-server')) {
    return { hostRange: [47000, 47999], protocol: 'mixed', contiguous: 1 };
  }
  // Terraria (TCP)
  if (img.includes('beardedio/terraria')) {
    return { hostRange: [48000, 48999], protocol: 'tcp', contiguous: 1 };
  }
  // Palworld (UDP)
  if (img.includes('thijsvanloef/palworld-server-docker')) {
    return { hostRange: [49000, 49999], protocol: 'udp', contiguous: 1 };
  }
  // V Rising (two UDP ports)
  if (img.includes('devidian/vrising-server')) {
    return { hostRange: [50000, 50999], protocol: 'udp', contiguous: 2 };
  }
  // Satisfactory
  if (img.includes('wolveix/satisfactory-server')) {
    return { hostRange: [51000, 51999], protocol: 'udp', contiguous: 1 };
  }
  // Conan Exiles
  if (img.includes('notruffy/conanexiles')) {
    return { hostRange: [52000, 52999], protocol: 'udp', contiguous: 1 };
  }
  // Eco (TCP)
  if (img.includes('nicolas654/eco-server')) {
    return { hostRange: [53000, 53999], protocol: 'tcp', contiguous: 1 };
  }
  // Pavlov VR
  if (img.includes('cm2network/pavlov')) {
    return { hostRange: [54000, 54999], protocol: 'udp', contiguous: 1 };
  }
  // Mordhau
  if (img.includes('cm2network/mordhau')) {
    return { hostRange: [55000, 55999], protocol: 'udp', contiguous: 1 };
  }
  // Space Engineers: reserve blocks of 5 contiguous ports
  if (img.includes('ich777/steamcmd')) {
    return { hostRange: [56000, 57999], protocol: 'mixed', contiguous: 5 };
  }

  return undefined;
}