import React, { useEffect, useMemo, useState } from 'react';
import { Crosshair, RotateCcw, Trophy } from 'lucide-react';
import { getMapById, getModeById, isTeamMode } from '../types/multiplayer';
import type { RemotePlayerState, RoomSnapshot } from '../types/multiplayer';

interface PostMatchLeaderboardProps {
  room: RoomSnapshot;
  playerId: string | null;
  isHost: boolean;
  onRestartMatch: () => void;
  onReturnToLobby: () => void;
  onLeaveRoom: () => void;
}

type SquadFilter = 'all' | 'blue' | 'red';

function calcAccuracyPct(p: RemotePlayerState): number | null {
  const fired = p.shotsFired ?? 0;
  const hit = p.shotsHit ?? 0;
  if (fired <= 0) return null;
  return Math.min(100, Math.round((hit / fired) * 100));
}

function calcKdRatio(p: RemotePlayerState): string {
  if (p.deaths <= 0) return p.kills > 0 ? p.kills.toFixed(2) : '0.00';
  return (p.kills / p.deaths).toFixed(2);
}

export const PostMatchLeaderboard: React.FC<PostMatchLeaderboardProps> = ({
  room,
  playerId,
  isHost,
  onRestartMatch,
  onReturnToLobby,
  onLeaveRoom,
}) => {
  const [squadFilter, setSquadFilter] = useState<SquadFilter>('all');

  useEffect(() => {
    try {
      document.exitPointerLock?.();
    } catch {
      // ignore pointer lock exit failure
    }
  }, []);

  const mapInfo = getMapById(room.config.mapId);
  const modeInfo = getModeById(room.config.mode);
  const teamBased = isTeamMode(room.config.mode);

  const rankedPlayers = useMemo(() => {
    return [...room.players].sort((a, b) => {
      if (b.kills !== a.kills) return b.kills - a.kills;
      if (b.score !== a.score) return b.score - a.score;
      if (a.deaths !== b.deaths) return a.deaths - b.deaths;
      return (calcAccuracyPct(b) ?? -1) - (calcAccuracyPct(a) ?? -1);
    });
  }, [room.players]);

  const filteredPlayers = useMemo(() => {
    if (!teamBased || squadFilter === 'all') return rankedPlayers;
    return rankedPlayers.filter((p) => p.team === squadFilter);
  }, [rankedPlayers, squadFilter, teamBased]);

  const topFragger = rankedPlayers[0] ?? null;
  const sharpshooter = useMemo(() => {
    const withShots = rankedPlayers.filter((p) => (p.shotsFired ?? 0) > 0);
    if (withShots.length === 0) return null;
    return [...withShots].sort((a, b) => {
      const accA = calcAccuracyPct(a) ?? 0;
      const accB = calcAccuracyPct(b) ?? 0;
      if (accB !== accA) return accB - accA;
      return (b.shotsHit ?? 0) - (a.shotsHit ?? 0);
    })[0];
  }, [rankedPlayers]);

  const me = room.players.find((p) => p.id === playerId) ?? null;
  const myAccuracy = me ? calcAccuracyPct(me) : null;
  const sharpAccuracy = sharpshooter ? calcAccuracyPct(sharpshooter) : null;

  const winningTeam =
    room.winner?.type === 'team' ? (room.winner.id === 'red' ? 'red' : 'blue') : null;
  const accentBorder =
    winningTeam === 'blue'
      ? 'border-[#19e6ff]'
      : winningTeam === 'red'
      ? 'border-[#ff3b5c]'
      : 'border-[#ffcf40]';
  const headlineColor =
    winningTeam === 'blue'
      ? 'text-[#19e6ff]'
      : winningTeam === 'red'
      ? 'text-[#ff3b5c]'
      : 'text-[#ffcf40]';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Post-match leaderboard"
      className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-6 bg-[#05070d]/84 backdrop-blur-md pointer-events-auto"
    >
      <div
        className={`w-full max-w-4xl max-h-[92dvh] bg-[#070b16] border-2 ${accentBorder} pixel-box flex flex-col overflow-hidden`}
      >
        {/* Header: Match Outcome & Final Score */}
        <div className="px-5 py-4 border-b border-white/10 bg-[#05070d]/85 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <Trophy className={`w-7 h-7 shrink-0 ${headlineColor}`} />
            <div>
              <h2
                className={`font-pixel-display text-sm sm:text-base tracking-wider leading-snug ${headlineColor}`}
              >
                {room.winner?.label ?? 'Match Complete'}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-white/65 mt-1 tabular-nums">
                <span>{mapInfo.name}</span>
                <span aria-hidden="true">·</span>
                <span>{modeInfo.name}</span>
                {room.config.mode === 'classic' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{room.roundNumber ?? 1} Rounds Played</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {teamBased && (
            <div className="flex items-center gap-4 text-right tabular-nums shrink-0">
              <div>
                <div className="text-[11px] font-bold text-[#19e6ff]">Blue Squad</div>
                <div className="font-pixel-display text-lg sm:text-xl text-white">
                  {room.teamScores.blue}
                </div>
              </div>
              <span className="text-white/35 text-sm font-bold">-</span>
              <div>
                <div className="text-[11px] font-bold text-[#ff3b5c]">Red Squad</div>
                <div className="font-pixel-display text-lg sm:text-xl text-white">
                  {room.teamScores.red}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Highlights Strip: Top Fragger, Best Accuracy & Local Operative Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/10 border-b border-white/10 bg-white/[0.02]">
          <div className="px-5 py-3.5">
            <div className="text-[11px] font-bold text-white/55">Top Fragger</div>
            {topFragger ? (
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span
                  className={`text-sm font-extrabold truncate ${
                    topFragger.team === 'blue' ? 'text-[#19e6ff]' : 'text-[#ff3b5c]'
                  }`}
                >
                  {topFragger.name}
                  {topFragger.id === playerId ? ' (You)' : ''}
                </span>
                <span className="text-xs font-bold text-[#ffcf40] tabular-nums shrink-0">
                  {topFragger.kills} Kills · {calcKdRatio(topFragger)} K/D
                </span>
              </div>
            ) : (
              <div className="mt-1 text-xs text-white/40">No eliminations recorded</div>
            )}
          </div>

          <div className="px-5 py-3.5">
            <div className="text-[11px] font-bold text-white/55 flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5 text-[#39e58c]" />
              <span>Highest Accuracy</span>
            </div>
            {sharpshooter && sharpAccuracy !== null ? (
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span
                  className={`text-sm font-extrabold truncate ${
                    sharpshooter.team === 'blue' ? 'text-[#19e6ff]' : 'text-[#ff3b5c]'
                  }`}
                >
                  {sharpshooter.name}
                  {sharpshooter.id === playerId ? ' (You)' : ''}
                </span>
                <span className="text-xs font-bold text-[#39e58c] tabular-nums shrink-0">
                  {sharpAccuracy}% ({sharpshooter.shotsHit ?? 0}/{sharpshooter.shotsFired ?? 0})
                </span>
              </div>
            ) : (
              <div className="mt-1 text-xs text-white/40">No shots fired</div>
            )}
          </div>

          <div className="px-5 py-3.5">
            <div className="text-[11px] font-bold text-white/55">Your Performance</div>
            {me ? (
              <div className="mt-1 flex items-baseline justify-between gap-2 tabular-nums">
                <span className="text-sm font-extrabold text-white">
                  {me.kills}K / {me.deaths}D
                </span>
                <span className="text-xs font-bold text-white/80">
                  {myAccuracy !== null ? `${myAccuracy}% Acc` : '0% Acc'} · {me.headshots ?? 0} HS
                </span>
              </div>
            ) : (
              <div className="mt-1 text-xs text-white/40">Spectator</div>
            )}
          </div>
        </div>

        {/* Squad Filter Controls & Leaderboard Table */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-extrabold tracking-wide text-white/85">
              Post-Match Leaderboard ({rankedPlayers.length})
            </h3>
            {teamBased && (
              <div className="flex items-center gap-1 p-0.5 bg-[#05070d] border border-white/15">
                {(['all', 'blue', 'red'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setSquadFilter(tab)}
                    className={`min-h-[30px] px-3 text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      squadFilter === tab
                        ? tab === 'blue'
                          ? 'bg-[#19e6ff]/20 text-[#19e6ff]'
                          : tab === 'red'
                          ? 'bg-[#ff3b5c]/20 text-[#ff3b5c]'
                          : 'bg-white/15 text-white'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    {tab === 'all' ? 'All Players' : tab === 'blue' ? 'Blue Squad' : 'Red Squad'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="overflow-x-auto border border-white/10">
            <table className="w-full text-left text-xs tabular-nums border-collapse">
              <thead>
                <tr className="bg-[#05070d]/70 text-white/55 border-b border-white/10">
                  <th className="py-2.5 px-3 font-bold w-12">Rank</th>
                  <th className="py-2.5 px-3 font-bold">Player</th>
                  {teamBased && <th className="py-2.5 px-3 font-bold">Squad</th>}
                  <th className="py-2.5 px-3 font-bold text-right">Kills</th>
                  <th className="py-2.5 px-3 font-bold text-right">Deaths</th>
                  <th className="py-2.5 px-3 font-bold text-right">K/D</th>
                  <th className="py-2.5 px-3 font-bold text-right">Accuracy</th>
                  <th className="py-2.5 px-3 font-bold text-right">Headshots</th>
                  <th className="py-2.5 px-3 font-bold text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.map((p) => {
                  const overallRank = rankedPlayers.findIndex((rp) => rp.id === p.id) + 1;
                  const acc = calcAccuracyPct(p);
                  const fired = p.shotsFired ?? 0;
                  const hit = p.shotsHit ?? 0;
                  const hs = p.headshots ?? 0;
                  const isMe = p.id === playerId;
                  return (
                    <tr
                      key={p.id}
                      className={`border-b border-white/5 ${
                        isMe ? 'bg-[#19e6ff]/[0.08]' : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-extrabold text-[#ffcf40]">#{overallRank}</td>
                      <td className="py-2.5 px-3 font-bold text-white max-w-[180px] truncate">
                        {p.name}
                        {isMe ? ' (You)' : ''}
                      </td>
                      {teamBased && (
                        <td
                          className={`py-2.5 px-3 font-bold ${
                            p.team === 'blue' ? 'text-[#19e6ff]' : 'text-[#ff3b5c]'
                          }`}
                        >
                          {p.team === 'blue' ? 'Blue' : 'Red'}
                        </td>
                      )}
                      <td className="py-2.5 px-3 text-right font-extrabold text-[#39e58c]">
                        {p.kills}
                      </td>
                      <td className="py-2.5 px-3 text-right text-white/75">{p.deaths}</td>
                      <td className="py-2.5 px-3 text-right text-white/85">{calcKdRatio(p)}</td>
                      <td className="py-2.5 px-3 text-right">
                        {acc !== null ? (
                          <span className="font-bold text-white">
                            {acc}%{' '}
                            <span className="text-[11px] font-normal text-white/45">
                              ({hit}/{fired})
                            </span>
                          </span>
                        ) : (
                          <span className="text-white/40">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right text-white/80">{hs}</td>
                      <td className="py-2.5 px-3 text-right font-extrabold text-[#ffcf40]">
                        {p.score}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Footer */}
        <div className="px-5 py-3.5 border-t border-white/10 bg-[#05070d]/85 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onLeaveRoom}
            className="min-h-[44px] px-4 border border-white/25 bg-white/5 hover:bg-white/15 text-xs font-bold text-white/85 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Leave Room
          </button>

          <div className="flex flex-wrap items-center gap-2.5 ml-auto">
            {isHost ? (
              <>
                <button
                  type="button"
                  onClick={onReturnToLobby}
                  className="min-h-[44px] px-4 border border-[#19e6ff]/60 bg-[#19e6ff]/15 hover:bg-[#19e6ff]/25 text-[#19e6ff] text-xs font-extrabold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Change Map / Mode
                </button>
                <button
                  type="button"
                  onClick={onRestartMatch}
                  className="min-h-[44px] px-5 border-2 border-[#39e58c] bg-[#39e58c]/20 hover:bg-[#39e58c]/30 text-[#39e58c] text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Play Again</span>
                </button>
              </>
            ) : (
              <span className="text-xs text-white/65 px-2">
                Waiting for host to select Play Again...
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
