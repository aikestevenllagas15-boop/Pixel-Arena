export type GameModeId = 'ffa' | 'tdm' | 'bomb' | 'territory' | 'survival' | 'classic' | 'coop';

export type TeamId = 'blue' | 'red';

export type RoomStatus = 'lobby' | 'playing' | 'ended';

export interface ArenaMapInfo {
  id: number;
  name: string;
  subtitle: string;
  accent: string;
  bound: number;
  isBig?: boolean;
}

export interface WeaponInfo {
  id: number;
  name: string;
  shortName: string;
  cooldownMs: number;
  damage: number;
  headMult: number;
  tracerColor: string;
}

export interface ModeInfo {
  id: GameModeId;
  name: string;
  tag: string;
  subtitle: string;
  accent: string;
  defaultScoreLimit: number;
  bigMapsOnly?: boolean;
  survivalOnly?: boolean;
  teamBased?: boolean;
  coop?: boolean;
}

export interface RemotePlayerState {
  id: string;
  name: string;
  team: TeamId;
  isHost: boolean;
  ready: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  weaponId: number;
  ads: boolean;
  crouching: boolean;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  alive: boolean;
  kills: number;
  deaths: number;
  score: number;
  shotsFired?: number;
  shotsHit?: number;
  headshots?: number;
  damageDealt?: number;
  respawnAt: number | null;
  connected?: boolean;
  talking?: boolean;
}

export interface RoomConfig {
  name: string;
  isPublic: boolean;
  mode: GameModeId;
  mapId: number;
  maxPlayers: number;
  scoreLimit: number;
  botCount: number;
  friendlyFire: boolean;
  hideBotsInPvp: boolean;
}

export interface RoomSnapshot {
  code: string;
  hostId: string;
  status: RoomStatus;
  config: RoomConfig;
  players: RemotePlayerState[];
  teamScores: {
    blue: number;
    red: number;
  };
  winner: {
    type: 'player' | 'team' | 'draw';
    id: string;
    label: string;
  } | null;
  roundNumber?: number;
  roundWinner?: TeamId | null;
  nextRoundAt?: number | null;
  startedAt: number | null;
  serverTime: number;
}

export interface PublicRoomSummary {
  code: string;
  name: string;
  mode: GameModeId;
  mapId: number;
  status: RoomStatus;
  playerCount: number;
  maxPlayers: number;
  hostName: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  team: TeamId;
  text: string;
  timestamp: number;
  system?: boolean;
}

export interface KillFeedItem {
  id: string;
  killerId: string;
  killerName: string;
  killerTeam: TeamId;
  victimId: string;
  victimName: string;
  victimTeam: TeamId;
  weaponId: number;
  headshot: boolean;
  timestamp: number;
}

export interface TracerFxEvent {
  shooterId: string;
  weaponId: number;
  origin: [number, number, number];
  hitPoint: [number, number, number];
  tracerColor: string;
}

export interface DamageEvent {
  attackerId: string;
  attackerName: string;
  targetId: string;
  damage: number;
  headshot: boolean;
  hp: number;
  shield: number;
  weaponId: number;
}

export const ARENA_MAPS: ArenaMapInfo[] = [
  {
    id: 1,
    name: 'CYBER ARENA',
    subtitle: 'Close-quarters neon grid with gantry arches & energy pylons',
    accent: '#19e6ff',
    bound: 29.5,
  },
  {
    id: 2,
    name: 'NEON DISTRICT',
    subtitle: 'Industrial blocks, double containers & rooftop beacons',
    accent: '#ff7a2b',
    bound: 54.5,
  },
  {
    id: 3,
    name: 'DESERT OUTPOST',
    subtitle: 'Sunlit canyon compound with radar tower & sandbag bunkers',
    accent: '#ffcf40',
    bound: 39.5,
  },
  {
    id: 9,
    name: 'IRON HARBOR',
    subtitle: 'Open-water cargo port with moored barges, twin piers & gantry cranes',
    accent: '#38bdf8',
    bound: 68,
    isBig: true,
  },
  {
    id: 10,
    name: 'AERO CITADEL',
    subtitle: 'Active strike airfield with jets, hangars & VTOL runway',
    accent: '#39e58c',
    bound: 72,
    isBig: true,
  },
  {
    id: 11,
    name: 'VERDANT BASTION',
    subtitle: 'Emerald canyon forge with hydraulic presses & gyro reactor',
    accent: '#ff9a2b',
    bound: 70,
    isBig: true,
  },
  {
    id: 12,
    name: 'MEGA WARZONE',
    subtitle: 'All 6 arenas fused into one colossal 240x240 battleground',
    accent: '#ff3b5c',
    bound: 120,
    isBig: true,
  },
];

export const GAME_MODES: ModeInfo[] = [
  {
    id: 'ffa',
    name: 'FREE-FOR-ALL PVP',
    tag: 'UP TO 12P',
    subtitle: 'Every operative for themselves · Fast respawn · First to kill limit wins',
    accent: '#19e6ff',
    defaultScoreLimit: 15,
  },
  {
    id: 'tdm',
    name: 'DEATHMATCH',
    tag: 'BLUE VS RED',
    subtitle: 'Rapid-respawn 5v5 squad firefight · Coordinate & dominate',
    accent: '#ff3b5c',
    defaultScoreLimit: 25,
    teamBased: true,
  },
  {
    id: 'bomb',
    name: 'BOMB MODE',
    tag: 'TACTICAL 5V5',
    subtitle: 'Plant or defuse at Site A / B with live squad PvP combat',
    accent: '#ffcf40',
    defaultScoreLimit: 15,
    teamBased: true,
  },
  {
    id: 'territory',
    name: 'TERRITORY CAPTURE',
    tag: 'BIG MAPS ONLY',
    subtitle: '6v6 Domination over 3 circles (A, B, C) · Big maps only',
    accent: '#39e58c',
    defaultScoreLimit: 25,
    bigMapsOnly: true,
    teamBased: true,
  },
  {
    id: 'survival',
    name: 'SURVIVAL ROYALE',
    tag: 'BATTLE ROYALE',
    subtitle: 'Last one standing · Loot, shrinking zone & Mega Warzone · 1 life',
    accent: '#ff9a2b',
    defaultScoreLimit: 1,
    bigMapsOnly: true,
    survivalOnly: true,
  },
  {
    id: 'classic',
    name: 'CLASSIC 5V5',
    tag: 'FIRST TO 5',
    subtitle: '5v5 no-respawn rounds · Wipe out enemy team to score · First team to 5 points wins',
    accent: '#38bdf8',
    defaultScoreLimit: 5,
    teamBased: true,
  },
];

export const WEAPONS: WeaponInfo[] = [
  { id: 0, name: 'PULSE CARBINE', shortName: 'CARBINE', cooldownMs: 95, damage: 20, headMult: 2.1, tracerColor: '#8ff3ff' },
  { id: 1, name: 'SCATTER BLASTER', shortName: 'SHOTGUN', cooldownMs: 520, damage: 52, headMult: 1.5, tracerColor: '#ffd480' },
  { id: 2, name: 'RAIL CANNON', shortName: 'RAILGUN', cooldownMs: 700, damage: 68, headMult: 2.0, tracerColor: '#f472ff' },
  { id: 3, name: 'VIPER PISTOL', shortName: 'PISTOL', cooldownMs: 180, damage: 26, headMult: 2.0, tracerColor: '#ffe999' },
  { id: 4, name: 'LONGSHOT SNIPER', shortName: 'SNIPER', cooldownMs: 1050, damage: 85, headMult: 2.2, tracerColor: '#99f6ff' },
  { id: 5, name: 'ARC KNIFE', shortName: 'KNIFE', cooldownMs: 420, damage: 55, headMult: 1.5, tracerColor: '#39e58c' },
];

export function isMapCompatibleWithMode(mapId: number, mode: GameModeId): boolean {
  const map = getMapById(mapId);
  if (mode === 'survival') return Boolean(map.isBig);
  if (mode === 'territory') return Boolean(map.isBig) && map.id !== 12;
  return map.id !== 12;
}

export function getDefaultMapForMode(mode: GameModeId): number {
  if (mode === 'survival') return 12;
  if (mode === 'territory') return 9;
  return 1;
}

export function isTeamMode(mode: GameModeId): boolean {
  return mode === 'tdm' || mode === 'bomb' || mode === 'territory' || mode === 'classic';
}

export function isRoundEliminationMode(mode: GameModeId): boolean {
  return mode === 'classic';
}

export function isCoopMode(mode: GameModeId): boolean {
  return mode === 'coop';
}

export function getMapById(mapId: number): ArenaMapInfo {
  return ARENA_MAPS.find((m) => m.id === mapId) ?? ARENA_MAPS[0];
}

export function getModeById(modeId: GameModeId): ModeInfo {
  if (modeId === 'coop') {
    return GAME_MODES.find((m) => m.id === 'classic') ?? GAME_MODES[0];
  }
  return GAME_MODES.find((m) => m.id === modeId) ?? GAME_MODES[0];
}

export function getWeaponById(weaponId: number): WeaponInfo {
  return WEAPONS.find((w) => w.id === weaponId) ?? WEAPONS[0];
}
