import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Heart,
  MessageSquare,
  Mic,
  MicOff,
  Minus,
  Plus,
  Send,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { getWeaponById, isCoopMode, isTeamMode } from '../types/multiplayer';
import type { ChatMessage, KillFeedItem, RoomSnapshot } from '../types/multiplayer';
import { PostMatchLeaderboard } from './PostMatchLeaderboard';

interface MultiplayerHudProps {
  room: RoomSnapshot;
  playerId: string | null;
  pingMs: number;
  inActiveMatch: boolean;
  hudDockTop: number;
  chatMessages: ChatMessage[];
  killFeed: KillFeedItem[];
  hitmarkerAt: number;
  hitmarkerHeadshot: boolean;
  damageFlashAt: number;
  lastKillerName: string | null;
  localTalking: boolean;
  onSetTalking: (talking: boolean) => void;
  onUpdateBotCount: (count: number) => void;
  onOpenLobby: () => void;
  onSendChat: (text: string) => void;
  onRestartMatch: () => void;
  onReturnToLobby: () => void;
  onLeaveRoom: () => void;
  onFocusArena: () => void;
}

export const MultiplayerHud: React.FC<MultiplayerHudProps> = ({
  room,
  playerId,
  pingMs,
  inActiveMatch,
  hudDockTop,
  chatMessages,
  killFeed,
  hitmarkerAt,
  hitmarkerHeadshot,
  damageFlashAt,
  lastKillerName,
  localTalking,
  onSetTalking,
  onUpdateBotCount,
  onOpenLobby,
  onSendChat,
  onRestartMatch,
  onReturnToLobby,
  onLeaveRoom,
  onFocusArena,
}) => {
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [botsOpen, setBotsOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [squadVitalsCollapsed, setSquadVitalsCollapsed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const chatInputRef = useRef<HTMLInputElement | null>(null);

  const me = room.players.find((p) => p.id === playerId) ?? null;
  const isHost = Boolean(playerId && room.hostId === playerId);

  const isRespawning = Boolean(me && !me.alive && me.respawnAt && room.status === 'playing');
  const isRoundTransition = Boolean(room.status === 'playing' && room.nextRoundAt);
  const hasTransientFx =
    now - hitmarkerAt < 200 ||
    now - damageFlashAt < 280 ||
    killFeed.some((k) => now - k.timestamp < 5500) ||
    chatMessages.some((m) => now - m.timestamp < 6500);

  useEffect(() => {
    if (hitmarkerAt > 0 || damageFlashAt > 0 || killFeed.length > 0 || chatMessages.length > 0 || isRoundTransition) {
      setNow(Date.now());
    }
  }, [hitmarkerAt, damageFlashAt, killFeed.length, chatMessages.length, isRoundTransition]);

  useEffect(() => {
    if (!isRespawning && !isRoundTransition && !hasTransientFx) return;
    const timer = window.setInterval(() => setNow(Date.now()), 120);
    return () => window.clearInterval(timer);
  }, [isRespawning, isRoundTransition, hasTransientFx]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      const typing = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

      if (!typing && e.code === 'KeyV' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!e.repeat) {
          onSetTalking(true);
        }
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        setScoreboardOpen(true);
      } else if (e.key === 'Enter' && !chatOpen) {
        if (!typing) {
          e.preventDefault();
          try {
            document.exitPointerLock?.();
          } catch {
            // ignore
          }
          setChatOpen(true);
          window.setTimeout(() => chatInputRef.current?.focus(), 30);
        }
      } else if (e.key === 'Escape' && chatOpen) {
        setChatOpen(false);
        onFocusArena();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyV') {
        onSetTalking(false);
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        setScoreboardOpen(false);
      }
    };

    const releaseVoice = () => {
      onSetTalking(false);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        onSetTalking(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseVoice);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseVoice);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      onSetTalking(false);
    };
  }, [chatOpen, onFocusArena, onSetTalking]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?room=${room.code}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      onSendChat(chatInput);
      setChatInput('');
    }
    setChatOpen(false);
    onFocusArena();
  };

  const sortedPlayers = [...room.players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  const topLeader = sortedPlayers[0];
  const aliveCount = room.players.filter((p) => p.alive).length;
  const showHitmarker = now - hitmarkerAt < 180;
  const showDamageFlash = now - damageFlashAt < 260;
  const respawnRemaining =
    me && !me.alive && me.respawnAt ? Math.max(0, (me.respawnAt - now) / 1000) : null;
  const nextRoundRemaining =
    room.nextRoundAt ? Math.max(0, (room.nextRoundAt - now) / 1000) : null;

  const recentKills = killFeed.filter((k) => now - k.timestamp < 5200).slice(0, 2);
  const recentChats = chatMessages.filter((m) => now - m.timestamp < 6200).slice(-2);
  const isTeamScoped = isTeamMode(room.config.mode) || isCoopMode(room.config.mode);
  const teamScopedVoice = isTeamScoped;
  const teammates =
    isTeamScoped && me
      ? room.players.filter((p) => p.id !== playerId && p.team === me.team)
      : [];
  const aliveTeammates = teammates.filter((p) => p.alive).length;
  const getHealthPct = (hp: number, maxHp: number, alive: boolean) =>
    alive ? Math.max(1, Math.min(100, Math.round((hp / Math.max(1, maxHp)) * 100))) : 0;
  const talkingTeamMembers = room.players.filter((p) => {
    const isTalkingNow = p.id === playerId ? localTalking || Boolean(p.talking) : Boolean(p.talking);
    if (!isTalkingNow) return false;
    if (teamScopedVoice && me) {
      return p.team === me.team;
    }
    return true;
  });

  // Hide active gameplay HUD when an in-game iframe modal (PAUSED, SETTINGS, QUICK PLAY) is open so it never overlaps it
  const showPlayOverlay = inActiveMatch && room.status !== 'ended';
  if (!showPlayOverlay && room.status !== 'ended' && !scoreboardOpen && !chatOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-20 pointer-events-none select-none">
      {/* Damage Vignette */}
      {showPlayOverlay && showDamageFlash && (
        <div
          className="fixed inset-0 pointer-events-none transition-opacity"
          style={{
            boxShadow: 'inset 0 0 90px rgba(255, 59, 92, 0.72)',
          }}
        />
      )}

      {/* Center Hitmarker */}
      {showPlayOverlay && showHitmarker && (
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="relative w-7 h-7">
            <span
              className={`absolute left-1/2 top-0 w-0.5 h-2.5 -translate-x-1/2 rotate-45 ${
                hitmarkerHeadshot ? 'bg-[#ffcf40]' : 'bg-white'
              }`}
            />
            <span
              className={`absolute left-1/2 bottom-0 w-0.5 h-2.5 -translate-x-1/2 rotate-45 ${
                hitmarkerHeadshot ? 'bg-[#ffcf40]' : 'bg-white'
              }`}
            />
            <span
              className={`absolute top-1/2 left-0 w-2.5 h-0.5 -translate-y-1/2 rotate-45 ${
                hitmarkerHeadshot ? 'bg-[#ffcf40]' : 'bg-white'
              }`}
            />
            <span
              className={`absolute top-1/2 right-0 w-2.5 h-0.5 -translate-y-1/2 rotate-45 ${
                hitmarkerHeadshot ? 'bg-[#ffcf40]' : 'bg-white'
              }`}
            />
          </div>
        </div>
      )}

      {/* Compact Top-Left Multiplayer Dock ONLY — dynamically sits below the game's top-left box, stays narrow enough on mobile to never touch Top-Center Survival/Compass HUD */}
      {showPlayOverlay && (
        <div
          className="fixed left-2 flex flex-col items-start gap-1 max-w-[254px] sm:max-w-[400px]"
          style={{ top: `${hudDockTop}px` }}
        >
          {/* Row 1: Room Code, Invite, Scoreboard, Chat, Lobby, Bots, Push-to-Talk [V] */}
          <div className="pointer-events-auto flex flex-wrap items-center gap-1 whitespace-nowrap bg-[#05070d]/90 border border-[#19e6ff]/40 px-1.5 py-0.5 sm:px-2 sm:py-1">
            <span className="font-pixel-display text-[8px] sm:text-[9px] text-[#19e6ff] tracking-wider tabular-nums">
              {room.code}
            </span>
            <button
              type="button"
              onClick={handleCopyLink}
              className="min-h-[24px] sm:min-h-[26px] px-1 sm:px-1.5 border border-[#19e6ff]/40 bg-[#19e6ff]/15 hover:bg-[#19e6ff]/30 text-[9px] font-extrabold text-[#19e6ff] flex items-center gap-0.5 cursor-pointer"
              title="Copy invite link for friends"
            >
              {copied ? <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> : <Copy className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
              <span className="sm:hidden">{copied ? 'OK' : 'INV'}</span>
              <span className="hidden sm:inline">{copied ? 'COPIED' : 'INVITE'}</span>
            </button>
            <button
              type="button"
              onClick={() => setScoreboardOpen((v) => !v)}
              className="min-h-[24px] sm:min-h-[26px] px-1 sm:px-1.5 border border-white/20 bg-white/5 hover:bg-white/15 text-[9px] font-bold text-white/90 flex items-center gap-0.5 cursor-pointer tabular-nums"
              title="Toggle Scoreboard (Tab)"
            >
              <Users className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#ffcf40]" />
              {room.players.length}P
            </button>
            <button
              type="button"
              onClick={() => {
                setChatOpen((v) => !v);
                window.setTimeout(() => chatInputRef.current?.focus(), 30);
              }}
              className="min-h-[24px] sm:min-h-[26px] px-1 sm:px-1.5 border border-white/20 bg-white/5 hover:bg-white/15 text-[9px] font-bold text-white/90 flex items-center gap-1 cursor-pointer"
              title="Squad Chat (Enter)"
              aria-label="Toggle Squad Chat"
            >
              <MessageSquare className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#19e6ff]" />
              <span className="hidden sm:inline">CHAT</span>
            </button>
            <button
              type="button"
              onClick={onOpenLobby}
              className="min-h-[24px] sm:min-h-[26px] px-1 sm:px-1.5 border border-white/20 bg-white/5 hover:bg-white/15 text-[9px] font-bold text-white/90 cursor-pointer"
            >
              LOBBY
            </button>
            <button
              type="button"
              onClick={() => isHost && setBotsOpen((v) => !v)}
              className={`min-h-[24px] sm:min-h-[26px] px-1 sm:px-1.5 border text-[9px] font-bold flex items-center gap-0.5 tabular-nums ${
                botsOpen
                  ? 'border-[#ffcf40] bg-[#ffcf40]/20 text-[#ffcf40]'
                  : 'border-white/20 bg-white/5 text-white/85'
              } ${isHost ? 'hover:bg-white/15 cursor-pointer' : 'cursor-default opacity-80'}`}
              title={isHost ? 'Adjust bots (0–24)' : `Bots: ${room.config.botCount}`}
            >
              <Bot className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#ffcf40]" />
              {room.config.botCount}
            </button>
            <button
              type="button"
              onPointerDown={() => onSetTalking(true)}
              onPointerUp={() => onSetTalking(false)}
              onPointerLeave={() => onSetTalking(false)}
              onPointerCancel={() => onSetTalking(false)}
              className={`min-h-[24px] sm:min-h-[26px] px-1.5 border text-[9px] font-extrabold flex items-center gap-1 cursor-pointer transition-colors ${
                localTalking
                  ? 'border-[#39e58c] bg-[#39e58c]/25 text-[#39e58c]'
                  : 'border-white/20 bg-white/5 hover:bg-white/15 text-white/80'
              }`}
              title="Push-to-Talk (Hold V)"
              aria-label="Push to talk (Hold V)"
              aria-pressed={localTalking}
            >
              {localTalking ? (
                <Mic className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              ) : (
                <MicOff className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white/60" />
              )}
              <span>V</span>
            </button>
            <span className="hidden sm:inline text-[9px] text-white/55 tabular-nums pl-0.5">{pingMs}ms</span>
          </div>

          {botsOpen && isHost && (
            <div className="pointer-events-auto bg-[#05070d]/95 border border-[#ffcf40]/60 px-2 py-1.5 flex items-center gap-1.5 pixel-box">
              <span className="text-[9px] font-extrabold text-[#ffcf40]">BOTS</span>
              <button
                type="button"
                onClick={() => onUpdateBotCount(Math.max(0, room.config.botCount - 1))}
                className="w-6 h-6 border border-white/25 bg-white/5 hover:bg-white/15 flex items-center justify-center text-white cursor-pointer"
                aria-label="Decrease bots"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="min-w-[20px] text-center text-[11px] font-extrabold text-white tabular-nums">
                {room.config.botCount}
              </span>
              <button
                type="button"
                onClick={() => onUpdateBotCount(Math.min(24, room.config.botCount + 1))}
                className="w-6 h-6 border border-white/25 bg-white/5 hover:bg-white/15 flex items-center justify-center text-white cursor-pointer"
                aria-label="Increase bots"
              >
                <Plus className="w-3 h-3" />
              </button>
              {[0, 4, 8, 12, 24].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onUpdateBotCount(preset)}
                  className={`min-w-[22px] h-6 px-1 border text-[9px] font-extrabold tabular-nums cursor-pointer ${
                    room.config.botCount === preset
                      ? 'border-[#19e6ff] bg-[#19e6ff]/20 text-[#19e6ff]'
                      : 'border-white/15 bg-white/5 text-white/65 hover:text-white'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          )}

          {/* Row 2: Compact 1-Line PvP Vitals & Match Score */}
          {me && room.status === 'playing' && (
            <div className="bg-[#05070d]/88 border border-white/15 px-1.5 py-0.5 sm:px-2 sm:py-1 flex flex-nowrap items-center gap-1.5 sm:gap-2 whitespace-nowrap text-[9px] sm:text-[10px] font-extrabold tabular-nums">
              <span className={me.hp > 35 ? 'text-[#39e58c]' : 'text-[#ff3b5c]'}>
                HP {me.hp}
              </span>
              <span className="text-[#ffcf40]">SHD {me.shield}</span>
              <span className="text-white/85">
                {me.kills}K/{me.deaths}D
              </span>
              <span className="text-white/30">|</span>
              {room.config.mode === 'classic' ? (
                <span>
                  <span className="text-white/65 mr-1">R{room.roundNumber ?? 1}</span>
                  <span className="text-[#19e6ff]">B {room.teamScores.blue}</span>
                  <span className="text-white/50">-</span>
                  <span className="text-[#ff3b5c]">R {room.teamScores.red}</span>
                  <span className="text-white/55 ml-1">/{room.config.scoreLimit}</span>
                </span>
              ) : isTeamMode(room.config.mode) ? (
                <span>
                  <span className="text-[#19e6ff]">B {room.teamScores.blue}</span>
                  <span className="text-white/50">-</span>
                  <span className="text-[#ff3b5c]">R {room.teamScores.red}</span>
                </span>
              ) : room.config.mode === 'survival' ? (
                <span className="text-[#ff9a2b]">
                  ALIVE {aliveCount}/{room.players.length}
                </span>
              ) : isCoopMode(room.config.mode) ? (
                <span className="text-[#39e58c]">CO-OP</span>
              ) : (
                <span className="text-[#19e6ff]">
                  TOP {topLeader ? `${topLeader.kills}/${room.config.scoreLimit}` : '0'}
                </span>
              )}
            </div>
          )}

          {/* Teammate Health Percentage Indicator (accessible only to team members) */}
          {room.status === 'playing' && isTeamScoped && me && teammates.length > 0 && (
            <div
              role="region"
              aria-label="Teammate health status"
              className={`pointer-events-auto w-full max-w-[238px] sm:max-w-[272px] bg-[#05070d]/88 border px-2 py-1 ${
                me.team === 'red' ? 'border-[#ff3b5c]/40' : 'border-[#19e6ff]/40'
              }`}
            >
              <button
                type="button"
                onClick={() => setSquadVitalsCollapsed((v) => !v)}
                className="w-full flex items-center justify-between gap-2 text-[9px] font-extrabold tracking-wider cursor-pointer"
                aria-expanded={!squadVitalsCollapsed}
              >
                <span
                  className={`flex items-center gap-1 ${
                    me.team === 'red' ? 'text-[#ff6b81]' : 'text-[#38e8ff]'
                  }`}
                >
                  <Heart className="w-2.5 h-2.5 shrink-0" />
                  <span>SQUAD HEALTH</span>
                </span>
                <span className="flex items-center gap-1 text-white/70 tabular-nums">
                  <span>
                    {aliveTeammates}/{teammates.length} ALIVE
                  </span>
                  {squadVitalsCollapsed ? (
                    <ChevronDown className="w-3 h-3 text-white/60" />
                  ) : (
                    <ChevronUp className="w-3 h-3 text-white/60" />
                  )}
                </span>
              </button>

              {!squadVitalsCollapsed && (
                <div className="mt-1 flex flex-col gap-1">
                  {teammates.map((mate) => {
                    const hpPct = getHealthPct(mate.hp, mate.maxHp, mate.alive);
                    const hpColorClass = !mate.alive
                      ? 'text-white/40'
                      : hpPct > 60
                      ? 'text-[#39e58c]'
                      : hpPct > 30
                      ? 'text-[#ffcf40]'
                      : 'text-[#ff3b5c]';
                    const barColorClass = !mate.alive
                      ? 'bg-white/20'
                      : hpPct > 60
                      ? 'bg-[#39e58c]'
                      : hpPct > 30
                      ? 'bg-[#ffcf40]'
                      : 'bg-[#ff3b5c]';

                    return (
                      <div key={mate.id} className="flex flex-col gap-0.5">
                        <div className="flex items-center justify-between gap-2 text-[10px] font-bold leading-tight">
                          <span className="flex items-center gap-1 min-w-0">
                            <span
                              className={`truncate max-w-[140px] sm:max-w-[175px] ${
                                mate.alive ? 'text-white/90' : 'text-white/45 line-through'
                              }`}
                            >
                              {mate.name}
                            </span>
                            {mate.talking && (
                              <Mic className="w-2.5 h-2.5 text-[#39e58c] shrink-0" aria-label="Talking" />
                            )}
                          </span>
                          <span className={`tabular-nums font-extrabold shrink-0 ${hpColorClass}`}>
                            {mate.alive ? `${hpPct}%` : '0%'}
                          </span>
                        </div>
                        <div className="w-full h-[3px] bg-white/10 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-150 ${barColorClass}`}
                            style={{ width: `${hpPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Active Talking Team Members Indicator */}
          {talkingTeamMembers.length > 0 && (
            <div
              role="status"
              aria-label="Active voice comms"
              className="bg-[#05070d]/85 border border-[#39e58c]/55 px-2 py-1 flex flex-col gap-1 max-w-full"
            >
              <div className="flex items-center gap-1.5 text-[9px] font-extrabold tracking-wider text-[#39e58c]">
                <Volume2 className="w-3 h-3 shrink-0" />
                <span>{teamScopedVoice ? 'SQUAD VOICE' : 'VOICE COMMS'}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                {talkingTeamMembers.map((tm) => (
                  <div
                    key={tm.id}
                    className="flex items-center justify-between gap-2 text-[10px] font-bold"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Mic className="w-3 h-3 text-[#39e58c] shrink-0" />
                      <span
                        className={`truncate max-w-[140px] ${
                          tm.team === 'red' ? 'text-[#ff6b81]' : 'text-[#38e8ff]'
                        }`}
                      >
                        {tm.name}
                        {tm.id === playerId ? ' (You)' : ''}
                      </span>
                    </div>
                    <span className="flex items-end gap-[2px] h-2.5 shrink-0" aria-hidden="true">
                      <span className="w-0.5 h-1.5 bg-[#39e58c]" />
                      <span className="w-0.5 h-2.5 bg-[#39e58c]" />
                      <span className="w-0.5 h-2 bg-[#39e58c]" />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transient Kill Feed & Squad Chat Toasts (max 2 each, auto-fade, never reach bottom thumbstick) */}
          {(recentKills.length > 0 || recentChats.length > 0) && (
            <div className="flex flex-col items-start gap-0.5 w-full">
              {recentKills.map((k) => (
                <div
                  key={k.id}
                  className="px-1.5 py-0.5 bg-[#05070d]/78 border border-white/15 text-[9px] sm:text-[10px] font-bold flex items-center gap-1 truncate max-w-full"
                >
                  <span className={k.killerTeam === 'blue' ? 'text-[#19e6ff]' : 'text-[#ff3b5c]'}>
                    {k.killerName}
                  </span>
                  <span className="text-white/50 text-[8px] sm:text-[9px]">
                    [{getWeaponById(k.weaponId).shortName}
                    {k.headshot ? ' HS' : ''}]
                  </span>
                  <span className={k.victimTeam === 'blue' ? 'text-[#19e6ff]' : 'text-[#ff3b5c]'}>
                    {k.victimName}
                  </span>
                </div>
              ))}
              {recentChats.map((m) => (
                <div
                  key={m.id}
                  className="px-1.5 py-0.5 bg-[#05070d]/75 border border-white/10 text-[9px] sm:text-[10px] truncate max-w-full"
                >
                  {m.system ? (
                    <span className="text-[#ffcf40]">[HQ] {m.text}</span>
                  ) : (
                    <>
                      <span className={`font-bold ${m.team === 'blue' ? 'text-[#19e6ff]' : 'text-[#ff3b5c]'}`}>
                        {m.senderName}:{' '}
                      </span>
                      <span className="text-white/90">{m.text}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chat Input Drawer (Top-Center below HUD banner only when opened) */}
      {chatOpen && (
        <form
          onSubmit={handleChatSubmit}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-auto w-[min(360px,92vw)] bg-[#05070d]/95 border-2 border-[#19e6ff] p-1.5 flex items-center gap-1.5 pixel-box"
        >
          <input
            ref={chatInputRef}
            type="text"
            maxLength={180}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Message squad..."
            className="flex-1 min-h-[38px] px-2.5 bg-[#0b1224] border border-white/20 text-xs text-white focus:outline-none"
          />
          <button
            type="submit"
            className="min-h-[38px] px-3 border border-[#19e6ff] bg-[#19e6ff]/20 text-[#19e6ff] cursor-pointer"
            aria-label="Send chat"
          >
            <Send className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setChatOpen(false);
              onFocusArena();
            }}
            className="min-h-[38px] px-2 border border-white/20 bg-white/5 text-white/70 hover:text-white cursor-pointer"
            aria-label="Close chat"
          >
            <X className="w-4 h-4" />
          </button>
        </form>
      )}

      {/* Classic Round Intermission / Eliminated Status Banner */}
      {showPlayOverlay && room.status === 'playing' && room.config.mode === 'classic' && room.roundWinner ? (
        <div className="fixed inset-x-0 top-[116px] flex justify-center pointer-events-none">
          <div
            className={`bg-[#05070d]/88 border-2 px-4 py-1.5 text-center pixel-box ${
              room.roundWinner === 'blue' ? 'border-[#19e6ff]' : 'border-[#ff3b5c]'
            }`}
          >
            <div
              className={`font-pixel-display text-[10px] sm:text-[11px] tracking-wider ${
                room.roundWinner === 'blue' ? 'text-[#19e6ff]' : 'text-[#ff3b5c]'
              }`}
            >
              ROUND {room.roundNumber ?? 1} WON BY {room.roundWinner.toUpperCase()} SQUAD
            </div>
            <div className="text-[11px] text-white/85 mt-0.5 tabular-nums">
              Blue {room.teamScores.blue} - {room.teamScores.red} Red (First to {room.config.scoreLimit}) · Next round in{' '}
              {(nextRoundRemaining ?? 0).toFixed(1)}s
            </div>
          </div>
        </div>
      ) : (
        showPlayOverlay &&
        me &&
        !me.alive &&
        room.status === 'playing' && (
          <div className="fixed inset-x-0 top-[116px] flex justify-center pointer-events-none">
            <div className="bg-[#05070d]/85 border-2 border-[#ff3b5c] px-4 py-1.5 text-center pixel-box">
              <div className="font-pixel-display text-[10px] sm:text-[11px] text-[#ff3b5c] tracking-wider">
                ELIMINATED{lastKillerName ? ` BY ${lastKillerName.toUpperCase()}` : ''}
              </div>
              <div className="text-[11px] text-white/80 mt-0.5 tabular-nums">
                {room.config.mode === 'classic'
                  ? 'No respawn this round · Spectating squad'
                  : respawnRemaining !== null
                  ? `Respawning in ${respawnRemaining.toFixed(1)}s...`
                  : 'Spectating live operatives'}
              </div>
            </div>
          </div>
        )
      )}

      {/* Tab Scoreboard Modal */}
      {scoreboardOpen && room.status === 'playing' && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-[#05070d]/60 backdrop-blur-xs pointer-events-auto">
          <div className="w-full max-w-2xl bg-[#070b16] border-2 border-[#19e6ff]/60 pixel-box p-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3">
              <div className="font-pixel-display text-xs text-[#19e6ff]">
                SCOREBOARD // {room.code}
              </div>
              <button
                type="button"
                onClick={() => setScoreboardOpen(false)}
                className="min-h-[36px] px-2.5 border border-white/20 text-xs text-white/75 hover:text-white cursor-pointer"
              >
                CLOSE
              </button>
            </div>
            <table className="w-full text-left text-xs tabular-nums">
              <thead>
                <tr className="text-white/50 border-b border-white/10">
                  <th className="py-1.5">PLAYER</th>
                  <th className="py-1.5">TEAM</th>
                  {isTeamScoped && me && <th className="py-1.5 text-right">HP</th>}
                  <th className="py-1.5 text-right">KILLS</th>
                  <th className="py-1.5 text-right">DEATHS</th>
                  <th className="py-1.5 text-right">SCORE</th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((p) => {
                  const pTalking = p.id === playerId ? localTalking || Boolean(p.talking) : Boolean(p.talking);
                  const canShowVoice = !teamScopedVoice || !me || p.team === me.team;
                  const canShowHealth = Boolean(isTeamScoped && me && p.team === me.team);
                  const hpPct = getHealthPct(p.hp, p.maxHp, p.alive);
                  return (
                    <tr key={p.id} className="border-b border-white/5">
                      <td className="py-2 font-extrabold text-white">
                        <span className="inline-flex items-center gap-1.5">
                          <span>
                            {p.name}
                            {p.id === playerId ? ' (YOU)' : ''}
                          </span>
                          {pTalking && canShowVoice && (
                            <Mic className="w-3.5 h-3.5 text-[#39e58c]" aria-label="Talking" />
                          )}
                        </span>
                      </td>
                      <td className={`py-2 font-bold ${p.team === 'blue' ? 'text-[#19e6ff]' : 'text-[#ff3b5c]'}`}>
                        {p.team.toUpperCase()}
                      </td>
                      {isTeamScoped && me && (
                        <td
                          className={`py-2 text-right font-bold tabular-nums ${
                            !canShowHealth
                              ? 'text-white/25'
                              : !p.alive
                              ? 'text-white/40'
                              : hpPct > 60
                              ? 'text-[#39e58c]'
                              : hpPct > 30
                              ? 'text-[#ffcf40]'
                              : 'text-[#ff3b5c]'
                          }`}
                        >
                          {canShowHealth ? `${hpPct}%` : '—'}
                        </td>
                      )}
                      <td className="py-2 text-right font-bold text-[#39e58c]">{p.kills}</td>
                      <td className="py-2 text-right text-white/75">{p.deaths}</td>
                      <td className="py-2 text-right font-bold text-[#ffcf40]">{p.score}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Post-Match Leaderboard Screen */}
      {room.status === 'ended' && (
        <PostMatchLeaderboard
          room={room}
          playerId={playerId}
          isHost={isHost}
          onRestartMatch={onRestartMatch}
          onReturnToLobby={onReturnToLobby}
          onLeaveRoom={onLeaveRoom}
        />
      )}
    </div>
  );
};
