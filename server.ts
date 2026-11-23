import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type { Request, Response } from 'express';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

type GameModeId = 'ffa' | 'tdm' | 'bomb' | 'territory' | 'survival' | 'classic' | 'coop';
type TeamId = 'blue' | 'red';
type RoomStatus = 'lobby' | 'playing' | 'ended';

interface WeaponSpec {
  id: number;
  name: string;
  cooldownMs: number;
  damage: number;
  headMult: number;
  maxRange: number;
  tracerColor: string;
}

const WEAPONS: WeaponSpec[] = [
  { id: 0, name: 'PULSE CARBINE', cooldownMs: 85, damage: 20, headMult: 2.1, maxRange: 220, tracerColor: '#8ff3ff' },
  { id: 1, name: 'SCATTER BLASTER', cooldownMs: 460, damage: 52, headMult: 1.5, maxRange: 48, tracerColor: '#ffd480' },
  { id: 2, name: 'RAIL CANNON', cooldownMs: 620, damage: 68, headMult: 2.0, maxRange: 300, tracerColor: '#f472ff' },
  { id: 3, name: 'VIPER PISTOL', cooldownMs: 160, damage: 26, headMult: 2.0, maxRange: 180, tracerColor: '#ffe999' },
  { id: 4, name: 'LONGSHOT SNIPER', cooldownMs: 920, damage: 85, headMult: 2.2, maxRange: 360, tracerColor: '#99f6ff' },
  { id: 5, name: 'ARC KNIFE', cooldownMs: 360, damage: 55, headMult: 1.5, maxRange: 4.5, tracerColor: '#39e58c' },
];

const VALID_MAP_IDS = new Set([1, 2, 3, 9, 10, 11, 12]);
const BIG_MAP_IDS = new Set([9, 10, 11, 12]);
const TERRITORY_MAP_IDS = new Set([9, 10, 11]);
const VALID_MODES = new Set<GameModeId>(['ffa', 'tdm', 'bomb', 'territory', 'survival', 'classic', 'coop']);

function isTeamPvpMode(mode: GameModeId): boolean {
  return mode === 'tdm' || mode === 'bomb' || mode === 'territory' || mode === 'classic';
}

function isRoundEliminationMode(mode: GameModeId): boolean {
  return mode === 'classic';
}

function isCoopMode(mode: GameModeId): boolean {
  return mode === 'coop';
}

function normalizeMapForMode(mapId: number, mode: GameModeId): number {
  if (!VALID_MAP_IDS.has(mapId)) {
    return mode === 'survival' ? 12 : mode === 'territory' ? 9 : 1;
  }
  if (mode === 'survival') {
    return BIG_MAP_IDS.has(mapId) ? mapId : 12;
  }
  if (mode === 'territory') {
    return TERRITORY_MAP_IDS.has(mapId) ? mapId : 9;
  }
  return mapId === 12 ? 9 : mapId;
}

interface PlayerRecord {
  id: string;
  token: string;
  ws: WebSocket;
  connected: boolean;
  talking: boolean;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  name: string;
  team: TeamId;
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
  shotsFired: number;
  shotsHit: number;
  headshots: number;
  damageDealt: number;
  respawnAt: number | null;
  lastShotAt: number;
  lastChatAt: number;
}

interface RoomConfig {
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

interface RoomRecord {
  code: string;
  hostId: string;
  status: RoomStatus;
  config: RoomConfig;
  players: Map<string, PlayerRecord>;
  teamScores: { blue: number; red: number };
  winner: { type: 'player' | 'team' | 'draw'; id: string; label: string } | null;
  roundNumber: number;
  roundWinner: TeamId | null;
  nextRoundAt: number | null;
  roundTimer: ReturnType<typeof setTimeout> | null;
  startedAt: number | null;
  createdAt: number;
}

interface ClientSession {
  playerId: string;
  roomCode: string | null;
  isAlive: boolean;
}

const rooms = new Map<string, RoomRecord>();
const sessions = new Map<WebSocket, ClientSession>();

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeText(raw: unknown, maxLen: number, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, maxLen);
}

function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) {
      code += alphabet[bytes[i] % alphabet.length];
    }
    if (!rooms.has(code)) return code;
  }
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastToRoom(room: RoomRecord, payload: unknown, excludePlayerId?: string): void {
  const raw = JSON.stringify(payload);
  for (const player of room.players.values()) {
    if (excludePlayerId && player.id === excludePlayerId) continue;
    if (player.ws.readyState === WebSocket.OPEN && player.ws.bufferedAmount < 65536) {
      player.ws.send(raw);
    }
  }
}

function serializeRoom(room: RoomRecord) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    config: room.config,
    players: Array.from(room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      isHost: p.id === room.hostId,
      ready: p.ready,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      pitch: p.pitch,
      weaponId: p.weaponId,
      ads: p.ads,
      crouching: p.crouching,
      hp: p.hp,
      maxHp: p.maxHp,
      shield: p.shield,
      maxShield: p.maxShield,
      alive: p.alive,
      kills: p.kills,
      deaths: p.deaths,
      score: p.score,
      shotsFired: p.shotsFired,
      shotsHit: p.shotsHit,
      headshots: p.headshots,
      damageDealt: p.damageDealt,
      respawnAt: p.respawnAt,
      connected: p.connected,
      talking: p.talking,
    })),
    teamScores: room.teamScores,
    winner: room.winner,
    roundNumber: room.roundNumber,
    roundWinner: room.roundWinner,
    nextRoundAt: room.nextRoundAt,
    startedAt: room.startedAt,
    serverTime: Date.now(),
  };
}

function broadcastRoomState(room: RoomRecord): void {
  broadcastToRoom(room, {
    type: 'room:state',
    room: serializeRoom(room),
  });
}

function emitSystemChat(room: RoomRecord, text: string): void {
  broadcastToRoom(room, {
    type: 'chat:message',
    message: {
      id: crypto.randomUUID(),
      senderId: 'system',
      senderName: 'ARENA HQ',
      team: 'blue',
      text,
      timestamp: Date.now(),
      system: true,
    },
  });
}

function pickBalancedTeam(room: RoomRecord): TeamId {
  if (isCoopMode(room.config.mode)) return 'blue';
  let blueCount = 0;
  let redCount = 0;
  for (const p of room.players.values()) {
    if (p.team === 'blue') blueCount++;
    else redCount++;
  }
  return blueCount <= redCount ? 'blue' : 'red';
}

function resetPlayerCombatStats(p: PlayerRecord): void {
  p.hp = 100;
  p.maxHp = 100;
  p.shield = 50;
  p.maxShield = 50;
  p.alive = true;
  p.kills = 0;
  p.deaths = 0;
  p.score = 0;
  p.shotsFired = 0;
  p.shotsHit = 0;
  p.headshots = 0;
  p.damageDealt = 0;
  p.respawnAt = null;
}

function removePlayerImmediately(room: RoomRecord, playerId: string, reason?: string): void {
  const leaving = room.players.get(playerId);
  if (!leaving) return;
  if (leaving.disconnectTimer) {
    clearTimeout(leaving.disconnectTimer);
    leaving.disconnectTimer = null;
  }
  room.players.delete(playerId);

  if (room.players.size === 0) {
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
    rooms.delete(room.code);
    return;
  }

  if (room.hostId === playerId) {
    const connectedNext = Array.from(room.players.values()).find((p) => p.connected);
    const nextHost = connectedNext ?? room.players.values().next().value;
    if (nextHost) {
      room.hostId = nextHost.id;
      nextHost.ready = true;
      emitSystemChat(room, `${nextHost.name} is now room host.`);
    }
  }

  emitSystemChat(room, `${leaving.name} left the arena${reason ? ` (${reason})` : ''}.`);

  if (room.status === 'playing' && room.config.mode === 'survival') {
    evaluateSurvivalWin(room);
  } else if (room.status === 'playing' && isRoundEliminationMode(room.config.mode)) {
    evaluateClassicRound(room);
  }

  broadcastRoomState(room);
}

function leaveCurrentRoom(ws: WebSocket, reason?: string, immediate = true): void {
  const session = sessions.get(ws);
  if (!session || !session.roomCode) return;

  const roomCode = session.roomCode;
  const room = rooms.get(roomCode);
  if (!room) {
    session.roomCode = null;
    return;
  }

  const leaving = room.players.get(session.playerId);
  if (!leaving) {
    session.roomCode = null;
    return;
  }

  // Only clean up if this ws is still the active socket for that player
  if (leaving.ws !== ws) {
    session.roomCode = null;
    return;
  }

  session.roomCode = null;

  if (immediate) {
    removePlayerImmediately(room, leaving.id, reason);
    return;
  }

  // Soft disconnect: hold slot & room for 45s so mobile app-switching / transient WS drops rejoin seamlessly
  leaving.connected = false;
  leaving.talking = false;
  if (leaving.disconnectTimer) clearTimeout(leaving.disconnectTimer);
  leaving.disconnectTimer = setTimeout(() => {
    const activeRoom = rooms.get(roomCode);
    if (!activeRoom) return;
    const rec = activeRoom.players.get(leaving.id);
    if (rec && !rec.connected) {
      removePlayerImmediately(activeRoom, rec.id, reason ?? 'disconnected');
    }
  }, 45000);
  broadcastRoomState(room);
}

function evaluateSurvivalWin(room: RoomRecord): void {
  if (room.status !== 'playing' || room.config.mode !== 'survival') return;
  const alivePlayers = Array.from(room.players.values()).filter((p) => p.alive);
  if (room.players.size >= 2 && alivePlayers.length <= 1) {
    room.status = 'ended';
    if (alivePlayers.length === 1) {
      const winner = alivePlayers[0];
      room.winner = {
        type: 'player',
        id: winner.id,
        label: `${winner.name} SURVIVES THE WARZONE`,
      };
    } else {
      room.winner = {
        type: 'draw',
        id: 'draw',
        label: 'MUTUAL ELIMINATION',
      };
    }
    emitSystemChat(room, `MATCH ENDED: ${room.winner.label}`);
    broadcastRoomState(room);
  }
}

function startNextClassicRound(room: RoomRecord): void {
  room.roundTimer = null;
  if (room.status !== 'playing' || !isRoundEliminationMode(room.config.mode)) return;

  room.roundNumber += 1;
  room.roundWinner = null;
  room.nextRoundAt = null;

  for (const p of room.players.values()) {
    p.alive = true;
    p.hp = p.maxHp;
    p.shield = p.maxShield;
    p.respawnAt = null;
  }

  emitSystemChat(
    room,
    `ROUND ${room.roundNumber} LIVE! (BLUE ${room.teamScores.blue} - ${room.teamScores.red} RED)`
  );
  broadcastToRoom(room, {
    type: 'round:started',
    roundNumber: room.roundNumber,
  });
  broadcastRoomState(room);
}

function evaluateClassicRound(room: RoomRecord, preferredWinner?: TeamId): void {
  if (room.status !== 'playing' || !isRoundEliminationMode(room.config.mode) || room.roundWinner !== null) {
    return;
  }

  const allPlayers = Array.from(room.players.values());
  const bluePlayers = allPlayers.filter((p) => p.team === 'blue');
  const redPlayers = allPlayers.filter((p) => p.team === 'red');
  if (bluePlayers.length === 0 || redPlayers.length === 0) return;

  const blueAlive = bluePlayers.filter((p) => p.alive).length;
  const redAlive = redPlayers.filter((p) => p.alive).length;
  if (blueAlive > 0 && redAlive > 0) return;

  let winningTeam: TeamId;
  if (blueAlive === 0 && redAlive > 0) {
    winningTeam = 'red';
  } else if (redAlive === 0 && blueAlive > 0) {
    winningTeam = 'blue';
  } else {
    winningTeam = preferredWinner ?? 'blue';
  }

  room.teamScores[winningTeam] += 1;
  room.roundWinner = winningTeam;

  const targetPoints = room.config.scoreLimit || 5;
  if (room.teamScores[winningTeam] >= targetPoints) {
    room.status = 'ended';
    room.nextRoundAt = null;
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
    const loserScore = winningTeam === 'blue' ? room.teamScores.red : room.teamScores.blue;
    room.winner = {
      type: 'team',
      id: winningTeam,
      label:
        winningTeam === 'blue'
          ? `BLUE SQUAD VICTORY (${targetPoints}-${loserScore})`
          : `RED SQUAD VICTORY (${targetPoints}-${loserScore})`,
    };
    emitSystemChat(room, `MATCH ENDED: ${room.winner.label}`);
    broadcastRoomState(room);
    return;
  }

  room.nextRoundAt = Date.now() + 3000;
  emitSystemChat(
    room,
    `ROUND ${room.roundNumber} WON BY ${winningTeam.toUpperCase()} SQUAD! Score: BLUE ${room.teamScores.blue} - ${room.teamScores.red} RED`
  );
  broadcastRoomState(room);

  if (room.roundTimer) clearTimeout(room.roundTimer);
  room.roundTimer = setTimeout(() => startNextClassicRound(room), 3000);
}

function checkWinCondition(room: RoomRecord, attacker: PlayerRecord): void {
  if (room.status !== 'playing') return;
  const limit = room.config.scoreLimit;

  if (isRoundEliminationMode(room.config.mode)) {
    evaluateClassicRound(room, attacker.team);
    return;
  }

  if (isTeamPvpMode(room.config.mode)) {
    if (room.teamScores[attacker.team] >= limit) {
      room.status = 'ended';
      room.winner = {
        type: 'team',
        id: attacker.team,
        label: attacker.team === 'blue' ? 'BLUE SQUAD VICTORY' : 'RED SQUAD VICTORY',
      };
      emitSystemChat(room, `MATCH ENDED: ${room.winner.label}`);
      broadcastRoomState(room);
    }
    return;
  }

  if (room.config.mode === 'ffa') {
    if (attacker.kills >= limit) {
      room.status = 'ended';
      room.winner = {
        type: 'player',
        id: attacker.id,
        label: `${attacker.name} WINS (${attacker.kills} KILLS)`,
      };
      emitSystemChat(room, `MATCH ENDED: ${room.winner.label}`);
      broadcastRoomState(room);
    }
    return;
  }

  if (room.config.mode === 'survival') {
    evaluateSurvivalWin(room);
  }
}

// Respawn ticker (runs every 400ms across active rooms; Survival & Classic rounds never mid-round respawn)
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (
      room.status !== 'playing' ||
      room.config.mode === 'survival' ||
      isRoundEliminationMode(room.config.mode)
    ) {
      continue;
    }
    let changed = false;
    for (const player of room.players.values()) {
      if (!player.alive && player.respawnAt !== null && now >= player.respawnAt) {
        player.alive = true;
        player.hp = player.maxHp;
        player.shield = player.maxShield;
        player.respawnAt = null;
        changed = true;
        broadcastToRoom(room, {
          type: 'player:respawned',
          playerId: player.id,
        });
      }
    }
    if (changed) {
      broadcastRoomState(room);
    }
  }
}, 400);

async function bootstrap() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req: Request, res: Response) => {
    let totalPlayers = 0;
    for (const room of rooms.values()) totalPlayers += room.players.size;
    res.json({
      ok: true,
      rooms: rooms.size,
      players: totalPlayers,
      uptime: Math.floor(process.uptime()),
    });
  });

  app.get('/api/rooms', (_req: Request, res: Response) => {
    const publicRooms = Array.from(rooms.values())
      .filter((r) => r.config.isPublic)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        code: r.code,
        name: r.config.name,
        mode: r.config.mode,
        mapId: r.config.mapId,
        status: r.status,
        playerCount: r.players.size,
        maxPlayers: r.config.maxPlayers,
        hostName: r.players.get(r.hostId)?.name ?? 'Host',
      }));
    res.json({ rooms: publicRooms });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  const server = http.createServer(app);
  server.on('connection', (socket) => {
    socket.setNoDelay(true);
  });
  const wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: false });

  // Stale socket heartbeat reaper (40s check)
  const heartbeatInterval = setInterval(() => {
    for (const ws of wss.clients) {
      const session = sessions.get(ws);
      if (!session) continue;
      if (!session.isAlive) {
        leaveCurrentRoom(ws, 'connection timeout', false);
        ws.terminate();
        continue;
      }
      session.isAlive = false;
      ws.ping();
    }
  }, 40000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  wss.on('connection', (ws: WebSocket) => {
    const playerId = crypto.randomUUID().slice(0, 12);
    sessions.set(ws, { playerId, roomCode: null, isAlive: true });

    sendJson(ws, {
      type: 'session:welcome',
      playerId,
      serverTime: Date.now(),
    });

    ws.on('pong', () => {
      const session = sessions.get(ws);
      if (session) session.isAlive = true;
    });

    ws.on('message', (raw) => {
      const session = sessions.get(ws);
      if (!session) return;
      session.isAlive = true;

      let msg: Record<string, unknown>;
      try {
        const str = typeof raw === 'string' ? raw : raw.toString('utf8');
        if (str.length > 8192) return;
        const parsed = JSON.parse(str);
        if (!parsed || typeof parsed !== 'object') return;
        msg = parsed as Record<string, unknown>;
      } catch {
        return;
      }

      const type = typeof msg.type === 'string' ? msg.type : '';

      if (type === 'ping') {
        sendJson(ws, { type: 'pong', ts: msg.ts });
        return;
      }

      if (type === 'room:create') {
        leaveCurrentRoom(ws, undefined, true);

        const playerName = sanitizeText(msg.playerName, 18, 'Operative');
        const token = sanitizeText(msg.token, 64, session.playerId);
        const rawConfig = (msg.config && typeof msg.config === 'object' ? msg.config : {}) as Record<string, unknown>;
        const mode: GameModeId = VALID_MODES.has(rawConfig.mode as GameModeId)
          ? (rawConfig.mode as GameModeId)
          : 'ffa';
        const mapId = normalizeMapForMode(Number(rawConfig.mapId), mode);

        const code = generateRoomCode();
        const defaultLimit =
          mode === 'classic'
            ? 5
            : mode === 'tdm' || mode === 'territory'
            ? 25
            : mode === 'survival'
            ? 1
            : isCoopMode(mode)
            ? 30
            : 15;
        const defaultBots = isCoopMode(mode) ? 6 : 0;
        const room: RoomRecord = {
          code,
          hostId: session.playerId,
          status: 'lobby',
          config: {
            name: sanitizeText(rawConfig.name, 28, `${playerName}'s Arena`),
            isPublic: rawConfig.isPublic !== false,
            mode,
            mapId,
            maxPlayers: mode === 'classic' ? 10 : clamp(rawConfig.maxPlayers, 2, 12, 10),
            scoreLimit: mode === 'classic' ? 5 : clamp(rawConfig.scoreLimit, 1, 100, defaultLimit),
            botCount: clamp(rawConfig.botCount, 0, 24, defaultBots),
            friendlyFire: Boolean(rawConfig.friendlyFire),
            hideBotsInPvp: rawConfig.hideBotsInPvp !== false,
          },
          players: new Map(),
          teamScores: { blue: 0, red: 0 },
          winner: null,
          roundNumber: 1,
          roundWinner: null,
          nextRoundAt: null,
          roundTimer: null,
          startedAt: null,
          createdAt: Date.now(),
        };

        const hostPlayer: PlayerRecord = {
          id: session.playerId,
          token,
          ws,
          connected: true,
          talking: false,
          disconnectTimer: null,
          name: playerName,
          team: 'blue',
          ready: true,
          x: 0,
          y: 0,
          z: 0,
          yaw: 0,
          pitch: 0,
          weaponId: 0,
          ads: false,
          crouching: false,
          hp: 100,
          maxHp: 100,
          shield: 50,
          maxShield: 50,
          alive: true,
          kills: 0,
          deaths: 0,
          score: 0,
          shotsFired: 0,
          shotsHit: 0,
          headshots: 0,
          damageDealt: 0,
          respawnAt: null,
          lastShotAt: 0,
          lastChatAt: 0,
        };

        room.players.set(hostPlayer.id, hostPlayer);
        rooms.set(code, room);
        session.roomCode = code;

        sendJson(ws, { type: 'room:joined', code, playerId: session.playerId });
        emitSystemChat(room, `${playerName} created room ${code}. Share the invite link with friends!`);
        broadcastRoomState(room);
        return;
      }

      if (type === 'room:rejoin') {
        const requestedCode = sanitizeText(msg.code, 12, '').toUpperCase();
        const token = sanitizeText(msg.token, 64, '');
        const room = rooms.get(requestedCode);
        if (!room || !token) {
          sendJson(ws, { type: 'room:rejoin_failed', code: requestedCode });
          return;
        }
        let existing: PlayerRecord | undefined;
        for (const p of room.players.values()) {
          if (p.token === token) {
            existing = p;
            break;
          }
        }
        if (!existing) {
          sendJson(ws, { type: 'room:rejoin_failed', code: requestedCode });
          return;
        }
        if (existing.disconnectTimer) {
          clearTimeout(existing.disconnectTimer);
          existing.disconnectTimer = null;
        }
        existing.ws = ws;
        existing.connected = true;
        if (typeof msg.playerName === 'string') {
          existing.name = sanitizeText(msg.playerName, 18, existing.name);
        }
        session.playerId = existing.id;
        session.roomCode = room.code;

        sendJson(ws, { type: 'session:welcome', playerId: existing.id, serverTime: Date.now() });
        sendJson(ws, { type: 'room:joined', code: room.code, playerId: existing.id });
        broadcastRoomState(room);
        return;
      }

      if (type === 'room:join') {
        const requestedCode = sanitizeText(msg.code, 12, '').toUpperCase();
        const playerName = sanitizeText(msg.playerName, 18, 'Operative');
        const token = sanitizeText(msg.token, 64, session.playerId);
        const room = rooms.get(requestedCode);

        if (!room) {
          sendJson(ws, { type: 'error', message: `Room "${requestedCode}" not found. Check the code or create a new room.` });
          return;
        }

        // Check if this browser tab already holds a slot in this room (e.g. reconnecting via invite URL)
        let existingByToken: PlayerRecord | undefined;
        for (const p of room.players.values()) {
          if (p.token === token) {
            existingByToken = p;
            break;
          }
        }
        if (existingByToken) {
          if (existingByToken.disconnectTimer) {
            clearTimeout(existingByToken.disconnectTimer);
            existingByToken.disconnectTimer = null;
          }
          existingByToken.ws = ws;
          existingByToken.connected = true;
          existingByToken.name = playerName;
          session.playerId = existingByToken.id;
          session.roomCode = room.code;
          sendJson(ws, { type: 'session:welcome', playerId: existingByToken.id, serverTime: Date.now() });
          sendJson(ws, { type: 'room:joined', code: room.code, playerId: existingByToken.id });
          broadcastRoomState(room);
          return;
        }

        if (room.players.size >= room.config.maxPlayers) {
          sendJson(ws, { type: 'error', message: `Room ${requestedCode} is full (${room.config.maxPlayers}/${room.config.maxPlayers}).` });
          return;
        }

        if (session.roomCode && session.roomCode !== requestedCode) {
          leaveCurrentRoom(ws, undefined, true);
        }

        const joiner: PlayerRecord = {
          id: session.playerId,
          token,
          ws,
          connected: true,
          talking: false,
          disconnectTimer: null,
          name: playerName,
          team: pickBalancedTeam(room),
          ready: room.status === 'playing',
          x: 0,
          y: 0,
          z: 0,
          yaw: 0,
          pitch: 0,
          weaponId: 0,
          ads: false,
          crouching: false,
          hp: 100,
          maxHp: 100,
          shield: 50,
          maxShield: 50,
          alive:
            room.status !== 'playing' ||
            (room.config.mode !== 'survival' && !isRoundEliminationMode(room.config.mode)),
          kills: 0,
          deaths: 0,
          score: 0,
          shotsFired: 0,
          shotsHit: 0,
          headshots: 0,
          damageDealt: 0,
          respawnAt: null,
          lastShotAt: 0,
          lastChatAt: 0,
        };

        room.players.set(joiner.id, joiner);
        session.roomCode = room.code;

        sendJson(ws, { type: 'room:joined', code: room.code, playerId: session.playerId });
        emitSystemChat(room, `${playerName} joined the squad.`);
        broadcastRoomState(room);
        return;
      }

      if (type === 'room:leave') {
        leaveCurrentRoom(ws, undefined, true);
        sendJson(ws, { type: 'room:left' });
        return;
      }

      // All following actions require an active room
      if (!session.roomCode) return;
      const room = rooms.get(session.roomCode);
      if (!room) {
        session.roomCode = null;
        return;
      }
      const actor = room.players.get(session.playerId);
      if (!actor) return;

      if (type === 'room:config') {
        if (room.hostId !== actor.id) return;
        const patch = (msg.config && typeof msg.config === 'object' ? msg.config : {}) as Record<string, unknown>;
        // botCount can be adjusted by host anytime (even live during a match)
        if (typeof patch.botCount === 'number') {
          room.config.botCount = clamp(patch.botCount, 0, 24, room.config.botCount);
          room.config.hideBotsInPvp = room.config.botCount === 0;
        }
        if (room.status !== 'playing') {
          if (typeof patch.name === 'string') {
            room.config.name = sanitizeText(patch.name, 28, room.config.name);
          }
          if (typeof patch.isPublic === 'boolean') {
            room.config.isPublic = patch.isPublic;
          }
          if (VALID_MODES.has(patch.mode as GameModeId)) {
            room.config.mode = patch.mode as GameModeId;
            room.config.mapId = normalizeMapForMode(room.config.mapId, room.config.mode);
            if (isCoopMode(room.config.mode)) {
              for (const p of room.players.values()) p.team = 'blue';
            } else if (isRoundEliminationMode(room.config.mode)) {
              room.config.maxPlayers = Math.max(room.players.size, 10);
              room.config.scoreLimit = 5;
              // Rebalance if one team has > 5 or everyone was stacked
              let b = 0;
              let r = 0;
              for (const p of room.players.values()) {
                if (p.team === 'blue') {
                  if (b < 5) b++;
                  else {
                    p.team = 'red';
                    r++;
                  }
                } else {
                  if (r < 5) r++;
                  else {
                    p.team = 'blue';
                    b++;
                  }
                }
              }
            }
          }
          if (typeof patch.mapId === 'number' && VALID_MAP_IDS.has(patch.mapId)) {
            room.config.mapId = normalizeMapForMode(patch.mapId, room.config.mode);
          }
          if (typeof patch.maxPlayers === 'number') {
            const cap = isRoundEliminationMode(room.config.mode) ? 10 : 12;
            room.config.maxPlayers = clamp(patch.maxPlayers, Math.max(2, room.players.size), cap, room.config.maxPlayers);
          }
          if (typeof patch.scoreLimit === 'number') {
            room.config.scoreLimit = isRoundEliminationMode(room.config.mode)
              ? 5
              : clamp(patch.scoreLimit, 1, 100, room.config.scoreLimit);
          }
          if (typeof patch.friendlyFire === 'boolean') {
            room.config.friendlyFire = patch.friendlyFire;
          }
          if (typeof patch.hideBotsInPvp === 'boolean') {
            room.config.hideBotsInPvp = patch.hideBotsInPvp;
          }
        }
        broadcastRoomState(room);
        return;
      }

      if (type === 'room:team') {
        if (isCoopMode(room.config.mode)) return;
        const nextTeam: TeamId = msg.team === 'red' ? 'red' : 'blue';
        if (isRoundEliminationMode(room.config.mode) && actor.team !== nextTeam) {
          let count = 0;
          for (const p of room.players.values()) {
            if (p.team === nextTeam) count++;
          }
          if (count >= 5) {
            sendJson(ws, {
              type: 'error',
              message: `${nextTeam === 'blue' ? 'Blue' : 'Red'} squad is already full (5/5).`,
            });
            return;
          }
        }
        actor.team = nextTeam;
        broadcastRoomState(room);
        return;
      }

      if (type === 'room:ready') {
        actor.ready = typeof msg.ready === 'boolean' ? msg.ready : !actor.ready;
        broadcastRoomState(room);
        return;
      }

      if (type === 'match:start' || type === 'match:restart') {
        if (room.hostId !== actor.id) return;
        if (room.roundTimer) {
          clearTimeout(room.roundTimer);
          room.roundTimer = null;
        }
        room.status = 'playing';
        room.startedAt = Date.now();
        room.teamScores = { blue: 0, red: 0 };
        room.winner = null;
        room.roundNumber = 1;
        room.roundWinner = null;
        room.nextRoundAt = null;
        for (const p of room.players.values()) {
          resetPlayerCombatStats(p);
          p.ready = true;
        }
        emitSystemChat(
          room,
          isRoundEliminationMode(room.config.mode)
            ? 'CLASSIC 5V5 ROUND 1 DEPLOYED! Wipe out the enemy team — first to 5 points wins!'
            : 'DEPLOYING TO ARENA!'
        );
        broadcastRoomState(room);
        broadcastToRoom(room, {
          type: 'match:deploy',
          mapId: room.config.mapId,
          mode: room.config.mode,
        });
        return;
      }

      if (type === 'match:lobby') {
        if (room.hostId !== actor.id) return;
        if (room.roundTimer) {
          clearTimeout(room.roundTimer);
          room.roundTimer = null;
        }
        room.status = 'lobby';
        room.winner = null;
        room.roundNumber = 1;
        room.roundWinner = null;
        room.nextRoundAt = null;
        for (const p of room.players.values()) {
          resetPlayerCombatStats(p);
          p.ready = p.id === room.hostId;
        }
        broadcastRoomState(room);
        return;
      }

      if (type === 'player:state') {
        const round3 = (n: number) => Math.round(n * 1000) / 1000;
        actor.x = round3(clamp(msg.x, -260, 260, actor.x));
        actor.y = round3(clamp(msg.y, -40, 180, actor.y));
        actor.z = round3(clamp(msg.z, -260, 260, actor.z));
        actor.yaw = round3(clamp(msg.yaw, -100, 100, actor.yaw));
        actor.pitch = round3(clamp(msg.pitch, -2, 2, actor.pitch));
        actor.weaponId = clamp(msg.weaponId, 0, WEAPONS.length - 1, actor.weaponId);
        actor.ads = Boolean(msg.ads);
        actor.crouching = Boolean(msg.crouching);

        broadcastToRoom(
          room,
          {
            type: 'player:pose',
            id: actor.id,
            x: actor.x,
            y: actor.y,
            z: actor.z,
            yaw: actor.yaw,
            pitch: actor.pitch,
            weaponId: actor.weaponId,
            ads: actor.ads,
            crouching: actor.crouching,
          },
          actor.id
        );
        return;
      }

      if (type === 'player:shoot') {
        if (room.status !== 'playing' || !actor.alive) return;
        actor.shotsFired += 1;
        const weaponId = clamp(msg.weaponId, 0, WEAPONS.length - 1, actor.weaponId);
        const weapon = WEAPONS[weaponId];
        const origin = Array.isArray(msg.origin) && msg.origin.length === 3
          ? [clamp(msg.origin[0], -260, 260, actor.x), clamp(msg.origin[1], -40, 180, actor.y + 1.5), clamp(msg.origin[2], -260, 260, actor.z)]
          : [actor.x, actor.y + 1.5, actor.z];
        const hitPoint = Array.isArray(msg.hitPoint) && msg.hitPoint.length === 3
          ? [clamp(msg.hitPoint[0], -350, 350, actor.x), clamp(msg.hitPoint[1], -100, 250, actor.y + 1.5), clamp(msg.hitPoint[2], -350, 350, actor.z)]
          : origin;

        broadcastToRoom(
          room,
          {
            type: 'fx:tracer',
            shooterId: actor.id,
            weaponId,
            origin,
            hitPoint,
            tracerColor: weapon.tracerColor,
          },
          actor.id
        );
        return;
      }

      if (type === 'player:hit') {
        if (room.status !== 'playing' || !actor.alive) return;
        if (isRoundEliminationMode(room.config.mode) && room.roundWinner !== null) return;
        const targetId = typeof msg.targetId === 'string' ? msg.targetId : '';
        const target = room.players.get(targetId);
        if (!target || !target.alive || target.id === actor.id) return;

        // Enforce team rules
        const sameTeam = actor.team === target.team;
        if ((isTeamPvpMode(room.config.mode) || isCoopMode(room.config.mode)) && sameTeam && !room.config.friendlyFire) {
          return;
        }

        const weaponId = clamp(msg.weaponId, 0, WEAPONS.length - 1, actor.weaponId);
        const weapon = WEAPONS[weaponId];
        const now = Date.now();
        if (now - actor.lastShotAt < weapon.cooldownMs * 0.72) {
          return;
        }
        actor.lastShotAt = now;

        // Distance sanity check
        const dx = target.x - actor.x;
        const dy = target.y - actor.y;
        const dz = target.z - actor.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > weapon.maxRange + 6) return;

        const headshot = Boolean(msg.headshot);
        const dmg = Math.round(weapon.damage * (headshot ? weapon.headMult : 1));
        actor.shotsHit += 1;
        if (headshot) actor.headshots += 1;
        actor.damageDealt += dmg;

        let remainingDmg = dmg;
        if (target.shield > 0) {
          const absorbed = Math.min(target.shield, remainingDmg);
          target.shield -= absorbed;
          remainingDmg -= absorbed;
        }
        if (remainingDmg > 0) {
          target.hp = Math.max(0, target.hp - remainingDmg);
        }

        broadcastToRoom(room, {
          type: 'player:damaged',
          event: {
            attackerId: actor.id,
            attackerName: actor.name,
            targetId: target.id,
            damage: dmg,
            headshot,
            hp: target.hp,
            shield: target.shield,
            weaponId,
          },
        });

        if (target.hp <= 0) {
          target.alive = false;
          target.deaths += 1;
          target.respawnAt =
            room.config.mode === 'survival' || isRoundEliminationMode(room.config.mode)
              ? null
              : now + 3200;

          actor.kills += 1;
          actor.score += headshot ? 125 : 100;
          if (isTeamPvpMode(room.config.mode) && !isRoundEliminationMode(room.config.mode)) {
            room.teamScores[actor.team] += 1;
          }

          broadcastToRoom(room, {
            type: 'player:eliminated',
            kill: {
              id: crypto.randomUUID(),
              killerId: actor.id,
              killerName: actor.name,
              killerTeam: actor.team,
              victimId: target.id,
              victimName: target.name,
              victimTeam: target.team,
              weaponId,
              headshot,
              timestamp: now,
            },
          });

          checkWinCondition(room, actor);
          broadcastRoomState(room);
        }
        return;
      }

      if (type === 'voice:state') {
        const nextTalking = Boolean(msg.talking);
        if (actor.talking !== nextTalking) {
          actor.talking = nextTalking;
          broadcastToRoom(room, {
            type: 'player:voice',
            id: actor.id,
            talking: actor.talking,
          });
        }
        return;
      }

      if (type === 'chat:send') {
        const now = Date.now();
        if (now - actor.lastChatAt < 350) return;
        actor.lastChatAt = now;

        const text = sanitizeText(msg.text, 180, '');
        if (!text) return;

        broadcastToRoom(room, {
          type: 'chat:message',
          message: {
            id: crypto.randomUUID(),
            senderId: actor.id,
            senderName: actor.name,
            team: actor.team,
            text,
            timestamp: now,
          },
        });
      }
    });

    ws.on('close', () => {
      leaveCurrentRoom(ws, 'disconnected', false);
      sessions.delete(ws);
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Pixel Arena Multiplayer server listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
