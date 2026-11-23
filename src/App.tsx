import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Minus, Play, Plus, Users } from 'lucide-react';
import { LobbyModal } from './components/LobbyModal';
import { MultiplayerHud } from './components/MultiplayerHud';
import { SpectateOverlay } from './components/SpectateOverlay';
import { useMultiplayerSocket } from './hooks/useMultiplayerSocket';
import { IframeGameBridge, type SpectateState } from './lib/iframeGameBridge';
import { getMapById, getModeById } from './types/multiplayer';

const GAME_ASSET_SRC = '/assets/aistudio/phixel-arena-megamap_c762179a.html';

export default function App() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const bridgeRef = useRef<IframeGameBridge | null>(null);

  const initialInviteCode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  }, []);

  const [playerName, setPlayerName] = useState<string>(() => {
    try {
      return localStorage.getItem('pa_mp_callsign') || 'Operative';
    } catch {
      return 'Operative';
    }
  });
  const [lobbyOpen, setLobbyOpen] = useState<boolean>(true);
  const [showSoloMpButton, setShowSoloMpButton] = useState<boolean>(true);
  const [inActiveMatch, setInActiveMatch] = useState<boolean>(false);
  const [hudDockTop, setHudDockTop] = useState<number>(74);
  const [hitmarkerAt, setHitmarkerAt] = useState<number>(0);
  const [hitmarkerHeadshot, setHitmarkerHeadshot] = useState<boolean>(false);
  const [damageFlashAt, setDamageFlashAt] = useState<number>(0);
  const [lastKillerName, setLastKillerName] = useState<string | null>(null);
  const [spectateState, setSpectateState] = useState<SpectateState | null>(null);
  const [soloBotCount, setSoloBotCount] = useState<number | null>(null);
  const [deployingMatch, setDeployingMatch] = useState<boolean>(false);
  const deployedRoundRef = useRef<string | null>(null);

  const handlePlayerNameChange = useCallback((name: string) => {
    setPlayerName(name);
    try {
      localStorage.setItem('pa_mp_callsign', name);
    } catch {
      // ignore storage failure
    }
  }, []);

  const playerIdRef = useRef<string | null>(null);

  const socket = useMultiplayerSocket({
    onPose: (pose) => {
      bridgeRef.current?.updateRemotePose(pose);
    },
    onTracer: (ev) => {
      bridgeRef.current?.spawnTracer(ev);
    },
    onDamaged: (ev) => {
      bridgeRef.current?.triggerHitFlinch(ev.targetId);
      const myId = playerIdRef.current;
      if (myId && ev.attackerId === myId) {
        setHitmarkerAt(Date.now());
        setHitmarkerHeadshot(ev.headshot);
      }
      if (myId && ev.targetId === myId) {
        setDamageFlashAt(Date.now());
      }
    },
    onEliminated: (kill) => {
      if (playerIdRef.current && kill.victimId === playerIdRef.current) {
        setLastKillerName(kill.killerName);
      }
    },
    onRespawned: (respawnedId) => {
      if (playerIdRef.current && respawnedId === playerIdRef.current) {
        setLastKillerName(null);
        bridgeRef.current?.onLocalRespawn();
      }
    },
    onRoundStarted: () => {
      setLastKillerName(null);
      bridgeRef.current?.onLocalRespawn();
    },
    onDeploy: () => {
      setLobbyOpen(false);
      setLastKillerName(null);
    },
  });

  playerIdRef.current = socket.playerId;

  const hasJoinedOnceRef = useRef(false);

  // Keep room URL param synced when in a room so copying address bar also works
  useEffect(() => {
    const url = new URL(window.location.href);
    if (socket.room) {
      hasJoinedOnceRef.current = true;
      url.searchParams.set('room', socket.room.code);
    } else if (hasJoinedOnceRef.current || !initialInviteCode) {
      url.searchParams.delete('room');
    }
    window.history.replaceState({}, '', url.toString());
  }, [socket.room, initialInviteCode]);

  // Initialize and drive the 3D iframe bridge
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const bridge = new IframeGameBridge(iframe, {
      onPoseUpdate: (pose) => socket.sendPlayerState(pose),
      onShoot: (weaponId, origin, hitPoint) => socket.sendShoot(weaponId, origin, hitPoint),
      onHit: (targetId, headshot, weaponId) => socket.sendHit(targetId, headshot, weaponId),
      onSoloMenuVisibleChange: (visible) => setShowSoloMpButton(visible),
      onHudStateChange: ({ inActiveMatch: active, dockTopPx }) => {
        setInActiveMatch(active);
        setHudDockTop(dockTopPx);
      },
      onSpectateStateChange: (state) => setSpectateState(state),
      onTalkingChange: (talking) => socket.sendVoiceState(talking),
      onDeployingChange: (deploying) => setDeployingMatch(deploying),
    });
    bridgeRef.current = bridge;
    bridge.start();

    return () => {
      bridge.stop();
      bridgeRef.current = null;
    };
  }, [socket.sendPlayerState, socket.sendShoot, socket.sendHit, socket.sendVoiceState]);

  // Sync latest room players + bot count into the 3D scene bridge & ensure missed deploys catch up
  useEffect(() => {
    if (socket.room) {
      bridgeRef.current?.setRoomState(
        socket.playerId,
        socket.room.players,
        socket.room.status === 'playing',
        socket.room.config.mode,
        socket.room.config.botCount
      );
      const roundKey =
        socket.room.status === 'playing'
          ? `${socket.room.code}:${socket.room.startedAt ?? 0}`
          : null;
      if (roundKey && deployedRoundRef.current !== roundKey) {
        deployedRoundRef.current = roundKey;
        setLobbyOpen(false);
        setLastKillerName(null);
        bridgeRef.current?.deployMatch(socket.room.config.mapId, socket.room.config.mode);
      } else if (!roundKey) {
        deployedRoundRef.current = null;
        bridgeRef.current?.cancelDeploy();
      }
    } else {
      deployedRoundRef.current = null;
      bridgeRef.current?.cancelDeploy();
      bridgeRef.current?.setRoomState(socket.playerId, [], false, 'ffa');
      bridgeRef.current?.setBotCount(soloBotCount);
    }
  }, [socket.playerId, socket.room, soloBotCount]);

  const handleJoinActiveMatch = useCallback(() => {
    if (!socket.room) return;
    setLobbyOpen(false);
    setLastKillerName(null);
    bridgeRef.current?.deployMatch(socket.room.config.mapId, socket.room.config.mode, true);
  }, [socket.room]);

  const handleOpenLobby = useCallback(() => {
    try {
      document.exitPointerLock?.();
    } catch {
      // ignore
    }
    socket.refreshPublicRooms();
    setLobbyOpen(true);
  }, [socket]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#05070d]">
      {/* Original unmodified Pixel Arena game running full-bleed inside same-origin iframe */}
      <iframe
        ref={iframeRef}
        src={GAME_ASSET_SRC}
        title="Pixel Arena 3D Engine"
        className="w-full h-full border-0 block"
        allow="autoplay; fullscreen; pointer-lock"
      />

      {/* Semi-transparent deploy curtain while the 3D arena loads and navigates menus */}
      {socket.room?.status === 'playing' && !lobbyOpen && deployingMatch && (
        <div className="fixed inset-0 z-20 bg-[#05070d]/75 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="max-w-md w-full border-2 border-[#19e6ff]/60 bg-[#070b16]/95 p-5 pixel-box space-y-2.5">
            <div className="font-pixel-display text-xs sm:text-sm text-[#19e6ff] tracking-widest">
              ENTERING ARENA...
            </div>
            <div className="text-sm font-extrabold text-white">
              {getMapById(socket.room.config.mapId).name} ·{' '}
              <span className="text-[#ffcf40]">{getModeById(socket.room.config.mode).name}</span>
            </div>
            <p className="text-xs text-white/70">
              Loading 3D map and syncing squad spawn positions.
            </p>
            <div className="pt-2 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleJoinActiveMatch}
                className="min-h-[38px] px-4 border border-[#19e6ff]/60 bg-[#19e6ff]/15 hover:bg-[#19e6ff]/25 text-[#19e6ff] text-[11px] font-extrabold tracking-widest cursor-pointer"
              >
                RETRY DEPLOY
              </button>
              <button
                type="button"
                onClick={handleOpenLobby}
                className="min-h-[38px] px-4 border border-white/25 bg-white/5 hover:bg-white/15 text-white/80 text-[11px] font-extrabold tracking-widest cursor-pointer"
              >
                LOBBY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Multiplayer & Solo Bot Controls (solo mode, lobby-idle, or paused/menu inside active multiplayer) */}
      {!lobbyOpen && !deployingMatch && showSoloMpButton && (!socket.room || !inActiveMatch) && (
        <div className="fixed top-2.5 left-2.5 z-20 flex flex-wrap items-center gap-2">
          {socket.room?.status === 'playing' && (
            <button
              type="button"
              onClick={handleJoinActiveMatch}
              className="min-h-[38px] px-3 border-2 border-[#39e58c] bg-[#05070d]/90 hover:bg-[#39e58c]/20 text-[#39e58c] text-[11px] font-extrabold tracking-widest flex items-center gap-1.5 cursor-pointer pixel-box"
            >
              <Play className="w-3.5 h-3.5" />
              RETURN TO ARENA
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenLobby}
            className="min-h-[38px] px-3 border-2 border-[#19e6ff] bg-[#05070d]/90 hover:bg-[#19e6ff]/20 text-[#19e6ff] text-[11px] font-extrabold tracking-widest flex items-center gap-2 cursor-pointer pixel-box"
          >
            <Users className="w-4 h-4" />
            MULTIPLAYER LOBBY
          </button>

          {!socket.room && (
            <div className="min-h-[38px] px-2 border-2 border-[#ffcf40]/75 bg-[#05070d]/90 text-[11px] font-extrabold tracking-wider flex items-center gap-1.5 pixel-box">
              <Bot className="w-3.5 h-3.5 text-[#ffcf40]" />
              <span className="text-white/75">BOTS</span>
              <button
                type="button"
                onClick={() => setSoloBotCount((c) => Math.max(0, (c ?? 9) - 1))}
                className="w-6 h-6 border border-white/25 bg-white/5 hover:bg-white/15 flex items-center justify-center text-white cursor-pointer"
                aria-label="Decrease solo bots"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="min-w-[26px] text-center text-[#ffcf40] tabular-nums">
                {soloBotCount === null ? 'AUTO' : soloBotCount}
              </span>
              <button
                type="button"
                onClick={() => setSoloBotCount((c) => Math.min(24, (c ?? 0) + 1))}
                className="w-6 h-6 border border-white/25 bg-white/5 hover:bg-white/15 flex items-center justify-center text-white cursor-pointer"
                aria-label="Increase solo bots"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Active In-Match Multiplayer HUD */}
      {socket.room && !lobbyOpen && (
        <MultiplayerHud
          room={socket.room}
          playerId={socket.playerId}
          pingMs={socket.pingMs}
          inActiveMatch={inActiveMatch}
          hudDockTop={hudDockTop}
          chatMessages={socket.chatMessages}
          killFeed={socket.killFeed}
          hitmarkerAt={hitmarkerAt}
          hitmarkerHeadshot={hitmarkerHeadshot}
          damageFlashAt={damageFlashAt}
          lastKillerName={lastKillerName}
          localTalking={socket.localTalking}
          onSetTalking={socket.sendVoiceState}
          onUpdateBotCount={(botCount) => socket.updateRoomConfig({ botCount })}
          onOpenLobby={handleOpenLobby}
          onSendChat={socket.sendChat}
          onRestartMatch={socket.restartMatch}
          onReturnToLobby={() => {
            socket.returnToLobby();
            setLobbyOpen(true);
          }}
          onLeaveRoom={() => {
            socket.leaveRoom();
            setLobbyOpen(true);
          }}
          onFocusArena={() => bridgeRef.current?.focusArena()}
        />
      )}

      {/* Dedicated Semi-Transparent Spectate Overlay (shown only while spectating) */}
      <SpectateOverlay
        spectateState={spectateState}
        visible={Boolean(socket.room && !lobbyOpen && socket.room.status === 'playing' && inActiveMatch)}
        onFollowNext={() => bridgeRef.current?.cycleSpectate(1)}
        onFollowPrev={() => bridgeRef.current?.cycleSpectate(-1)}
        onToggleMode={() => bridgeRef.current?.toggleSpectateMode()}
      />

      {/* Multiplayer Lobby Modal */}
      {lobbyOpen && (
        <LobbyModal
          connectionState={socket.connectionState}
          playerId={socket.playerId}
          room={socket.room}
          publicRooms={socket.publicRooms}
          chatMessages={socket.chatMessages}
          error={socket.error}
          initialInviteCode={initialInviteCode}
          playerName={playerName}
          onPlayerNameChange={handlePlayerNameChange}
          onCreateRoom={socket.createRoom}
          onJoinRoom={socket.joinRoom}
          onLeaveRoom={socket.leaveRoom}
          onRefreshRooms={socket.refreshPublicRooms}
          onUpdateConfig={socket.updateRoomConfig}
          onSwitchTeam={socket.switchTeam}
          onToggleReady={() => socket.toggleReady()}
          onStartMatch={socket.startMatch}
          onJoinActiveMatch={handleJoinActiveMatch}
          onSendChat={socket.sendChat}
          onPlaySolo={() => setLobbyOpen(false)}
          onClearError={socket.clearError}
        />
      )}
    </main>
  );
}
