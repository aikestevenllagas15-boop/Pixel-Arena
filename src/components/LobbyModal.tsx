import React, { useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  Crosshair,
  Crown,
  Globe,
  Lock,
  Minus,
  Play,
  Plus,
  RefreshCw,
  Send,
  Shield,
  Users,
  X,
} from 'lucide-react';
import {
  ARENA_MAPS,
  GAME_MODES,
  getDefaultMapForMode,
  getMapById,
  getModeById,
  isCoopMode,
  isMapCompatibleWithMode,
} from '../types/multiplayer';
import type {
  ChatMessage,
  GameModeId,
  PublicRoomSummary,
  RoomConfig,
  RoomSnapshot,
  TeamId,
} from '../types/multiplayer';
import type { ConnectionState } from '../hooks/useMultiplayerSocket';

interface LobbyModalProps {
  connectionState: ConnectionState;
  playerId: string | null;
  room: RoomSnapshot | null;
  publicRooms: PublicRoomSummary[];
  chatMessages: ChatMessage[];
  error: string | null;
  initialInviteCode: string;
  playerName: string;
  onPlayerNameChange: (name: string) => void;
  onCreateRoom: (name: string, config: Partial<RoomConfig>) => void;
  onJoinRoom: (code: string, name: string) => void;
  onLeaveRoom: () => void;
  onRefreshRooms: () => void;
  onUpdateConfig: (config: Partial<RoomConfig>) => void;
  onSwitchTeam: (team: TeamId) => void;
  onToggleReady: () => void;
  onStartMatch: () => void;
  onJoinActiveMatch: () => void;
  onSendChat: (text: string) => void;
  onPlaySolo: () => void;
  onClearError: () => void;
}

export const LobbyModal: React.FC<LobbyModalProps> = ({
  connectionState,
  playerId,
  room,
  publicRooms,
  chatMessages,
  error,
  initialInviteCode,
  playerName,
  onPlayerNameChange,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onRefreshRooms,
  onUpdateConfig,
  onSwitchTeam,
  onToggleReady,
  onStartMatch,
  onJoinActiveMatch,
  onSendChat,
  onPlaySolo,
  onClearError,
}) => {
  const [joinCode, setJoinCode] = useState(initialInviteCode);
  const [roomName, setRoomName] = useState('');
  const [createMode, setCreateMode] = useState<GameModeId>('ffa');
  const [createMapId, setCreateMapId] = useState<number>(1);
  const [createBotCount, setCreateBotCount] = useState<number>(0);
  const [createPublic, setCreatePublic] = useState<boolean>(true);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [chatInput, setChatInput] = useState('');

  const isHost = Boolean(room && playerId && room.hostId === playerId);
  const me = room?.players.find((p) => p.id === playerId) ?? null;

  const handleModeSelectForCreate = (mode: GameModeId) => {
    setCreateMode(mode);
    if (!isMapCompatibleWithMode(createMapId, mode)) {
      setCreateMapId(getDefaultMapForMode(mode));
    }
    setCreateBotCount(isCoopMode(mode) ? 6 : 0);
  };

  const handleCopyInvite = async () => {
    if (!room) return;
    const url = `${window.location.origin}/?room=${room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInvite(true);
      window.setTimeout(() => setCopiedInvite(false), 2000);
    } catch {
      // Fallback: copy failed silently
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const safeName = playerName.trim() || 'Operative';
    const modeInfo = getModeById(createMode);
    onCreateRoom(safeName, {
      name: roomName.trim() || `${safeName}'s Arena`,
      isPublic: createPublic,
      mode: createMode,
      mapId: createMapId,
      scoreLimit: modeInfo.defaultScoreLimit,
      botCount: createBotCount,
      maxPlayers: 10,
    });
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    onJoinRoom(joinCode.trim().toUpperCase(), playerName.trim() || 'Operative');
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendChat(chatInput);
    setChatInput('');
  };

  return (
    <div className="fixed inset-0 z-30 bg-[#05070d]/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div className="w-full max-w-5xl max-h-[92dvh] bg-[#070b16] border-2 border-[#19e6ff]/55 pixel-box flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10 bg-[#05070d]/90 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 border-2 border-[#19e6ff] bg-[#19e6ff]/15 flex items-center justify-center text-[#19e6ff]">
              <Crosshair className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-pixel-display text-xs sm:text-sm text-[#19e6ff] tracking-wider">
                PIXEL ARENA // MULTIPLAYER
              </h1>
              <p className="text-xs text-white/65 mt-0.5">
                Host a private squad room, share the invite link, and drop in together
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-1 text-[11px] font-bold tracking-wider border ${
                connectionState === 'connected'
                  ? 'border-[#39e58c]/50 bg-[#39e58c]/10 text-[#39e58c]'
                  : connectionState === 'connecting'
                  ? 'border-[#ffcf40]/50 bg-[#ffcf40]/10 text-[#ffcf40]'
                  : 'border-[#ff3b5c]/50 bg-[#ff3b5c]/10 text-[#ff3b5c]'
              }`}
            >
              {connectionState === 'connected'
                ? 'SERVER ONLINE'
                : connectionState === 'connecting'
                ? 'CONNECTING...'
                : 'RECONNECTING...'}
            </span>
            <button
              type="button"
              onClick={onPlaySolo}
              className="min-h-[44px] px-3 border border-white/25 bg-white/5 hover:bg-white/15 text-xs font-bold tracking-wider text-white/85 cursor-pointer"
            >
              PLAY SOLO
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 py-2.5 bg-[#ff3b5c]/20 border-b border-[#ff3b5c]/50 flex items-center justify-between gap-2 text-xs text-[#ffd1d9]">
            <span className="font-semibold">{error}</span>
            <button
              type="button"
              onClick={onClearError}
              className="p-1 hover:text-white cursor-pointer"
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Body */}
        {!room ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* Callsign Bar */}
            <div className="p-3.5 border border-white/15 bg-[#05070d]/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <label
                  htmlFor="mp-callsign"
                  className="block text-[11px] font-extrabold text-[#19e6ff] tracking-widest"
                >
                  YOUR CALLSIGN
                </label>
                <p className="text-xs text-white/60">Shown above your soldier inside the 3D arena</p>
              </div>
              <input
                id="mp-callsign"
                type="text"
                maxLength={18}
                value={playerName}
                onChange={(e) => onPlayerNameChange(e.target.value)}
                placeholder="Operative"
                className="w-full sm:w-64 min-h-[44px] px-3 bg-[#0b1224] border border-white/25 focus:border-[#19e6ff] focus:outline-none text-sm font-bold tracking-wide text-white"
              />
            </div>

            {/* Instant 1-Tap Invite Card when opened via ?room=CODE link */}
            {initialInviteCode && (
              <div className="p-3.5 border-2 border-[#ffcf40] bg-[#ffcf40]/12 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-extrabold text-[#ffcf40] tracking-widest">
                    FRIEND INVITE LINK DETECTED
                  </div>
                  <div className="text-xs text-white/85 mt-0.5">
                    Ready to join room <span className="font-pixel-display text-white">{initialInviteCode}</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={connectionState !== 'connected'}
                  onClick={() => onJoinRoom(initialInviteCode, playerName.trim() || 'Operative')}
                  className="min-h-[46px] px-5 border-2 border-[#ffcf40] bg-[#ffcf40]/25 hover:bg-[#ffcf40]/35 disabled:opacity-40 text-[#ffcf40] font-extrabold text-xs tracking-widest flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4" />
                  JOIN ROOM {initialInviteCode}
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Host Room Panel */}
              <form
                onSubmit={handleCreateSubmit}
                className="lg:col-span-7 border border-white/15 bg-[#05070d]/55 p-4 flex flex-col justify-between gap-4"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xs font-extrabold text-[#19e6ff] tracking-widest">
                      HOST NEW ARENA
                    </h2>
                    <button
                      type="button"
                      onClick={() => setCreatePublic((v) => !v)}
                      className="min-h-[36px] px-2.5 border border-white/20 bg-white/5 hover:bg-white/10 text-[11px] font-bold tracking-wider flex items-center gap-1.5 cursor-pointer"
                    >
                      {createPublic ? (
                        <>
                          <Globe className="w-3.5 h-3.5 text-[#39e58c]" />
                          PUBLIC ROOM
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5 text-[#ffcf40]" />
                          PRIVATE (INVITE ONLY)
                        </>
                      )}
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-white/65 tracking-wider mb-1">
                      ROOM NAME (OPTIONAL)
                    </label>
                    <input
                      type="text"
                      maxLength={28}
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      placeholder={`${playerName.trim() || 'Operative'}'s Arena`}
                      className="w-full min-h-[44px] px-3 bg-[#0b1224] border border-white/20 focus:border-[#19e6ff] focus:outline-none text-sm text-white"
                    />
                  </div>

                  <div>
                    <div className="text-[11px] font-bold text-white/65 tracking-wider mb-1.5">
                      SELECT GAME MODE
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {GAME_MODES.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleModeSelectForCreate(m.id)}
                          className={`text-left p-2.5 border-2 transition-colors cursor-pointer ${
                            createMode === m.id
                              ? 'border-[#19e6ff] bg-[#19e6ff]/15'
                              : 'border-white/15 bg-white/[0.03] hover:border-white/35'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-extrabold tracking-wider" style={{ color: m.accent }}>
                              {m.name}
                            </span>
                            <span className="text-[10px] font-bold text-white/55">{m.tag}</span>
                          </div>
                          <div className="text-[11px] text-white/70 mt-1 leading-snug">{m.subtitle}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold text-white/65 tracking-wider mb-1.5">
                      SELECT MAP (
                      {createMode === 'survival'
                        ? 'BIG MAPS & MEGA WARZONE'
                        : createMode === 'territory'
                        ? 'BIG MAPS ONLY'
                        : 'STANDARD & BIG ARENAS'}
                      )
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {ARENA_MAPS.map((map) => {
                        const disabled = !isMapCompatibleWithMode(map.id, createMode);
                        const selected = createMapId === map.id;
                        return (
                          <button
                            key={map.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => !disabled && setCreateMapId(map.id)}
                            className={`text-left p-2.5 border transition-colors ${
                              disabled
                                ? 'border-white/10 bg-white/[0.02] opacity-35 cursor-not-allowed'
                                : selected
                                ? 'border-[#19e6ff] bg-[#19e6ff]/15 cursor-pointer'
                                : 'border-white/15 bg-white/[0.03] hover:border-white/35 cursor-pointer'
                            }`}
                          >
                            <div className="text-xs font-extrabold truncate" style={{ color: map.accent }}>
                              {map.name}
                            </div>
                            <div className="text-[10px] text-white/55 mt-0.5">
                              {map.id === 12
                                ? createMode === 'survival'
                                  ? '240x240 MEGA'
                                  : 'SURVIVAL ONLY'
                                : map.isBig
                                ? 'BIG ARENA'
                                : 'STANDARD'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bot Count Adjuster (0 to 24) */}
                  <div className="p-3 border border-white/15 bg-white/[0.03] flex flex-wrap items-center justify-between gap-2.5">
                    <div>
                      <div className="text-[11px] font-extrabold text-[#19e6ff] tracking-wider flex items-center gap-1.5">
                        <Bot className="w-3.5 h-3.5" />
                        ARENA BOTS (0 – 24)
                      </div>
                      <div className="text-[10px] text-white/55 mt-0.5">
                        {createBotCount === 0
                          ? 'Pure PvP — only real players spawn'
                          : `Up to ${createBotCount} AI bots alongside players`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCreateBotCount((c) => Math.max(0, c - 1))}
                        className="w-9 h-9 border border-white/25 bg-white/5 hover:bg-white/15 flex items-center justify-center text-white cursor-pointer"
                        aria-label="Decrease bots"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="min-w-[40px] text-center text-sm font-extrabold text-[#ffcf40] tabular-nums">
                        {createBotCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCreateBotCount((c) => Math.min(24, c + 1))}
                        className="w-9 h-9 border border-white/25 bg-white/5 hover:bg-white/15 flex items-center justify-center text-white cursor-pointer"
                        aria-label="Increase bots"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <div className="hidden sm:flex items-center gap-1 pl-1">
                        {[0, 4, 8, 12, 24].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setCreateBotCount(preset)}
                            className={`min-w-[30px] h-8 px-1.5 border text-[10px] font-extrabold tabular-nums cursor-pointer ${
                              createBotCount === preset
                                ? 'border-[#19e6ff] bg-[#19e6ff]/20 text-[#19e6ff]'
                                : 'border-white/15 bg-white/5 text-white/65 hover:text-white'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={connectionState !== 'connected'}
                  className="w-full min-h-[48px] px-4 border-2 border-[#19e6ff] bg-[#19e6ff]/20 hover:bg-[#19e6ff]/30 disabled:opacity-40 text-[#19e6ff] font-extrabold text-xs sm:text-sm tracking-widest flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4" />
                  CREATE ROOM & GET INVITE LINK
                </button>
              </form>

              {/* Join Room & Public Browser */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                <form
                  onSubmit={handleJoinSubmit}
                  className="border border-white/15 bg-[#05070d]/55 p-4 space-y-3"
                >
                  <h2 className="text-xs font-extrabold text-[#ffcf40] tracking-widest">
                    JOIN BY ROOM CODE
                  </h2>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={8}
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="E.G. K7M9P2"
                      className="flex-1 min-h-[44px] px-3 bg-[#0b1224] border border-white/25 focus:border-[#ffcf40] focus:outline-none text-sm font-extrabold tracking-[0.2em] uppercase text-white tabular-nums"
                    />
                    <button
                      type="submit"
                      disabled={connectionState !== 'connected' || !joinCode.trim()}
                      className="min-h-[44px] px-4 border-2 border-[#ffcf40] bg-[#ffcf40]/20 hover:bg-[#ffcf40]/30 disabled:opacity-40 text-[#ffcf40] font-extrabold text-xs tracking-widest cursor-pointer"
                    >
                      JOIN
                    </button>
                  </div>
                </form>

                <div className="flex-1 border border-white/15 bg-[#05070d]/55 p-4 flex flex-col min-h-[240px]">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h2 className="text-xs font-extrabold text-[#39e58c] tracking-widest">
                      PUBLIC ROOMS ({publicRooms.length})
                    </h2>
                    <button
                      type="button"
                      onClick={onRefreshRooms}
                      className="min-h-[36px] px-2.5 border border-white/20 bg-white/5 hover:bg-white/15 text-[11px] font-bold tracking-wider flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      REFRESH
                    </button>
                  </div>

                  {publicRooms.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-4 border border-dashed border-white/15 text-xs text-white/55">
                      <Users className="w-6 h-6 mb-2 text-white/35" />
                      No public rooms live right now. Host one and share the link!
                    </div>
                  ) : (
                    <div className="space-y-2 overflow-y-auto max-h-[280px] pr-1">
                      {publicRooms.map((r) => {
                        const map = getMapById(r.mapId);
                        const mode = getModeById(r.mode);
                        return (
                          <div
                            key={r.code}
                            className="p-2.5 border border-white/15 bg-white/[0.03] flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-extrabold text-white truncate">
                                {r.name}
                              </div>
                              <div className="text-[11px] text-white/60 mt-0.5 truncate">
                                <span style={{ color: mode.accent }}>{mode.name}</span> · {map.name} ·{' '}
                                <span className="tabular-nums">
                                  {r.playerCount}/{r.maxPlayers}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => onJoinRoom(r.code, playerName.trim() || 'Operative')}
                              className="min-h-[38px] px-3 border border-[#39e58c] bg-[#39e58c]/15 hover:bg-[#39e58c]/30 text-[#39e58c] text-[11px] font-extrabold tracking-wider shrink-0 cursor-pointer"
                            >
                              JOIN
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Inside Room Lobby */
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4">
            {/* Share Invite Banner */}
            <div className="p-3.5 border-2 border-[#19e6ff]/45 bg-[#0b1224] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-extrabold text-[#19e6ff] tracking-widest">
                  INVITE YOUR FRIENDS
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-1">
                  <span className="font-pixel-display text-sm sm:text-base text-white tracking-[0.2em] tabular-nums">
                    {room.code}
                  </span>
                  <span className="text-xs text-white/60 truncate">
                    {room.config.name} · {room.players.length}/{room.config.maxPlayers} Players
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="min-h-[44px] px-4 border-2 border-[#19e6ff] bg-[#19e6ff]/20 hover:bg-[#19e6ff]/30 text-[#19e6ff] font-extrabold text-xs tracking-wider flex items-center gap-2 cursor-pointer"
                >
                  {copiedInvite ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedInvite ? 'INVITE LINK COPIED!' : 'COPY INVITE LINK'}
                </button>
                <button
                  type="button"
                  onClick={onLeaveRoom}
                  className="min-h-[44px] px-3 border border-[#ff3b5c]/50 bg-[#ff3b5c]/10 hover:bg-[#ff3b5c]/25 text-[#ff3b5c] text-xs font-extrabold tracking-wider cursor-pointer"
                >
                  LEAVE
                </button>
              </div>
            </div>

            {room.status === 'playing' && (
              <div className="p-3 border-2 border-[#39e58c] bg-[#39e58c]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="text-xs font-bold text-[#d8ffea]">
                  Match is live on <span className="text-white font-extrabold">{getMapById(room.config.mapId).name}</span>!
                </div>
                <button
                  type="button"
                  onClick={onJoinActiveMatch}
                  className="min-h-[42px] px-4 border-2 border-[#39e58c] bg-[#39e58c]/25 hover:bg-[#39e58c]/35 text-[#39e58c] font-extrabold text-xs tracking-widest flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4" />
                  DROP INTO ARENA NOW
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
              {/* Arena Config (Host editable, others view) */}
              <div className="lg:col-span-5 border border-white/15 bg-[#05070d]/60 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-extrabold text-[#19e6ff] tracking-widest">
                    MATCH SETTINGS
                  </h2>
                  <span className="text-[10px] font-bold text-white/55">
                    {isHost ? 'HOST CONTROLS' : 'HOST LOCKED'}
                  </span>
                </div>

                <div>
                  <div className="text-[11px] font-bold text-white/60 mb-1.5">MODE</div>
                  <div className="grid grid-cols-2 gap-2">
                    {GAME_MODES.map((m) => {
                      const active = room.config.mode === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          disabled={!isHost || room.status === 'playing'}
                          onClick={() =>
                            onUpdateConfig({
                              mode: m.id,
                              scoreLimit: m.defaultScoreLimit,
                            })
                          }
                          className={`text-left p-2 border transition-colors ${
                            active
                              ? 'border-[#19e6ff] bg-[#19e6ff]/15'
                              : 'border-white/15 bg-white/[0.02]'
                          } ${isHost && room.status !== 'playing' ? 'hover:border-white/35 cursor-pointer' : 'cursor-default opacity-85'}`}
                        >
                          <div className="text-[11px] font-extrabold" style={{ color: m.accent }}>
                            {m.name}
                          </div>
                          <div className="text-[10px] text-white/55">{m.tag}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-bold text-white/60 mb-1.5">ARENA</div>
                  <div className="grid grid-cols-2 gap-2">
                    {ARENA_MAPS.map((map) => {
                      const incompatible = !isMapCompatibleWithMode(map.id, room.config.mode);
                      const active = room.config.mapId === map.id;
                      return (
                        <button
                          key={map.id}
                          type="button"
                          disabled={!isHost || incompatible || room.status === 'playing'}
                          onClick={() => onUpdateConfig({ mapId: map.id })}
                          className={`text-left p-2 border transition-colors ${
                            active
                              ? 'border-[#19e6ff] bg-[#19e6ff]/15'
                              : 'border-white/15 bg-white/[0.02]'
                          } ${incompatible ? 'opacity-30 cursor-not-allowed' : isHost && room.status !== 'playing' ? 'hover:border-white/35 cursor-pointer' : 'cursor-default'}`}
                        >
                          <div className="text-[11px] font-extrabold truncate" style={{ color: map.accent }}>
                            {map.name}
                          </div>
                          <div className="text-[10px] text-white/55">
                            {map.id === 12
                              ? room.config.mode === 'survival'
                                ? '240x240 MEGA'
                                : 'SURVIVAL ONLY'
                              : map.isBig
                              ? 'BIG'
                              : 'STANDARD'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {room.config.mode === 'classic' ? (
                  <div className="p-2.5 border border-[#38bdf8]/40 bg-[#38bdf8]/10 text-[11px] font-bold text-[#bdeaff] flex items-center justify-between gap-2">
                    <span>CLASSIC 5V5 · NO MID-ROUND RESPAWN</span>
                    <span className="text-[#ffcf40] font-extrabold shrink-0">FIRST TO 5 WINS</span>
                  </div>
                ) : (
                  room.config.mode !== 'survival' &&
                  !isCoopMode(room.config.mode) && (
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <span className="text-[11px] font-bold text-white/70">KILL LIMIT</span>
                      <div className="flex items-center gap-1.5">
                        {[10, 15, 25, 40].map((val) => (
                          <button
                            key={val}
                            type="button"
                            disabled={!isHost || room.status === 'playing'}
                            onClick={() => onUpdateConfig({ scoreLimit: val })}
                            className={`min-w-[38px] min-h-[34px] px-2 border text-xs font-extrabold tabular-nums ${
                              room.config.scoreLimit === val
                                ? 'border-[#ffcf40] bg-[#ffcf40]/20 text-[#ffcf40]'
                                : 'border-white/20 bg-white/5 text-white/70'
                            } ${isHost ? 'cursor-pointer' : 'cursor-default'}`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                )}

                {/* Live Adjustable Bots (0 to 24) */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
                  <div>
                    <div className="text-[11px] font-bold text-[#19e6ff] flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5" />
                      BOTS (0 – 24)
                    </div>
                    <div className="text-[10px] text-white/55">
                      {room.config.botCount === 0 ? 'Pure PvP (0 bots)' : `${room.config.botCount} AI bots`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={!isHost || room.config.botCount <= 0}
                      onClick={() => onUpdateConfig({ botCount: Math.max(0, room.config.botCount - 1) })}
                      className="w-8 h-8 border border-white/20 bg-white/5 hover:bg-white/15 disabled:opacity-35 flex items-center justify-center text-white cursor-pointer"
                      aria-label="Decrease room bots"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="min-w-[34px] text-center text-xs font-extrabold text-[#ffcf40] tabular-nums">
                      {room.config.botCount}
                    </span>
                    <button
                      type="button"
                      disabled={!isHost || room.config.botCount >= 24}
                      onClick={() => onUpdateConfig({ botCount: Math.min(24, room.config.botCount + 1) })}
                      className="w-8 h-8 border border-white/20 bg-white/5 hover:bg-white/15 disabled:opacity-35 flex items-center justify-center text-white cursor-pointer"
                      aria-label="Increase room bots"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    {[0, 4, 8, 12, 24].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        disabled={!isHost}
                        onClick={() => onUpdateConfig({ botCount: preset })}
                        className={`min-w-[26px] h-8 px-1 border text-[10px] font-extrabold tabular-nums ${
                          room.config.botCount === preset
                            ? 'border-[#19e6ff] bg-[#19e6ff]/20 text-[#19e6ff]'
                            : 'border-white/15 bg-white/5 text-white/65'
                        } ${isHost ? 'hover:text-white cursor-pointer' : 'cursor-default opacity-75'}`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Squad Roster + Lobby Chat */}
              <div className="lg:col-span-7 flex flex-col gap-4 min-h-0">
                <div className="border border-white/15 bg-[#05070d]/60 p-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h2 className="text-xs font-extrabold text-[#19e6ff] tracking-widest">
                      SQUAD ROSTER ({room.players.length}/{room.config.maxPlayers})
                    </h2>
                    {!isCoopMode(room.config.mode) && me && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSwitchTeam('blue')}
                          className={`min-h-[34px] px-2.5 border text-[11px] font-extrabold tracking-wider cursor-pointer tabular-nums ${
                            me.team === 'blue'
                              ? 'border-[#19e6ff] bg-[#19e6ff]/20 text-[#19e6ff]'
                              : 'border-white/20 bg-white/5 text-white/65'
                          }`}
                        >
                          BLUE
                          {room.config.mode === 'classic'
                            ? ` (${room.players.filter((p) => p.team === 'blue').length}/5)`
                            : ''}
                        </button>
                        <button
                          type="button"
                          onClick={() => onSwitchTeam('red')}
                          className={`min-h-[34px] px-2.5 border text-[11px] font-extrabold tracking-wider cursor-pointer tabular-nums ${
                            me.team === 'red'
                              ? 'border-[#ff3b5c] bg-[#ff3b5c]/20 text-[#ff3b5c]'
                              : 'border-white/20 bg-white/5 text-white/65'
                          }`}
                        >
                          RED
                          {room.config.mode === 'classic'
                            ? ` (${room.players.filter((p) => p.team === 'red').length}/5)`
                            : ''}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[190px] overflow-y-auto">
                    {room.players.map((p) => (
                      <div
                        key={p.id}
                        className={`p-2.5 border flex items-center justify-between gap-2 ${
                          p.team === 'blue'
                            ? 'border-[#19e6ff]/40 bg-[#19e6ff]/[0.07]'
                            : 'border-[#ff3b5c]/40 bg-[#ff3b5c]/[0.07]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Shield
                            className={`w-4 h-4 shrink-0 ${
                              p.team === 'blue' ? 'text-[#19e6ff]' : 'text-[#ff3b5c]'
                            }`}
                          />
                          <span className="text-xs font-extrabold text-white truncate">
                            {p.name}
                            {p.id === playerId ? ' (YOU)' : ''}
                          </span>
                          {p.isHost && <Crown className="w-3.5 h-3.5 text-[#ffcf40] shrink-0" />}
                        </div>
                        <span
                          className={`text-[10px] font-extrabold tracking-wider shrink-0 ${
                            p.connected === false
                              ? 'text-[#ffcf40]'
                              : p.ready
                              ? 'text-[#39e58c]'
                              : 'text-white/45'
                          }`}
                        >
                          {p.connected === false
                            ? 'RECONNECTING...'
                            : p.isHost
                            ? 'HOST'
                            : p.ready
                            ? 'READY'
                            : 'WAITING'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Lobby Chat */}
                <div className="flex-1 border border-white/15 bg-[#05070d]/60 p-3 flex flex-col min-h-[170px]">
                  <div className="text-[11px] font-extrabold text-white/65 tracking-widest mb-2">
                    SQUAD COMMS
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-1.5 text-xs mb-2 max-h-[140px]">
                    {chatMessages.map((m) => (
                      <div key={m.id} className="leading-snug">
                        {m.system ? (
                          <span className="text-[#ffcf40] font-semibold">[HQ] {m.text}</span>
                        ) : (
                          <span>
                            <span
                              className={`font-extrabold ${
                                m.team === 'blue' ? 'text-[#19e6ff]' : 'text-[#ff3b5c]'
                              }`}
                            >
                              {m.senderName}:{' '}
                            </span>
                            <span className="text-white/90">{m.text}</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <form onSubmit={handleChatSubmit} className="flex gap-2">
                    <input
                      type="text"
                      maxLength={180}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Send message to room..."
                      className="flex-1 min-h-[40px] px-3 bg-[#0b1224] border border-white/20 focus:border-[#19e6ff] focus:outline-none text-xs text-white"
                    />
                    <button
                      type="submit"
                      className="min-h-[40px] px-3 border border-[#19e6ff]/60 bg-[#19e6ff]/15 hover:bg-[#19e6ff]/30 text-[#19e6ff] cursor-pointer"
                      aria-label="Send message"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer Action Bar inside Room */}
        {room && (
          <div className="px-4 py-3 border-t border-white/10 bg-[#05070d]/90 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-white/70">
              Map: <span className="text-white font-bold">{getMapById(room.config.mapId).name}</span> · Mode:{' '}
              <span className="text-[#19e6ff] font-bold">{getModeById(room.config.mode).name}</span>
            </div>

            <div className="flex items-center gap-2.5">
              {room.status === 'playing' ? (
                <button
                  type="button"
                  onClick={onJoinActiveMatch}
                  className="min-h-[48px] px-6 border-2 border-[#39e58c] bg-[#39e58c]/20 hover:bg-[#39e58c]/30 text-[#39e58c] font-extrabold text-xs sm:text-sm tracking-widest flex items-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4" />
                  RETURN TO ARENA
                </button>
              ) : isHost ? (
                <button
                  type="button"
                  onClick={onStartMatch}
                  className="min-h-[48px] px-6 border-2 border-[#19e6ff] bg-[#19e6ff]/20 hover:bg-[#19e6ff]/30 text-[#19e6ff] font-extrabold text-xs sm:text-sm tracking-widest flex items-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4" />
                  DEPLOY SQUAD ({room.players.length})
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onToggleReady}
                  className={`min-h-[48px] px-6 border-2 font-extrabold text-xs sm:text-sm tracking-widest cursor-pointer ${
                    me?.ready
                      ? 'border-[#39e58c] bg-[#39e58c]/20 text-[#39e58c]'
                      : 'border-[#ffcf40] bg-[#ffcf40]/20 text-[#ffcf40]'
                  }`}
                >
                  {me?.ready ? 'READY — WAITING FOR HOST' : 'READY UP'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
