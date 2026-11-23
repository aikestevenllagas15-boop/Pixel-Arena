import React, { useEffect } from 'react';
import { Camera, ChevronLeft, Eye, UserCheck } from 'lucide-react';
import type { SpectateState } from '../lib/iframeGameBridge';
import { getWeaponById } from '../types/multiplayer';

interface SpectateOverlayProps {
  spectateState: SpectateState | null;
  visible: boolean;
  onFollowNext: () => void;
  onFollowPrev: () => void;
  onToggleMode: () => void;
}

export const SpectateOverlay: React.FC<SpectateOverlayProps> = ({
  spectateState,
  visible,
  onFollowNext,
  onFollowPrev,
  onToggleMode,
}) => {
  const isActive = Boolean(visible && spectateState?.active);

  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        onFollowPrev();
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        onFollowNext();
      } else if (e.code === 'KeyC') {
        onToggleMode();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isActive, onFollowNext, onFollowPrev, onToggleMode]);

  if (!isActive || !spectateState) {
    return null;
  }

  const hasTarget = Boolean(spectateState.targetId && spectateState.targetName);
  const canSwitchTarget = spectateState.aliveCount > 1;
  const hpPct =
    spectateState.targetMaxHp > 0
      ? Math.max(0, Math.min(100, (spectateState.targetHp / spectateState.targetMaxHp) * 100))
      : 0;
  const weaponName = getWeaponById(spectateState.targetWeaponId).shortName;
  const teamLabel = spectateState.targetTeam === 'red' ? 'Red Squad' : 'Blue Squad';
  const teamAccent = spectateState.targetTeam === 'red' ? 'text-[#ff6b81]' : 'text-[#38e8ff]';

  return (
    <div
      role="region"
      aria-label="Spectator overlay"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-auto max-w-[94vw] select-none"
    >
      <div className="bg-[#05070d]/55 backdrop-blur-md border border-white/15 shadow-[0_14px_38px_rgba(0,0,0,0.48)] px-3.5 py-2.5 sm:px-4 sm:py-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 sm:gap-4">
        {/* Watched Player Identity & Live Status */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 shrink-0 bg-white/5 border border-white/15 flex items-center justify-center text-[#38e8ff]">
            <Eye className="w-4 h-4" />
          </div>

          <div className="min-w-0 flex flex-col">
            <div className="flex items-center gap-2 text-[11px] text-white/65 font-semibold leading-none mb-1">
              <span>Spectating</span>
              {hasTarget && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className={teamAccent}>{teamLabel}</span>
                  {spectateState.aliveCount > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums text-white/75">
                        {spectateState.targetIndex} of {spectateState.aliveCount}
                      </span>
                    </>
                  )}
                </>
              )}
            </div>

            {hasTarget ? (
              <>
                <div className="flex items-baseline gap-2.5 min-w-0">
                  <span className="text-sm sm:text-base font-extrabold tracking-wide text-white truncate max-w-[180px] sm:max-w-[240px]">
                    {spectateState.targetName}
                  </span>
                  <span className="text-xs font-semibold text-white/70 tabular-nums whitespace-nowrap shrink-0">
                    {spectateState.targetHp}/{spectateState.targetMaxHp} HP · {weaponName}
                  </span>
                </div>

                {/* Subtle Target Health Line */}
                <div className="mt-1.5 w-full max-w-[220px] h-1 bg-white/10 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-150 ${
                      hpPct > 35 ? 'bg-[#39e58c]' : 'bg-[#ff3b5c]'
                    }`}
                    style={{ width: `${hpPct}%` }}
                  />
                </div>
              </>
            ) : (
              <span className="text-xs sm:text-sm font-semibold text-white/75 whitespace-nowrap">
                Waiting for an active player...
              </span>
            )}
          </div>
        </div>

        {/* Target & Camera Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
          {canSwitchTarget && (
            <button
              type="button"
              onClick={onFollowPrev}
              className="min-h-[40px] sm:min-h-[44px] px-2.5 border border-white/15 bg-white/5 hover:bg-white/15 text-white/90 flex items-center justify-center cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38e8ff]"
              aria-label="Follow previous player"
              title="Previous player (A / Left Arrow)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={onFollowNext}
            disabled={!canSwitchTarget}
            className="min-h-[40px] sm:min-h-[44px] px-4 py-2 border border-[#38e8ff]/60 bg-[#38e8ff]/18 hover:bg-[#38e8ff]/30 disabled:opacity-45 disabled:hover:bg-[#38e8ff]/18 text-xs sm:text-sm font-bold tracking-wide text-[#e8fbff] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-default transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38e8ff]"
            title={
              canSwitchTarget && spectateState.nextTargetName
                ? `Switch to ${spectateState.nextTargetName} (D / Right Arrow)`
                : 'Switch between live targets'
            }
          >
            <UserCheck className="w-4 h-4 text-[#38e8ff]" />
            <span>Follow</span>
          </button>

          <button
            type="button"
            onClick={onToggleMode}
            disabled={!hasTarget}
            className="min-h-[40px] sm:min-h-[44px] px-3 py-2 border border-white/15 bg-white/5 hover:bg-white/15 disabled:opacity-45 text-xs font-bold text-white/90 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-default transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38e8ff]"
            title="Switch Chase / First-Person View (C)"
          >
            <Camera className="w-3.5 h-3.5 text-[#ffcf40]" />
            <span>{spectateState.mode === 'chase' ? 'Chase' : '1st POV'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
