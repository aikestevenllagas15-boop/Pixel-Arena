import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChatMessage,
  DamageEvent,
  KillFeedItem,
  PublicRoomSummary,
  RoomConfig,
  RoomSnapshot,
  TeamId,
  TracerFxEvent,
} from '../types/multiplayer';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export interface LivePose {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  weaponId: number;
  ads: boolean;
  crouching: boolean;
}

export interface SocketEventHandlers {
  onPose?: (pose: LivePose) => void;
  onTracer?: (ev: TracerFxEvent) => void;
  onDamaged?: (ev: DamageEvent) => void;
  onEliminated?: (kill: KillFeedItem) => void;
  onRespawned?: (playerId: string) => void;
  onRoundStarted?: (roundNumber: number) => void;
  onDeploy?: (payload: { mapId: number; mode: string }) => void;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function getOrCreateClientToken(): string {
  try {
    const existing = sessionStorage.getItem('pa_mp_token');
    if (existing && existing.length >= 8) return existing;
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('pa_mp_token', generated);
    return generated;
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function useMultiplayerSocket(handlers: SocketEventHandlers) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [killFeed, setKillFeed] = useState<KillFeedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pingMs, setPingMs] = useState<number>(0);
  const [localTalking, setLocalTalking] = useState<boolean>(false);

  const clientTokenRef = useRef<string>(getOrCreateClientToken());
  const activeRoomCodeRef = useRef<string | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const lastPlayerNameRef = useRef<string>('Operative');
  const lastTalkingRef = useRef<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const lastPoseSentAtRef = useRef(0);
  const lastPosePayloadRef = useRef<Omit<LivePose, 'id'> | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);

  const sendRaw = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const refreshPublicRooms = useCallback(async () => {
    try {
      const res = await fetch('/api/rooms');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.rooms)) {
        setPublicRooms(data.rooms);
      }
    } catch {
      // Ignore transient fetch errors
    }
  }, []);

  useEffect(() => {
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setConnectionState('connecting');
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        setConnectionState('connected');
        setError(null);
        lastPosePayloadRef.current = null;

        if (activeRoomCodeRef.current) {
          sendRaw({
            type: 'room:rejoin',
            code: activeRoomCodeRef.current,
            token: clientTokenRef.current,
            playerName: lastPlayerNameRef.current,
          });
        }

        if (pingIntervalRef.current) window.clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = window.setInterval(() => {
          sendRaw({ type: 'ping', ts: Date.now() });
        }, 10000);
        sendRaw({ type: 'ping', ts: Date.now() });
      };

      ws.onmessage = (event) => {
        if (disposed) return;
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }

        const type = msg.type;
        if (type === 'player:pose' && typeof msg.id === 'string') {
          handlersRef.current.onPose?.({
            id: msg.id,
            x: Number(msg.x),
            y: Number(msg.y),
            z: Number(msg.z),
            yaw: Number(msg.yaw),
            pitch: Number(msg.pitch),
            weaponId: Number(msg.weaponId),
            ads: Boolean(msg.ads),
            crouching: Boolean(msg.crouching),
          });
          return;
        }

        if (type === 'session:welcome' && typeof msg.playerId === 'string') {
          playerIdRef.current = msg.playerId;
          setPlayerId(msg.playerId);
        } else if (type === 'pong' && typeof msg.ts === 'number') {
          setPingMs(Math.max(1, Date.now() - msg.ts));
        } else if (type === 'room:joined') {
          const joinedCode = typeof msg.code === 'string' ? msg.code : null;
          const isSameRoom = Boolean(joinedCode && activeRoomCodeRef.current === joinedCode);
          if (joinedCode) activeRoomCodeRef.current = joinedCode;
          if (typeof msg.playerId === 'string') {
            playerIdRef.current = msg.playerId;
            setPlayerId(msg.playerId);
          }
          lastPosePayloadRef.current = null;
          lastTalkingRef.current = false;
          setLocalTalking(false);
          setError(null);
          if (!isSameRoom) {
            setChatMessages([]);
            setKillFeed([]);
          }
        } else if (type === 'room:rejoin_failed') {
          activeRoomCodeRef.current = null;
          lastTalkingRef.current = false;
          setLocalTalking(false);
          setRoom(null);
          setChatMessages([]);
          setKillFeed([]);
          setError('Session expired while disconnected. Create or rejoin the room.');
        } else if (type === 'room:left') {
          activeRoomCodeRef.current = null;
          lastTalkingRef.current = false;
          setLocalTalking(false);
          setRoom(null);
          setChatMessages([]);
          setKillFeed([]);
        } else if (type === 'room:state' && msg.room) {
          const nextRoom = msg.room as RoomSnapshot;
          activeRoomCodeRef.current = nextRoom.code;
          setRoom(nextRoom);
        } else if (type === 'fx:tracer') {
          handlersRef.current.onTracer?.(msg as unknown as TracerFxEvent);
        } else if (type === 'player:damaged' && msg.event) {
          const ev = msg.event as DamageEvent;
          setRoom((prev) => {
            if (!prev) return prev;
            const idx = prev.players.findIndex((p) => p.id === ev.targetId);
            if (idx === -1) return prev;
            const players = prev.players.slice();
            players[idx] = {
              ...players[idx],
              hp: ev.hp,
              shield: ev.shield,
            };
            return { ...prev, players };
          });
          handlersRef.current.onDamaged?.(ev);
        } else if (type === 'player:eliminated' && msg.kill) {
          const kill = msg.kill as KillFeedItem;
          setKillFeed((prev) => [kill, ...prev].slice(0, 6));
          handlersRef.current.onEliminated?.(kill);
        } else if (type === 'player:respawned' && typeof msg.playerId === 'string') {
          lastPosePayloadRef.current = null;
          handlersRef.current.onRespawned?.(msg.playerId);
        } else if (type === 'round:started') {
          lastPosePayloadRef.current = null;
          handlersRef.current.onRoundStarted?.(Number(msg.roundNumber) || 1);
        } else if (type === 'match:deploy') {
          lastPosePayloadRef.current = null;
          handlersRef.current.onDeploy?.({
            mapId: Number(msg.mapId),
            mode: String(msg.mode),
          });
        } else if (type === 'player:voice' && typeof msg.id === 'string') {
          const talking = Boolean(msg.talking);
          if (msg.id === playerIdRef.current) {
            lastTalkingRef.current = talking;
            setLocalTalking(talking);
          }
          setRoom((prev) => {
            if (!prev) return prev;
            const idx = prev.players.findIndex((p) => p.id === msg.id);
            if (idx === -1) return prev;
            const players = prev.players.slice();
            players[idx] = { ...players[idx], talking };
            return { ...prev, players };
          });
        } else if (type === 'chat:message' && msg.message) {
          const message = msg.message as ChatMessage;
          setChatMessages((prev) => [...prev.slice(-59), message]);
        } else if (type === 'error' && typeof msg.message === 'string') {
          setError(msg.message);
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setConnectionState('disconnected');
        lastTalkingRef.current = false;
        setLocalTalking(false);
        if (pingIntervalRef.current) {
          window.clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = window.setTimeout(connect, 900);
      };
    };

    const onVisibilityOrOnline = () => {
      if (disposed || document.visibilityState === 'hidden') return;
      const ws = wsRef.current;
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
        connect();
      } else if (ws.readyState === WebSocket.OPEN) {
        sendRaw({ type: 'ping', ts: Date.now() });
        if (activeRoomCodeRef.current) {
          sendRaw({
            type: 'room:rejoin',
            code: activeRoomCodeRef.current,
            token: clientTokenRef.current,
            playerName: lastPlayerNameRef.current,
          });
        }
      }
    };

    window.addEventListener('online', onVisibilityOrOnline);
    document.addEventListener('visibilitychange', onVisibilityOrOnline);

    connect();
    refreshPublicRooms();

    return () => {
      disposed = true;
      window.removeEventListener('online', onVisibilityOrOnline);
      document.removeEventListener('visibilitychange', onVisibilityOrOnline);
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      if (pingIntervalRef.current) window.clearInterval(pingIntervalRef.current);
      wsRef.current?.close();
    };
  }, [refreshPublicRooms, sendRaw]);

  const createRoom = useCallback(
    (playerName: string, config: Partial<RoomConfig>) => {
      setError(null);
      lastPlayerNameRef.current = playerName;
      sendRaw({ type: 'room:create', playerName, token: clientTokenRef.current, config });
    },
    [sendRaw]
  );

  const joinRoom = useCallback(
    (code: string, playerName: string) => {
      setError(null);
      lastPlayerNameRef.current = playerName;
      sendRaw({
        type: 'room:join',
        code: code.trim().toUpperCase(),
        playerName,
        token: clientTokenRef.current,
      });
    },
    [sendRaw]
  );

  const leaveRoom = useCallback(() => {
    activeRoomCodeRef.current = null;
    lastTalkingRef.current = false;
    setLocalTalking(false);
    sendRaw({ type: 'room:leave' });
    setRoom(null);
    setChatMessages([]);
    setKillFeed([]);
  }, [sendRaw]);

  const updateRoomConfig = useCallback(
    (config: Partial<RoomConfig>) => {
      sendRaw({ type: 'room:config', config });
    },
    [sendRaw]
  );

  const switchTeam = useCallback(
    (team: TeamId) => {
      sendRaw({ type: 'room:team', team });
    },
    [sendRaw]
  );

  const toggleReady = useCallback(
    (ready?: boolean) => {
      sendRaw({ type: 'room:ready', ready });
    },
    [sendRaw]
  );

  const startMatch = useCallback(() => {
    sendRaw({ type: 'match:start' });
  }, [sendRaw]);

  const restartMatch = useCallback(() => {
    sendRaw({ type: 'match:restart' });
  }, [sendRaw]);

  const returnToLobby = useCallback(() => {
    sendRaw({ type: 'match:lobby' });
  }, [sendRaw]);

  const sendPlayerState = useCallback(
    (pose: Omit<LivePose, 'id'>) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 32768) return;

      const now = performance.now();
      const elapsed = now - lastPoseSentAtRef.current;
      if (elapsed < 32) return; // Cap at ~30Hz

      const next: Omit<LivePose, 'id'> = {
        x: round3(pose.x),
        y: round3(pose.y),
        z: round3(pose.z),
        yaw: round3(pose.yaw),
        pitch: round3(pose.pitch),
        weaponId: pose.weaponId,
        ads: pose.ads,
        crouching: pose.crouching,
      };

      const prev = lastPosePayloadRef.current;
      if (prev && elapsed < 250) {
        const moved =
          Math.abs(next.x - prev.x) > 0.004 ||
          Math.abs(next.y - prev.y) > 0.004 ||
          Math.abs(next.z - prev.z) > 0.004 ||
          Math.abs(next.yaw - prev.yaw) > 0.004 ||
          Math.abs(next.pitch - prev.pitch) > 0.004 ||
          next.weaponId !== prev.weaponId ||
          next.ads !== prev.ads ||
          next.crouching !== prev.crouching;
        if (!moved) return;
      }

      lastPoseSentAtRef.current = now;
      lastPosePayloadRef.current = next;
      ws.send(JSON.stringify({ type: 'player:state', ...next }));
    },
    []
  );

  const sendShoot = useCallback(
    (weaponId: number, origin: [number, number, number], hitPoint: [number, number, number]) => {
      sendRaw({
        type: 'player:shoot',
        weaponId,
        origin: [round3(origin[0]), round3(origin[1]), round3(origin[2])],
        hitPoint: [round3(hitPoint[0]), round3(hitPoint[1]), round3(hitPoint[2])],
      });
    },
    [sendRaw]
  );

  const sendHit = useCallback(
    (targetId: string, headshot: boolean, weaponId: number) => {
      sendRaw({ type: 'player:hit', targetId, headshot, weaponId });
    },
    [sendRaw]
  );

  const sendChat = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      sendRaw({ type: 'chat:send', text: trimmed });
    },
    [sendRaw]
  );

  const sendVoiceState = useCallback(
    (talking: boolean) => {
      const next = Boolean(talking);
      if (lastTalkingRef.current === next) return;
      lastTalkingRef.current = next;
      setLocalTalking(next);
      sendRaw({ type: 'voice:state', talking: next });
    },
    [sendRaw]
  );

  return {
    connectionState,
    playerId,
    room,
    publicRooms,
    chatMessages,
    killFeed,
    error,
    pingMs,
    localTalking,
    clearError: () => setError(null),
    refreshPublicRooms,
    createRoom,
    joinRoom,
    leaveRoom,
    updateRoomConfig,
    switchTeam,
    toggleReady,
    startMatch,
    restartMatch,
    returnToLobby,
    sendPlayerState,
    sendShoot,
    sendHit,
    sendVoiceState,
    sendChat,
  };
}
