import {
  getMapById,
  getWeaponById,
  isCoopMode,
  isMapCompatibleWithMode,
  isTeamMode,
} from '../types/multiplayer';
import type { GameModeId, RemotePlayerState, TeamId, TracerFxEvent } from '../types/multiplayer';
import type { LivePose } from '../hooks/useMultiplayerSocket';

interface ThreeLike {
  Object3D: new () => any;
  Group: new () => any;
  Mesh: new (geo?: any, mat?: any) => any;
  BoxGeometry: new (w?: number, h?: number, d?: number) => any;
  CylinderGeometry: new (rt?: number, rb?: number, h?: number, seg?: number) => any;
  PlaneGeometry: new (w?: number, h?: number) => any;
  OctahedronGeometry: new (radius?: number, detail?: number) => any;
  MeshStandardMaterial: new (params?: any) => any;
  MeshBasicMaterial: new (params?: any) => any;
  Sprite: new (mat?: any) => any;
  SpriteMaterial: new (params?: any) => any;
  CanvasTexture: new (canvas: HTMLCanvasElement) => any;
  Raycaster: new () => any;
  Vector2: new (x?: number, y?: number) => any;
  Vector3: new (x?: number, y?: number, z?: number) => any;
  Quaternion: new () => any;
  Euler: new (x?: number, y?: number, z?: number, order?: string) => any;
  Matrix4: new () => any;
  Color: new (color: string | number) => any;
}

interface ArenaWindow extends Window {
  __arenaScene?: any;
  __arenaCamera?: any;
  THREE?: ThreeLike;
}

export type SpectateMode = 'chase' | 'pov';

export interface SpectateState {
  active: boolean;
  targetId: string | null;
  targetName: string | null;
  targetTeam: TeamId | null;
  targetHp: number;
  targetMaxHp: number;
  targetWeaponId: number;
  targetIndex: number;
  nextTargetName: string | null;
  mode: SpectateMode;
  aliveCount: number;
}

interface RemoteRig {
  playerId: string;
  root: any;
  shadowMesh: any;
  allyBadge: any;
  body: any;
  tor: any;
  neck: any;
  sR: any;
  eR: any;
  sL: any;
  eL: any;
  hipL: any;
  kneeL: any;
  hipR: any;
  kneeR: any;
  gun: any;
  weaponGroups: any[];
  muzzleFlash: any;
  bodyHitbox: any;
  headHitbox: any;
  labelSprite: any;
  labelCanvas: HTMLCanvasElement;
  labelKey: string;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetYaw: number;
  targetPitch: number;
  targetWeaponId: number;
  targetAds: boolean;
  targetCrouching: boolean;
  smoothSpeed: number;
  walkPhase: number;
  aimBlend: number;
  crouchBlend: number;
  airBlend: number;
  kickTimer: number;
  flinchTimer: number;
  swapTimer: number;
  knifeSlashTimer: number;
  punchTimer: number;
  punchHand: 0 | 1;
  landTimer: number;
  muzzleTimer: number;
  wasAirborne: boolean;
  wasAlive: boolean;
  deathTimer: number;
  deathTwist: number;
  deathFallDir: number;
  lastTeam: TeamId;
}

interface ActiveTracer {
  mesh: any;
  expiresAt: number;
}

export interface BridgeCallbacks {
  onPoseUpdate: (pose: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    weaponId: number;
    ads: boolean;
    crouching: boolean;
  }) => void;
  onShoot: (weaponId: number, origin: [number, number, number], hitPoint: [number, number, number]) => void;
  onHit: (targetId: string, headshot: boolean, weaponId: number) => void;
  onSoloMenuVisibleChange?: (visible: boolean) => void;
  onHudStateChange?: (state: { inActiveMatch: boolean; dockTopPx: number }) => void;
  onSpectateStateChange?: (state: SpectateState) => void;
  onTalkingChange?: (talking: boolean) => void;
  onDeployingChange?: (deploying: boolean) => void;
}

interface CachedPoseState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  weaponId: number;
  ads: boolean;
  crouching: boolean;
  vx: number;
  vy: number;
  vz: number;
  updatedAt: number;
}

const WEAPON_LABELS = ['CARBINE', 'SHOTGUN', 'RAILGUN', 'PISTOL', 'SNIPER', 'KNIFE'];
const MUZZLE_Y_BY_WEAPON = [-0.55, -0.62, -0.82, -0.34, -0.92, -0.4];
const FOREGRIP_BY_WEAPON: Array<[number, number, number]> = [
  [0, -0.3, -0.07],
  [0, -0.33, -0.07],
  [0, -0.39, -0.08],
  [0, -0.09, -0.08],
  [0, -0.39, -0.07],
  [0.14, 0.12, 0.08],
];

const lerpNum = (a: number, b: number, t: number) => a + (b - a) * t;

export class IframeGameBridge {
  private iframe: HTMLIFrameElement;
  private callbacks: BridgeCallbacks;
  private rafId = 0;
  private lastFrameTime = performance.now();
  private currentScene: any = null;
  private mpRoot: any = null;
  private remoteRigs = new Map<string, RemoteRig>();
  private livePoses = new Map<string, CachedPoseState>();
  private activeTracers: ActiveTracer[] = [];
  private remotePlayers: RemotePlayerState[] = [];
  private localPlayerId: string | null = null;
  private localTeam: TeamId = 'blue';
  private roomMode: GameModeId = 'ffa';
  private localAlive = true;
  private matchPlaying = false;
  private currentWeaponId = 0;
  private isTriggerHeld = false;
  private lastShotTime = 0;
  private localCrouchKeys = new Set<string>();
  private localSlideUntil = 0;
  private listenersAttachedToDoc: Document | null = null;
  private deployTimer: number | null = null;
  private isDeploying = false;
  private deployTargetKey = '';
  private deployStartedAt = 0;
  private deployActionClicked = false;
  private lastAutoRedeployCheck = 0;
  private lastDomPollTime = 0;
  private cachedInActiveMatch = false;
  private cachedSoloMenuVisible: boolean | null = null;
  private cachedHudInActiveMatch: boolean | null = null;
  private cachedDockTopPx = 74;
  private cachedWeaponEl: Element | null = null;
  private lastPatchedMapGroup: any = null;
  private activeIdsScratch = new Set<string>();
  private hitTargetsScratch: any[] = [];
  private desiredBotCount: number | null = null;
  private cachedEngine: any = null;
  private pendingSpawnSync = false;
  private suspendedBotsByEngine = new WeakMap<any, any[]>();
  private lastLocalSlashAnim = 0;
  private lastLocalSlashDir = 1;

  // Spectating state when dead
  private spectateTargetId: string | null = null;
  private spectateMode: SpectateMode = 'chase';
  private spectateSmoothX = 0;
  private spectateSmoothY = 0;
  private spectateSmoothZ = 0;
  private spectateSmoothYaw = 0;
  private spectateSmoothPitch = 0;
  private spectateInitializedTarget: string | null = null;
  private lastSpectateEmitKey = '';
  private hiddenCamChildren = new WeakSet<any>();

  private rayHelper: {
    three: ThreeLike;
    raycaster: any;
    ndcCenter: any;
    dirVec: any;
    upVec: any;
    quat: any;
    tracerGeo: any;
    tracerMats: Map<string, any>;
    ik: {
      d: any;
      dh: any;
      p: any;
      u: any;
      f: any;
      k: any;
      ex: any;
      ey: any;
      v: any;
      w: any;
      tr: any;
      tl: any;
      mat4: any;
      euler: any;
      specOrigin: any;
      specDesired: any;
      specDir: any;
    };
    rigAssets: {
      skin: any;
      pants: any;
      boot: any;
      belt: any;
      gunDark: any;
      gunMetal: any;
      knifeBlade: any;
      blueShirt: any;
      blueVest: any;
      blueHelm: any;
      blueVisor: any;
      redShirt: any;
      redVest: any;
      redHelm: any;
      redVisor: any;
      cyanAlly: any;
      shotgunAccent: any;
      muzzle: any;
      hit: any;
      shadowMat: any;
      shadowGeo: any;
      allyBadgeGeo: any;
      headHitGeo: any;
      bodyHitGeo: any;
    };
  } | null = null;

  constructor(iframe: HTMLIFrameElement, callbacks: BridgeCallbacks) {
    this.iframe = iframe;
    this.callbacks = callbacks;
  }

  public start(): void {
    if (this.rafId) return;
    this.lastFrameTime = performance.now();
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      this.step();
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public stop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.cancelDeploy();
    this.detachInputListeners();
    this.cleanupSceneObjects();
  }

  public cancelDeploy(): void {
    if (this.deployTimer) {
      window.clearTimeout(this.deployTimer);
      this.deployTimer = null;
    }
    this.deployActionClicked = false;
    this.deployTargetKey = '';
    if (this.isDeploying) {
      this.isDeploying = false;
      this.callbacks.onDeployingChange?.(false);
    }
  }

  public setRoomState(
    localPlayerId: string | null,
    players: RemotePlayerState[],
    matchPlaying: boolean,
    mode: GameModeId = 'ffa',
    botCount?: number
  ): void {
    const wasPlaying = this.matchPlaying;
    const wasAlive = this.localAlive;
    this.localPlayerId = localPlayerId;
    this.remotePlayers = players;
    this.matchPlaying = matchPlaying;
    this.roomMode = mode;
    if (typeof botCount === 'number') {
      this.desiredBotCount = Math.max(0, Math.min(24, Math.round(botCount)));
    }

    const me = players.find((p) => p.id === localPlayerId);
    this.localAlive = me ? me.alive : true;
    this.localTeam = me ? me.team : 'blue';

    if (!wasPlaying && matchPlaying) {
      this.pendingSpawnSync = true;
    } else if (wasPlaying && !matchPlaying) {
      try {
        document.exitPointerLock?.();
        this.getArenaWindow()?.document.exitPointerLock?.();
      } catch {
        // ignore pointer lock exit failure
      }
    }

    if (this.localAlive && !wasAlive) {
      this.onLocalRespawn();
    } else if (!this.localAlive && wasAlive && this.matchPlaying) {
      try {
        this.getArenaWindow()?.document.exitPointerLock?.();
      } catch {
        // ignore pointer lock exit failure
      }
    }

    if (this.localAlive) {
      const cw = this.getArenaWindow();
      if (cw?.__arenaCamera) {
        this.restoreLocalViewmodel(cw.__arenaCamera);
      }
      this.spectateInitializedTarget = null;
    }

    const now = performance.now();
    for (const p of players) {
      const prev = this.livePoses.get(p.id);
      if (!prev) {
        this.livePoses.set(p.id, {
          x: p.x,
          y: p.y,
          z: p.z,
          yaw: p.yaw,
          pitch: p.pitch,
          weaponId: p.weaponId,
          ads: p.ads,
          crouching: p.crouching,
          vx: 0,
          vy: 0,
          vz: 0,
          updatedAt: now,
        });
      } else if (now - prev.updatedAt > 650) {
        // Refresh stale cached pose from room snapshot (e.g. after reconnect or respawn)
        prev.x = p.x;
        prev.y = p.y;
        prev.z = p.z;
        prev.yaw = p.yaw;
        prev.pitch = p.pitch;
        prev.weaponId = p.weaponId;
        prev.ads = p.ads;
        prev.crouching = p.crouching;
        prev.vx = 0;
        prev.vy = 0;
        prev.vz = 0;
        prev.updatedAt = now;
      }
    }
  }

  public setBotCount(count: number | null): void {
    this.desiredBotCount = count === null ? null : Math.max(0, Math.min(24, Math.round(count)));
  }

  public onLocalRespawn(): void {
    const cw = this.getArenaWindow();
    if (!cw) return;
    const engine = this.findEngine(cw);
    if (engine?.player) {
      engine.player.alive = true;
      engine.player.hp = engine.player.maxHp ?? 100;
      engine.player.shield = engine.player.maxShield ?? 50;
      engine.spectating = false;
      engine.deathAnim = 0;
      if (engine.phase === 'gameover') {
        engine.phase = 'playing';
      }
      this.pendingSpawnSync = true;
    }
    if (cw.__arenaCamera) {
      this.restoreLocalViewmodel(cw.__arenaCamera);
    }
  }

  public updateRemotePose(pose: LivePose): void {
    const now = performance.now();
    const prev = this.livePoses.get(pose.id);
    if (!prev) {
      this.livePoses.set(pose.id, {
        x: pose.x,
        y: pose.y,
        z: pose.z,
        yaw: pose.yaw,
        pitch: pose.pitch,
        weaponId: pose.weaponId,
        ads: pose.ads,
        crouching: pose.crouching,
        vx: 0,
        vy: 0,
        vz: 0,
        updatedAt: now,
      });
      return;
    }

    const pktDt = Math.max(0.016, Math.min(0.25, (now - prev.updatedAt) / 1000));
    const dx = pose.x - prev.x;
    const dy = pose.y - prev.y;
    const dz = pose.z - prev.z;
    const jumpDist = Math.hypot(dx, dy, dz);

    if (jumpDist > 10) {
      prev.vx = 0;
      prev.vy = 0;
      prev.vz = 0;
    } else {
      const rawVx = dx / pktDt;
      const rawVy = dy / pktDt;
      const rawVz = dz / pktDt;
      prev.vx = Math.max(-28, Math.min(28, prev.vx * 0.35 + rawVx * 0.65));
      prev.vy = Math.max(-28, Math.min(28, prev.vy * 0.35 + rawVy * 0.65));
      prev.vz = Math.max(-28, Math.min(28, prev.vz * 0.35 + rawVz * 0.65));
    }

    prev.x = pose.x;
    prev.y = pose.y;
    prev.z = pose.z;
    prev.yaw = pose.yaw;
    prev.pitch = pose.pitch;
    prev.weaponId = pose.weaponId;
    prev.ads = pose.ads;
    prev.crouching = pose.crouching;
    prev.updatedAt = now;
  }

  public spawnTracer(ev: TracerFxEvent): void {
    const cw = this.getArenaWindow();
    if (!cw || !cw.THREE || !this.mpRoot) return;
    const THREE = cw.THREE;

    const rig = this.remoteRigs.get(ev.shooterId);
    if (rig) {
      if (ev.weaponId === 5) {
        rig.knifeSlashTimer = 0.28;
        rig.punchTimer = 0.34;
        rig.punchHand = rig.punchHand === 0 ? 1 : 0;
        rig.muzzleTimer = 0;
      } else {
        rig.muzzleTimer = 0.08;
        rig.kickTimer = 1.0;
      }
    }

    if (ev.weaponId !== 5) {
      const start = new THREE.Vector3(ev.origin[0], ev.origin[1], ev.origin[2]);
      const end = new THREE.Vector3(ev.hitPoint[0], ev.hitPoint[1], ev.hitPoint[2]);
      this.createTracerMesh(THREE, start, end, ev.tracerColor);
    }
  }

  public triggerHitFlinch(targetId: string): void {
    const rig = this.remoteRigs.get(targetId);
    if (rig) {
      rig.flinchTimer = 0.36;
    }
  }

  public cycleSpectate(dir: -1 | 1): void {
    const candidates = this.getSpectateCandidates();
    if (candidates.length === 0) return;
    const curIdx = candidates.findIndex((p) => p.id === this.spectateTargetId);
    const nextIdx =
      curIdx === -1 ? 0 : (curIdx + dir + candidates.length) % candidates.length;
    this.spectateTargetId = candidates[nextIdx].id;
    this.spectateInitializedTarget = null;
    this.emitSpectateState(true);
  }

  public selectSpectateTarget(targetId: string): void {
    const candidates = this.getSpectateCandidates();
    if (!candidates.some((p) => p.id === targetId)) return;
    this.spectateTargetId = targetId;
    this.spectateInitializedTarget = null;
    this.emitSpectateState(true);
  }

  public toggleSpectateMode(): void {
    this.spectateMode = this.spectateMode === 'chase' ? 'pov' : 'chase';
    this.emitSpectateState(true);
  }

  public deployMatch(mapId: number, mode: GameModeId, force = false): void {
    const wantsSurvival = mode === 'survival';
    const effectiveMapId = isMapCompatibleWithMode(mapId, mode)
      ? mapId
      : wantsSurvival
      ? 12
      : mode === 'territory'
      ? 9
      : mapId === 12
      ? 9
      : 1;
    const targetKey = `${effectiveMapId}:${mode}`;
    const now = Date.now();

    if (!force && this.isDeploying && this.deployTargetKey === targetKey && now - this.deployStartedAt < 4000) {
      return;
    }

    if (this.deployTimer) {
      window.clearTimeout(this.deployTimer);
      this.deployTimer = null;
    }

    this.isDeploying = true;
    this.deployTargetKey = targetKey;
    this.deployStartedAt = now;
    this.deployActionClicked = false;
    this.callbacks.onDeployingChange?.(true);

    this.pendingSpawnSync = true;
    const mapInfo = getMapById(effectiveMapId);
    const quickPlayModeNeedle =
      mode === 'bomb'
        ? 'BOMB MODE'
        : mode === 'territory'
        ? 'TERRITORY CAPTURE'
        : mode === 'coop'
        ? 'CLASSIC'
        : 'DEATHMATCH';

    let stepCount = 0;

    const finishDeploy = (enteredArena: boolean) => {
      if (this.deployTimer) {
        window.clearTimeout(this.deployTimer);
        this.deployTimer = null;
      }
      this.deployActionClicked = false;
      this.deployTargetKey = '';
      if (this.isDeploying) {
        this.isDeploying = false;
        this.callbacks.onDeployingChange?.(false);
      }
      if (enteredArena) {
        this.focusArena();
      }
    };

    const tryAdvanceMenu = () => {
      if (!this.isDeploying) return;

      const doc = this.getIframeDoc();
      if (Date.now() - this.deployStartedAt > 7500) {
        finishDeploy(Boolean(doc && this.isInActiveMatchView(doc)));
        return;
      }

      if (!doc) {
        this.deployTimer = window.setTimeout(tryAdvanceMenu, 200);
        return;
      }

      if (this.deployActionClicked && this.isInActiveMatchView(doc)) {
        this.cachedInActiveMatch = true;
        finishDeploy(true);
        return;
      }

      const buttons = Array.from(doc.querySelectorAll('button'));
      // Wait for the game bundle inside the iframe to boot (guarded by wall-clock timeout above)
      if (buttons.length === 0) {
        this.deployTimer = window.setTimeout(tryAdvanceMenu, 200);
        return;
      }

      stepCount += 1;
      if (stepCount > 80) {
        finishDeploy(this.isInActiveMatchView(doc));
        return;
      }

      const findBtn = (needle: string) =>
        buttons.find((b) => !b.disabled && (b.textContent || '').toUpperCase().includes(needle));

      // Dismiss settings / controls / weapon shop if open
      const closeModalBtn = buttons.find((b) => {
        const label = (b.getAttribute('aria-label') || '').toUpperCase();
        return label.includes('CLOSE SETTINGS') || label.includes('CLOSE CONTROLS') || label.includes('CLOSE SHOP');
      });
      if (closeModalBtn) {
        closeModalBtn.click();
        this.deployTimer = window.setTimeout(tryAdvanceMenu, 180);
        return;
      }

      // Dismiss Campaign briefing modal back to Main Menu if open
      const bodyText = doc.body.textContent || '';
      if (bodyText.includes('DEPLOY MISSION')) {
        const backBtn = findBtn('BACK');
        if (backBtn) {
          backBtn.click();
          this.deployTimer = window.setTimeout(tryAdvanceMenu, 180);
          return;
        }
      }

      const hasMainMenuBtn = findBtn('MAIN MENU');
      const hasQuickPlay = findBtn('QUICK PLAY SKIRMISH');
      const hasSurvival = findBtn('SURVIVAL');
      const hasDeploy = buttons.find((b) => {
        if (b.disabled) return false;
        const txt = (b.textContent || '').toUpperCase().trim();
        return txt === 'DEPLOY' || (txt.includes('DEPLOY') && !txt.includes('DEPLOY MISSION'));
      });
      const hasRedeploy = findBtn('REDEPLOY');
      const hasMapBtn = findBtn(mapInfo.name);
      const inSurvivalPicker = bodyText.includes('Select arena');
      const inQuickPlaySetup = bodyText.includes('QUICK PLAY SETUP');

      const inTargetSetup = (wantsSurvival && inSurvivalPicker) || (!wantsSurvival && inQuickPlaySetup);
      if (hasMainMenuBtn && !inTargetSetup) {
        this.deployActionClicked = false;
        hasMainMenuBtn.click();
        this.deployTimer = window.setTimeout(tryAdvanceMenu, 180);
        return;
      }

      if (!this.deployActionClicked && !hasQuickPlay && !hasMainMenuBtn && !inSurvivalPicker && !inQuickPlaySetup && stepCount % 4 === 0) {
        const pauseBtn = doc.querySelector('button[aria-label="Open pause menu"]') as HTMLButtonElement | null;
        if (pauseBtn) {
          pauseBtn.click();
        } else {
          doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        }
      }

      if (hasQuickPlay && hasSurvival) {
        if (wantsSurvival) {
          this.deployActionClicked = true;
          hasSurvival.click();
          if (effectiveMapId !== 12) {
            window.setTimeout(() => {
              const cw = this.getArenaWindow();
              const eng = cw ? this.findEngine(cw) : null;
              if (eng?.setMap && eng?.deploy) {
                eng.setMap(effectiveMapId);
                eng.deploy();
              }
            }, 180);
          }
          this.deployTimer = window.setTimeout(tryAdvanceMenu, 140);
        } else {
          this.deployActionClicked = false;
          hasQuickPlay.click();
          this.deployTimer = window.setTimeout(tryAdvanceMenu, 120);
        }
        return;
      }

      if (wantsSurvival && inSurvivalPicker && hasMapBtn) {
        this.deployActionClicked = true;
        hasMapBtn.click();
        this.deployTimer = window.setTimeout(tryAdvanceMenu, 120);
        return;
      }

      if (!wantsSurvival && inQuickPlaySetup) {
        const targetModeBtn = findBtn(quickPlayModeNeedle);
        if (targetModeBtn && !targetModeBtn.className.includes('border-[#19e6ff]')) {
          targetModeBtn.click();
          this.deployTimer = window.setTimeout(tryAdvanceMenu, 120);
          return;
        }
        if (hasMapBtn && !hasMapBtn.className.includes('border-[#ffcf40]')) {
          hasMapBtn.click();
          this.deployTimer = window.setTimeout(tryAdvanceMenu, 120);
          return;
        }
        if (hasRedeploy) {
          this.deployActionClicked = true;
          hasRedeploy.click();
          this.deployTimer = window.setTimeout(tryAdvanceMenu, 140);
          return;
        }
        if (hasDeploy) {
          this.deployActionClicked = true;
          hasDeploy.click();
          this.deployTimer = window.setTimeout(tryAdvanceMenu, 140);
          return;
        }
      }

      this.deployTimer = window.setTimeout(tryAdvanceMenu, 180);
    };

    tryAdvanceMenu();
  }

  public focusArena(): void {
    const cw = this.getArenaWindow();
    const canvas = cw?.document.querySelector('canvas');
    if (canvas) {
      canvas.focus?.();
      try {
        canvas.requestPointerLock?.();
      } catch {
        // Ignore if user gesture required
      }
    }
  }

  private getArenaWindow(): ArenaWindow | null {
    try {
      const cw = this.iframe.contentWindow as ArenaWindow | null;
      if (!cw || !cw.document) return null;
      return cw;
    } catch {
      return null;
    }
  }

  private getIframeDoc(): Document | null {
    return this.getArenaWindow()?.document ?? null;
  }

  private getSpectateCandidates(): RemotePlayerState[] {
    const aliveOthers = this.remotePlayers.filter((p) => p.id !== this.localPlayerId && p.alive);
    if (aliveOthers.length <= 1) return aliveOthers;
    if (isTeamMode(this.roomMode)) {
      const allies = aliveOthers.filter((p) => p.team === this.localTeam);
      if (allies.length > 0) {
        const enemies = aliveOthers.filter((p) => p.team !== this.localTeam);
        return [...allies, ...enemies];
      }
    }
    return aliveOthers;
  }

  private resolveSpectateTarget(): RemotePlayerState | null {
    if (!this.matchPlaying || this.localAlive || !this.cachedInActiveMatch) {
      this.spectateTargetId = null;
      return null;
    }
    const candidates = this.getSpectateCandidates();
    if (candidates.length === 0) {
      this.spectateTargetId = null;
      return null;
    }
    const existing = candidates.find((p) => p.id === this.spectateTargetId);
    if (existing) return existing;
    this.spectateTargetId = candidates[0].id;
    this.spectateInitializedTarget = null;
    return candidates[0];
  }

  private emitSpectateState(force = false): void {
    const candidates = this.getSpectateCandidates();
    const isSpectating = this.matchPlaying && !this.localAlive && this.cachedInActiveMatch;
    const target = isSpectating
      ? candidates.find((p) => p.id === this.spectateTargetId) ?? candidates[0] ?? null
      : null;
    const curIdx = target ? candidates.findIndex((p) => p.id === target.id) : -1;
    const nextCandidate =
      candidates.length > 1 && curIdx !== -1
        ? candidates[(curIdx + 1) % candidates.length]
        : null;

    const payload: SpectateState = {
      active: Boolean(isSpectating),
      targetId: target?.id ?? null,
      targetName: target?.name ?? null,
      targetTeam: target?.team ?? null,
      targetHp: target?.hp ?? 0,
      targetMaxHp: target?.maxHp ?? 100,
      targetWeaponId: target?.weaponId ?? 0,
      targetIndex: curIdx >= 0 ? curIdx + 1 : 0,
      nextTargetName: nextCandidate?.name ?? null,
      mode: this.spectateMode,
      aliveCount: candidates.length,
    };

    const key = `${payload.active}:${payload.targetId}:${payload.targetHp}:${payload.targetWeaponId}:${payload.targetIndex}:${payload.nextTargetName}:${payload.mode}:${payload.aliveCount}`;
    if (force || key !== this.lastSpectateEmitKey) {
      this.lastSpectateEmitKey = key;
      this.callbacks.onSpectateStateChange?.(payload);
    }
  }

  private attachInputListeners(doc: Document): void {
    if (this.listenersAttachedToDoc === doc) return;
    this.detachInputListeners();
    this.injectVisualFixStyles(doc);

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0 && this.isInActiveMatchView(doc) && this.localAlive) {
        this.isTriggerHeld = true;
        this.tryFireLocalShot();
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        this.isTriggerHeld = false;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      const fireBtn = target?.closest('button[aria-label*="Fire"], button[aria-label*="fire"], [data-fire]');
      const label = (target?.textContent || '').toUpperCase();
      if (this.cachedInActiveMatch && this.localAlive && (fireBtn || label.includes('FIRE'))) {
        this.isTriggerHeld = true;
        this.tryFireLocalShot();
      }
      const dashBtn = target?.closest('button[aria-label*="Dash"], button[aria-label*="dash"], button[aria-label*="Slide"], button[aria-label*="Crouch"]');
      if (this.cachedInActiveMatch && this.localAlive && (dashBtn || label.includes('DASH') || label.includes('SLIDE'))) {
        this.localSlideUntil = performance.now() + 560;
      }
    };

    const onTouchEnd = () => {
      this.isTriggerHeld = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (doc.activeElement as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';

      if (!typing && e.code === 'KeyV' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!e.repeat) {
          this.callbacks.onTalkingChange?.(true);
        }
      }

      if (e.key >= '1' && e.key <= '6') {
        this.currentWeaponId = Number(e.key) - 1;
      }
      if (e.code === 'KeyC' || e.code === 'ControlLeft' || e.code === 'ControlRight') {
        if (this.localAlive) {
          this.localCrouchKeys.add(e.code);
        }
      }
      if (e.code === 'KeyF' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        if (e.code === 'KeyF') {
          this.localSlideUntil = performance.now() + 560;
        }
      }
      if (this.matchPlaying && !this.localAlive && this.cachedInActiveMatch) {
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
          this.cycleSpectate(-1);
        } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
          this.cycleSpectate(1);
        } else if (e.code === 'KeyC') {
          this.toggleSpectateMode();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.localCrouchKeys.delete(e.code);
      if (e.code === 'KeyV') {
        this.callbacks.onTalkingChange?.(false);
      }
    };

    const onWindowBlur = () => {
      this.callbacks.onTalkingChange?.(false);
    };

    const win = doc.defaultView;
    doc.addEventListener('mousedown', onMouseDown, true);
    doc.addEventListener('mouseup', onMouseUp, true);
    doc.addEventListener('touchstart', onTouchStart, true);
    doc.addEventListener('touchend', onTouchEnd, true);
    doc.addEventListener('touchcancel', onTouchEnd, true);
    doc.addEventListener('keydown', onKeyDown, true);
    doc.addEventListener('keyup', onKeyUp, true);
    win?.addEventListener('blur', onWindowBlur);

    (doc as any).__mpCleanup = () => {
      doc.removeEventListener('mousedown', onMouseDown, true);
      doc.removeEventListener('mouseup', onMouseUp, true);
      doc.removeEventListener('touchstart', onTouchStart, true);
      doc.removeEventListener('touchend', onTouchEnd, true);
      doc.removeEventListener('touchcancel', onTouchEnd, true);
      doc.removeEventListener('keydown', onKeyDown, true);
      doc.removeEventListener('keyup', onKeyUp, true);
      win?.removeEventListener('blur', onWindowBlur);
      this.callbacks.onTalkingChange?.(false);
    };
    this.listenersAttachedToDoc = doc;
  }

  private injectVisualFixStyles(doc: Document): void {
    if (doc.getElementById('mp-visual-glitch-fix')) return;
    const style = doc.createElement('style');
    style.id = 'mp-visual-glitch-fix';
    style.textContent = `
      .scanlines {
        background: none !important;
      }
      [aria-label="Tactical radar compass"] > span {
        top: 2px !important;
        left: 4px !important;
        transform: none !important;
        font-size: 7px !important;
        line-height: 1 !important;
        letter-spacing: 0.06em !important;
        opacity: 0.65 !important;
        pointer-events: none !important;
      }
      [aria-label="Tactical radar compass"] > div:not(:first-child) {
        top: 66% !important;
      }
    `;
    (doc.head || doc.documentElement)?.appendChild(style);
  }

  private patchActiveArenaGeometry(scene: any): void {
    const mapGroup = scene.children?.[3];
    const activeMapGroup = mapGroup?.children?.[0];
    if (!activeMapGroup || activeMapGroup === this.lastPatchedMapGroup) return;
    this.lastPatchedMapGroup = activeMapGroup;

    let slabIndex = 0;
    const children = activeMapGroup.children;
    if (Array.isArray(children)) {
      for (let i = 0; i < children.length; i++) {
        const obj = children[i];
        const params = obj?.geometry?.parameters;
        if (
          obj?.isMesh &&
          params &&
          typeof params.height === 'number' &&
          params.height <= 0.12 &&
          Math.abs((obj.position?.y ?? 0) - 0.025) < 0.01
        ) {
          obj.position.y = 0.025 + slabIndex * 0.0018;
          obj.castShadow = false;
          slabIndex++;
        }
      }
    }

    if (Array.isArray(scene.children)) {
      for (let i = 0; i < scene.children.length; i++) {
        const node = scene.children[i];
        if (node?.isDirectionalLight && node.shadow) {
          node.shadow.bias = -0.0035;
          node.shadow.normalBias = 0.08;
        }
      }
    }
  }

  private detachInputListeners(): void {
    if (this.listenersAttachedToDoc && (this.listenersAttachedToDoc as any).__mpCleanup) {
      (this.listenersAttachedToDoc as any).__mpCleanup();
      delete (this.listenersAttachedToDoc as any).__mpCleanup;
    }
    this.listenersAttachedToDoc = null;
    this.isTriggerHeld = false;
    this.localCrouchKeys.clear();
  }

  private isInActiveMatchView(doc: Document): boolean {
    if (!doc.querySelector('canvas')) return false;
    return !doc.querySelector('div.fixed.inset-0.z-30, div.fixed.inset-0.z-40');
  }

  private findEngine(cw: ArenaWindow): any {
    if (this.cachedEngine && this.cachedEngine.scene === cw.__arenaScene) {
      return this.cachedEngine;
    }
    const canvas = cw.document.querySelector('canvas');
    let el: HTMLElement | null = canvas?.parentElement ?? null;
    for (let depth = 0; depth < 3 && el; depth++, el = el.parentElement) {
      const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
      if (!fiberKey) continue;
      let fiber = (el as any)[fiberKey];
      for (let hop = 0; hop < 14 && fiber; hop++, fiber = fiber.return) {
        let hook = fiber.memoizedState;
        for (let hi = 0; hi < 24 && hook; hi++, hook = hook.next) {
          const val = hook.memoizedState;
          const eng = val && typeof val === 'object' ? val.current : null;
          if (eng && eng.actorGroup && Array.isArray(eng.bots) && eng.player) {
            this.cachedEngine = eng;
            return eng;
          }
        }
      }
    }
    return null;
  }

  private enforceBotCount(engine: any): void {
    if (this.desiredBotCount === null || !engine || !Array.isArray(engine.bots) || !engine.actorGroup) {
      return;
    }
    const target = this.desiredBotCount;
    let pool = this.suspendedBotsByEngine.get(engine);
    if (!pool) {
      pool = [];
      this.suspendedBotsByEngine.set(engine, pool);
    }

    if (engine.sv && typeof engine.sv.unseen === 'number') {
      const maxUnseen = Math.max(0, target - engine.bots.length);
      if (engine.sv.unseen > maxUnseen) {
        engine.sv.unseen = maxUnseen;
      }
    }

    if (engine.bots.length > target) {
      // Trim excess bots cleanly (prefer trimming alternating teams when possible)
      let preferTeam: 'red' | 'blue' = 'red';
      while (engine.bots.length > target) {
        let idx = -1;
        for (let i = engine.bots.length - 1; i >= 0; i--) {
          if (engine.bots[i]?.team === preferTeam) {
            idx = i;
            break;
          }
        }
        if (idx === -1) idx = engine.bots.length - 1;
        const [removed] = engine.bots.splice(idx, 1);
        if (removed) {
          if (removed.g) engine.actorGroup.remove(removed.g);
          pool.push(removed);
        }
        preferTeam = preferTeam === 'red' ? 'blue' : 'red';
      }
    } else if (engine.bots.length < target && pool.length > 0) {
      while (engine.bots.length < target && pool.length > 0) {
        const restored = pool.pop();
        if (restored) {
          engine.bots.push(restored);
          if (restored.g) engine.actorGroup.add(restored.g);
        }
      }
    }
  }

  private syncSpawnPosition(engine: any): void {
    if (!this.pendingSpawnSync || !this.matchPlaying || !engine?.player || !engine?.currentMap) return;
    if (engine.phase !== 'playing' || engine.svDrop) return;

    this.pendingSpawnSync = false;
    const map = engine.currentMap;
    const blueSpawns: Array<{ x: number; z: number }> = Array.isArray(map.blueSpawns) ? map.blueSpawns : [];
    const redSpawns: Array<{ x: number; z: number }> = Array.isArray(map.redSpawns) ? map.redSpawns : [];
    if (blueSpawns.length === 0 && redSpawns.length === 0) return;

    const myIdx = Math.max(0, this.remotePlayers.findIndex((p) => p.id === this.localPlayerId));
    let spawn: { x: number; z: number } | undefined;
    let yaw = 0;

    if (isTeamMode(this.roomMode)) {
      if (this.localTeam === 'red' && redSpawns.length > 0) {
        const teamIdx = this.remotePlayers
          .filter((p) => p.team === 'red')
          .findIndex((p) => p.id === this.localPlayerId);
        spawn = redSpawns[(Math.max(0, teamIdx)) % redSpawns.length];
        yaw = Math.PI;
      } else if (blueSpawns.length > 0) {
        const teamIdx = this.remotePlayers
          .filter((p) => p.team === 'blue')
          .findIndex((p) => p.id === this.localPlayerId);
        spawn = blueSpawns[(Math.max(0, teamIdx)) % blueSpawns.length];
        yaw = 0;
      }
    } else if (!isCoopMode(this.roomMode) && this.roomMode !== 'survival') {
      const combined = [...blueSpawns, ...redSpawns];
      if (combined.length > 0) {
        spawn = combined[myIdx % combined.length];
        yaw = Math.atan2(spawn.x, spawn.z);
      }
    }

    if (spawn) {
      engine.player.x = spawn.x;
      engine.player.y = 0;
      engine.player.z = spawn.z;
      engine.player.vx = 0;
      engine.player.vy = 0;
      engine.player.vz = 0;
      engine.player.yaw = yaw;
      engine.player.pitch = 0;
      engine.player.alive = true;
      engine.camera?.position?.set?.(spawn.x, 1.62, spawn.z);
    }
  }

  private inferWeaponFromHud(doc: Document, engine?: any): void {
    if (engine?.player && typeof engine.player.weaponId === 'number') {
      this.currentWeaponId = Math.max(0, Math.min(5, engine.player.weaponId));
      return;
    }
    const swapBtn = doc.querySelector('button[aria-label^="Switch weapon, current "]');
    if (swapBtn) {
      const label = (swapBtn.getAttribute('aria-label') || '').replace('Switch weapon, current ', '').trim();
      const idx = WEAPON_LABELS.indexOf(label);
      if (idx !== -1) {
        this.currentWeaponId = idx;
        return;
      }
    }
    if (this.cachedWeaponEl && this.cachedWeaponEl.isConnected) {
      const txt = (this.cachedWeaponEl.textContent || '').trim();
      const idx = WEAPON_LABELS.indexOf(txt);
      if (idx !== -1) {
        this.currentWeaponId = idx;
        return;
      }
    }
    const hudNodes = doc.querySelectorAll('div, span');
    for (let i = 0; i < hudNodes.length; i++) {
      const node = hudNodes[i];
      if (node.childElementCount > 0) continue;
      const txt = (node.textContent || '').trim();
      const idx = WEAPON_LABELS.indexOf(txt);
      if (idx !== -1) {
        this.cachedWeaponEl = node;
        this.currentWeaponId = idx;
        return;
      }
    }
  }

  private syncHudOverlapFix(cw: ArenaWindow): void {
    const doc = cw.document;
    const aliveEl = doc.querySelector('[data-k="alive"]') as HTMLElement | null;
    const mapCanvas = doc.querySelector('canvas[data-k="map"]') as HTMLCanvasElement | null;
    const svRoot = mapCanvas?.parentElement ?? null;
    const svVisible = Boolean(svRoot && svRoot.style.display !== 'none' && mapCanvas);

    if (svVisible && aliveEl) {
      const topCenterStack = aliveEl.parentElement?.parentElement as HTMLElement | null;
      if (topCenterStack) {
        const compassEl = doc.querySelector('[aria-label="Tactical radar compass"]') as HTMLElement | null;
        const compassRect = compassEl?.getBoundingClientRect();
        if (compassRect && compassRect.height > 0) {
          topCenterStack.style.top = `${Math.ceil(compassRect.bottom + 4)}px`;
        } else {
          topCenterStack.style.top = 'calc(env(safe-area-inset-top, 0px) + 8px)';
        }
        topCenterStack.style.gap = '3px';
      }
      for (const k of ['alive', 'kills', 'zone', 'gas']) {
        const pill = svRoot?.querySelector(`[data-k="${k}"]`) as HTMLElement | null;
        if (pill) {
          pill.style.padding = '2px 8px';
          pill.style.fontSize = k === 'zone' || k === 'gas' ? '10px' : '11px';
        }
      }
    }

    const mapSize = cw.innerHeight < 500 ? 94 : 108;
    const pauseBtn = doc.querySelector('button[aria-label="Open pause menu"]') as HTMLElement | null;
    const pauseRect = pauseBtn?.getBoundingClientRect();

    if (svVisible && mapCanvas) {
      const mapTop = pauseRect && pauseRect.height > 0 ? Math.ceil(pauseRect.bottom + 6) : 58;
      mapCanvas.style.top = `${mapTop}px`;
      mapCanvas.style.right = '10px';
      mapCanvas.style.width = `${mapSize}px`;
      mapCanvas.style.height = `${mapSize}px`;
    }

    const killFeedEl = pauseBtn?.parentElement?.nextElementSibling as HTMLElement | null;
    if (killFeedEl) {
      if (svVisible) {
        killFeedEl.style.marginTop = `${mapSize + 10}px`;
      } else if (killFeedEl.style.marginTop) {
        killFeedEl.style.marginTop = '';
      }
    }

    const topHudRow = pauseBtn?.parentElement?.parentElement?.parentElement as HTMLElement | null;
    const topLeftBox = topHudRow?.firstElementChild as HTMLElement | null;
    const topLeftRect = this.cachedInActiveMatch && topLeftBox ? topLeftBox.getBoundingClientRect() : null;
    const nextDockTop =
      topLeftRect && topLeftRect.height > 0
        ? Math.max(66, Math.min(210, Math.ceil(topLeftRect.bottom + 6)))
        : 74;

    if (
      this.cachedHudInActiveMatch !== this.cachedInActiveMatch ||
      Math.abs(nextDockTop - this.cachedDockTopPx) >= 2
    ) {
      this.cachedHudInActiveMatch = this.cachedInActiveMatch;
      this.cachedDockTopPx = nextDockTop;
      this.callbacks.onHudStateChange?.({
        inActiveMatch: this.cachedInActiveMatch,
        dockTopPx: nextDockTop,
      });
    }
  }

  private ensureThreeAssets(THREE: ThreeLike) {
    if (this.rayHelper && this.rayHelper.three === THREE) {
      return this.rayHelper;
    }

    // Contact ground shadow disc texture matching original game
    const shCanvas = document.createElement('canvas');
    shCanvas.width = 64;
    shCanvas.height = 64;
    const shCtx = shCanvas.getContext('2d');
    if (shCtx) {
      const grad = shCtx.createRadialGradient(32, 32, 4, 32, 32, 30);
      grad.addColorStop(0, 'rgba(0,0,0,0.62)');
      grad.addColorStop(0.65, 'rgba(0,0,0,0.28)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      shCtx.fillStyle = grad;
      shCtx.fillRect(0, 0, 64, 64);
    }
    const shadowTex = new THREE.CanvasTexture(shCanvas);

    this.rayHelper = {
      three: THREE,
      raycaster: new THREE.Raycaster(),
      ndcCenter: new THREE.Vector2(0, 0),
      dirVec: new THREE.Vector3(),
      upVec: new THREE.Vector3(0, 1, 0),
      quat: new THREE.Quaternion(),
      tracerGeo: new THREE.CylinderGeometry(0.028, 0.028, 1, 4),
      tracerMats: new Map(),
      ik: {
        d: new THREE.Vector3(),
        dh: new THREE.Vector3(),
        p: new THREE.Vector3(),
        u: new THREE.Vector3(),
        f: new THREE.Vector3(),
        k: new THREE.Vector3(),
        ex: new THREE.Vector3(),
        ey: new THREE.Vector3(),
        v: new THREE.Vector3(),
        w: new THREE.Vector3(),
        tr: new THREE.Vector3(),
        tl: new THREE.Vector3(),
        mat4: new THREE.Matrix4(),
        euler: new THREE.Euler(0, 0, 0, 'YXZ'),
        specOrigin: new THREE.Vector3(),
        specDesired: new THREE.Vector3(),
        specDir: new THREE.Vector3(),
      },
      rigAssets: {
        skin: new THREE.MeshStandardMaterial({ color: 0xd99e7a, roughness: 0.85, metalness: 0.05 }),
        pants: new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.85, metalness: 0.1 }),
        boot: new THREE.MeshStandardMaterial({ color: 0x12141b, roughness: 0.65, metalness: 0.25 }),
        belt: new THREE.MeshStandardMaterial({ color: 0xd99e9b, roughness: 0.4, metalness: 0.65 }),
        gunDark: new THREE.MeshStandardMaterial({ color: 0x1a1e26, roughness: 0.38, metalness: 0.82 }),
        gunMetal: new THREE.MeshStandardMaterial({ color: 0x3b465c, roughness: 0.35, metalness: 0.85 }),
        knifeBlade: new THREE.MeshStandardMaterial({
          color: 0x39e58c,
          emissive: 0x19e6ff,
          emissiveIntensity: 1.2,
          roughness: 0.2,
          metalness: 0.85,
        }),
        blueShirt: new THREE.MeshStandardMaterial({ color: 0x164e7a, roughness: 0.72, metalness: 0.2 }),
        blueVest: new THREE.MeshStandardMaterial({ color: 0x123254, roughness: 0.55, metalness: 0.45 }),
        blueHelm: new THREE.MeshStandardMaterial({ color: 0x1d688c, roughness: 0.4, metalness: 0.6 }),
        blueVisor: new THREE.MeshStandardMaterial({
          color: 0x19e6ff,
          emissive: 0x19e6ff,
          emissiveIntensity: 2.2,
          roughness: 0.2,
        }),
        redShirt: new THREE.MeshStandardMaterial({ color: 0x2b3a4c, roughness: 0.78, metalness: 0.14 }),
        redVest: new THREE.MeshStandardMaterial({ color: 0x1b2030, roughness: 0.6, metalness: 0.35 }),
        redHelm: new THREE.MeshStandardMaterial({ color: 0x3a4256, roughness: 0.45, metalness: 0.55 }),
        redVisor: new THREE.MeshStandardMaterial({
          color: 0xff3b5c,
          emissive: 0xff3b5c,
          emissiveIntensity: 2.1,
          roughness: 0.2,
        }),
        cyanAlly: new THREE.MeshBasicMaterial({ color: 0x19e6ff }),
        shotgunAccent: new THREE.MeshStandardMaterial({
          color: 0xff8c2b,
          emissive: 0xff5a1f,
          emissiveIntensity: 1.1,
          roughness: 0.3,
        }),
        muzzle: new THREE.MeshBasicMaterial({ color: 0xffcf40 }),
        hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
        shadowMat: new THREE.MeshBasicMaterial({
          map: shadowTex,
          transparent: true,
          depthWrite: false,
          opacity: 0.5,
        }),
        shadowGeo: new THREE.PlaneGeometry(1.15, 1.15),
        allyBadgeGeo: new THREE.OctahedronGeometry(0.16, 0),
        headHitGeo: new THREE.BoxGeometry(0.5, 0.46, 0.5),
        bodyHitGeo: new THREE.BoxGeometry(0.76, 1.32, 0.56),
      },
    };
    return this.rayHelper;
  }

  private ensureSceneRoot(cw: ArenaWindow): boolean {
    const scene = cw.__arenaScene;
    const THREE = cw.THREE;
    if (!scene || !THREE) return false;

    if (this.currentScene !== scene || !this.mpRoot || this.mpRoot.parent !== scene) {
      this.cleanupSceneObjects();
      this.currentScene = scene;
      this.mpRoot = new THREE.Group();
      this.mpRoot.userData = { isMultiplayerRoot: true };
      scene.add(this.mpRoot);
    }
    return true;
  }

  private cleanupSceneObjects(): void {
    if (this.mpRoot && this.mpRoot.parent) {
      this.mpRoot.parent.remove(this.mpRoot);
    }
    this.mpRoot = null;
    this.remoteRigs.clear();
    this.activeTracers = [];
    this.cachedWeaponEl = null;
  }

  private hideLocalViewmodelForSpectate(cam: any): void {
    if (!Array.isArray(cam?.children)) return;
    for (let i = 0; i < cam.children.length; i++) {
      const child = cam.children[i];
      if (child && child.visible !== false) {
        child.visible = false;
        this.hiddenCamChildren.add(child);
      }
    }
  }

  private restoreLocalViewmodel(cam: any): void {
    if (!Array.isArray(cam?.children)) return;
    for (let i = 0; i < cam.children.length; i++) {
      const child = cam.children[i];
      if (child && this.hiddenCamChildren.has(child)) {
        child.visible = true;
        this.hiddenCamChildren.delete(child);
      }
    }
  }

  private hookSpectateCamera(cw: ArenaWindow): void {
    const cam = cw.__arenaCamera;
    if (!cam || (cam as any).__mpSpectateHooked) return;
    const origUpdateMatrixWorld = cam.updateMatrixWorld.bind(cam);
    const bridge = this;

    cam.updateMatrixWorld = function (force?: boolean) {
      const target = bridge.resolveSpectateTarget();
      if (target && bridge.matchPlaying && !bridge.localAlive && bridge.cachedInActiveMatch) {
        bridge.hideLocalViewmodelForSpectate(cam);

        const targetRig = bridge.remoteRigs.get(target.id);
        const tx = targetRig ? targetRig.root.position.x : bridge.spectateSmoothX;
        const ty = targetRig ? targetRig.root.position.y : bridge.spectateSmoothY;
        const tz = targetRig ? targetRig.root.position.z : bridge.spectateSmoothZ;
        const tYaw = targetRig ? targetRig.targetYaw : bridge.spectateSmoothYaw;
        const tPitch = targetRig ? targetRig.targetPitch : bridge.spectateSmoothPitch;
        const tCrouch = targetRig ? targetRig.crouchBlend : 0;

        if (bridge.spectateMode === 'pov') {
          if (targetRig) targetRig.root.visible = false;
          cam.position.set(tx, ty + 1.62 - tCrouch * 0.38, tz);
          cam.rotation.order = 'YXZ';
          cam.rotation.set(tPitch, tYaw, 0);
        } else {
          if (targetRig) targetRig.root.visible = true;
          const scene = cw.__arenaScene;
          const THREE = cw.THREE;
          let camDist = 4.2;
          const dirX = Math.sin(tYaw);
          const dirZ = Math.cos(tYaw);
          const eyeY = ty + 1.48 - tCrouch * 0.25;
          const desiredY = Math.max(1.2, eyeY + 1.45 - Math.sin(tPitch) * 1.1);

          if (scene && THREE) {
            const helper = bridge.ensureThreeAssets(THREE);
            const mapGroup = scene.children?.[3];
            if (mapGroup && !mapGroup.userData?.isMultiplayerRoot) {
              const { specOrigin, specDesired, specDir } = helper.ik;
              specOrigin.set(tx, eyeY, tz);
              specDesired.set(tx + dirX * camDist, desiredY, tz + dirZ * camDist);
              specDir.copy(specDesired).sub(specOrigin);
              const len = specDir.length();
              if (len > 0.05) {
                specDir.divideScalar(len);
                helper.raycaster.set(specOrigin, specDir);
                helper.raycaster.far = len;
                const wallHits = helper.raycaster.intersectObject(mapGroup, true);
                helper.raycaster.far = Infinity;
                if (wallHits.length > 0 && wallHits[0].distance < len) {
                  const ratio = Math.max(0.2, (wallHits[0].distance - 0.35) / len);
                  camDist *= ratio;
                }
              }
            }
          }

          cam.position.set(
            tx + dirX * camDist,
            lerpNum(eyeY, desiredY, camDist / 4.2),
            tz + dirZ * camDist
          );
          cam.lookAt(tx, eyeY, tz);
        }
      }
      return origUpdateMatrixWorld(force);
    };

    (cam as any).__mpSpectateHooked = true;
  }

  private step(): void {
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0.001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;

    const cw = this.getArenaWindow();
    if (!cw) return;

    this.attachInputListeners(cw.document);
    this.hookSpectateCamera(cw);
    const engine = this.findEngine(cw);

    if (engine) {
      this.patchSurvivalFists(engine, cw);
      this.enforceBotCount(engine);
      this.syncSpawnPosition(engine);

      // Keep local iframe engine synchronized with multiplayer server alive/death state
      if (this.matchPlaying && !this.localAlive) {
        engine.mouseDown = false;
        engine.touchFiring = false;
      } else if (this.matchPlaying && this.localAlive && this.desiredBotCount === 0 && engine.player && !engine.player.alive) {
        engine.player.alive = true;
        engine.player.hp = engine.player.maxHp ?? 100;
        engine.player.shield = engine.player.maxShield ?? 50;
        engine.spectating = false;
        engine.deathAnim = 0;
      }

      // Catch any melee/punch swing (including auto-fire or touch triggers) and replicate it
      const p = engine.player;
      if (p) {
        const curSlash = typeof p.slashAnim === 'number' ? p.slashAnim : 0;
        const curDir = typeof p.slashDir === 'number' ? p.slashDir : 1;
        const startedNewSwing =
          curSlash > 0 &&
          (curDir !== this.lastLocalSlashDir || curSlash < this.lastLocalSlashAnim - 0.1 || this.lastLocalSlashAnim === 0);
        this.lastLocalSlashAnim = curSlash;
        this.lastLocalSlashDir = curDir;
        if (startedNewSwing && this.matchPlaying && this.localAlive && this.cachedInActiveMatch) {
          this.tryFireLocalShot();
        }
      }
    }

    if (now - this.lastDomPollTime > 250) {
      this.lastDomPollTime = now;
      const overlay = cw.document.querySelector('div.fixed.inset-0.z-30, div.fixed.inset-0.z-40');
      this.cachedInActiveMatch = Boolean(cw.document.querySelector('canvas')) && !overlay;
      if (this.isDeploying && this.deployActionClicked && this.cachedInActiveMatch) {
        this.cancelDeploy();
        this.focusArena();
      }
      if (this.cachedInActiveMatch && this.localAlive) {
        this.inferWeaponFromHud(cw.document, engine);
      }
      this.syncHudOverlapFix(cw);

      const overlayText = overlay?.textContent || '';
      const soloMenuVisible = Boolean(
        overlay &&
          (overlayText.includes('QUICK PLAY SKIRMISH') || overlayText.includes('PAUSED'))
      );
      if (this.cachedSoloMenuVisible !== soloMenuVisible) {
        this.cachedSoloMenuVisible = soloMenuVisible;
        this.callbacks.onSoloMenuVisibleChange?.(soloMenuVisible);
      }

      if (this.matchPlaying && this.localAlive && !this.cachedInActiveMatch && now - this.lastAutoRedeployCheck > 300) {
        this.lastAutoRedeployCheck = now;
        if (overlayText.includes('MATCH OVER') || overlayText.includes('VICTORY')) {
          const btns = Array.from(cw.document.querySelectorAll('button'));
          const redeploy = btns.find((b) => (b.textContent || '').toUpperCase().includes('REDEPLOY'));
          if (redeploy) redeploy.click();
        }
      }
    }

    if (this.isTriggerHeld && this.matchPlaying && this.localAlive && this.cachedInActiveMatch) {
      this.tryFireLocalShot();
    }

    const cam = cw.__arenaCamera;
    if ((engine?.player || cam) && this.matchPlaying && this.localAlive) {
      if (cam) this.restoreLocalViewmodel(cam);
      const p = engine?.player;
      const px = typeof p?.x === 'number' ? p.x : cam.position.x;
      const py = typeof p?.y === 'number' ? p.y : cam.position.y - 1.62;
      const pz = typeof p?.z === 'number' ? p.z : cam.position.z;
      const pyaw = typeof p?.yaw === 'number' ? p.yaw : cam.rotation.y;
      const ppitch = typeof p?.pitch === 'number' ? p.pitch : cam.rotation.x;
      const pwid = typeof p?.weaponId === 'number' ? Math.max(0, Math.min(5, p.weaponId)) : this.currentWeaponId;
      this.currentWeaponId = pwid;
      const pads = typeof p?.ads === 'number' ? p.ads > 0.35 : (cam ? cam.fov < 62 : false);
      const isCrouchingOrSliding =
        Boolean(p && typeof p.dashTimer === 'number' && p.dashTimer > 0) ||
        this.localCrouchKeys.size > 0 ||
        now < this.localSlideUntil;

      this.callbacks.onPoseUpdate({
        x: px,
        y: py,
        z: pz,
        yaw: pyaw,
        pitch: ppitch,
        weaponId: pwid,
        ads: pads,
        crouching: isCrouchingOrSliding,
      });
    }

    if (!this.ensureSceneRoot(cw) || !cw.THREE) {
      this.emitSpectateState();
      return;
    }

    this.patchActiveArenaGeometry(cw.__arenaScene);
    const THREE = cw.THREE;
    const helper = this.ensureThreeAssets(THREE);
    const smoothAlpha = 1 - Math.exp(-16 * dt);

    const activeIds = this.activeIdsScratch;
    activeIds.clear();

    for (const p of this.remotePlayers) {
      if (p.id === this.localPlayerId) continue;
      activeIds.add(p.id);

      let rig = this.remoteRigs.get(p.id);
      if (!rig || rig.lastTeam !== p.team) {
        if (rig) {
          this.mpRoot.remove(rig.root);
          rig.labelSprite.material?.map?.dispose?.();
          rig.labelSprite.material?.dispose?.();
          this.remoteRigs.delete(p.id);
        }
        rig = this.buildRemoteRig(THREE, p);
        this.mpRoot.add(rig.root);
        this.remoteRigs.set(p.id, rig);
      }

      const live = this.livePoses.get(p.id);
      let leadVy = 0;
      if (live) {
        const leadSec = Math.min(0.048, Math.max(0, (now - live.updatedAt) / 1000));
        rig.targetX = live.x + live.vx * leadSec;
        rig.targetY = live.y + live.vy * leadSec;
        rig.targetZ = live.z + live.vz * leadSec;
        rig.targetYaw = live.yaw;
        rig.targetPitch = live.pitch;
        rig.targetWeaponId = live.weaponId;
        rig.targetAds = live.ads;
        rig.targetCrouching = live.crouching;
        leadVy = live.vy;
      } else {
        rig.targetX = p.x;
        rig.targetY = p.y;
        rig.targetZ = p.z;
        rig.targetYaw = p.yaw;
        rig.targetPitch = p.pitch;
        rig.targetWeaponId = p.weaponId;
        rig.targetAds = p.ads;
        rig.targetCrouching = p.crouching;
      }

      // Transition alive <-> dead
      if (!this.matchPlaying) {
        rig.root.visible = false;
        rig.deathTimer = 0;
        rig.wasAlive = p.alive;
        continue;
      }

      if (rig.wasAlive && !p.alive) {
        rig.deathTimer = 0.001;
        rig.wasAlive = false;
      } else if (!rig.wasAlive && p.alive) {
        rig.deathTimer = 0;
        rig.wasAlive = true;
        this.resetRigPoseAfterDeath(rig);
      }

      if (!p.alive) {
        if (rig.deathTimer > 0 && rig.deathTimer < 2.6) {
          rig.root.visible = true;
          this.animateDeathFall(rig, dt);
        } else {
          rig.root.visible = false;
        }
        continue;
      }

      rig.root.visible = true;
      const prevX = rig.root.position.x;
      const prevZ = rig.root.position.z;
      const distSq =
        (rig.targetX - prevX) ** 2 +
        (rig.targetY - rig.root.position.y) ** 2 +
        (rig.targetZ - prevZ) ** 2;

      if (distSq > 100) {
        rig.root.position.set(rig.targetX, rig.targetY, rig.targetZ);
      } else {
        rig.root.position.x += (rig.targetX - prevX) * smoothAlpha;
        rig.root.position.y += (rig.targetY - rig.root.position.y) * smoothAlpha;
        rig.root.position.z += (rig.targetZ - prevZ) * smoothAlpha;
      }

      // Shortest angle yaw lerp (model faces +Z, camera faces -Z -> +PI)
      const desiredRotY = rig.targetYaw + Math.PI;
      let diff = desiredRotY - rig.root.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      rig.root.rotation.y += diff * smoothAlpha;

      // Prevent overlapping local camera view when alive or in POV spectate
      if (cam && this.localAlive) {
        const cdx = rig.root.position.x - cam.position.x;
        const cdy = rig.root.position.y + 1.25 - cam.position.y;
        const cdz = rig.root.position.z - cam.position.z;
        if (cdx * cdx + cdy * cdy + cdz * cdz < 0.52) {
          rig.root.visible = false;
        }
      }

      // Ally overhead diamond indicator (Team & Co-op modes only)
      const showAllyBadge =
        isCoopMode(this.roomMode) ||
        (isTeamMode(this.roomMode) && p.team === this.localTeam);
      rig.allyBadge.visible = showAllyBadge;
      if (showAllyBadge) {
        rig.allyBadge.rotation.y += dt * 2.5;
      }

      this.animateLivingRig(helper, rig, dt, prevX, prevZ, leadVy);

      const nextKey = `${p.name}:${p.hp}:${p.shield}:${p.team}`;
      if (rig.labelKey !== nextKey) {
        rig.labelKey = nextKey;
        this.drawNameplate(rig.labelCanvas, p);
        rig.labelSprite.material.map.needsUpdate = true;
      }
    }

    // Track spectated target smoothly
    const spectateTarget = this.resolveSpectateTarget();
    if (spectateTarget) {
      const targetRig = this.remoteRigs.get(spectateTarget.id);
      const sx = targetRig ? targetRig.root.position.x : spectateTarget.x;
      const sy = targetRig ? targetRig.root.position.y : spectateTarget.y;
      const sz = targetRig ? targetRig.root.position.z : spectateTarget.z;
      const syaw = targetRig ? targetRig.targetYaw : spectateTarget.yaw;
      const spitch = targetRig ? targetRig.targetPitch : spectateTarget.pitch;
      if (this.spectateInitializedTarget !== spectateTarget.id) {
        this.spectateInitializedTarget = spectateTarget.id;
        this.spectateSmoothX = sx;
        this.spectateSmoothY = sy;
        this.spectateSmoothZ = sz;
        this.spectateSmoothYaw = syaw;
        this.spectateSmoothPitch = spitch;
      } else {
        this.spectateSmoothX += (sx - this.spectateSmoothX) * smoothAlpha;
        this.spectateSmoothY += (sy - this.spectateSmoothY) * smoothAlpha;
        this.spectateSmoothZ += (sz - this.spectateSmoothZ) * smoothAlpha;
        this.spectateSmoothYaw = syaw;
        this.spectateSmoothPitch = spitch;
      }
    }
    this.emitSpectateState();

    for (const [id, rig] of this.remoteRigs.entries()) {
      if (!activeIds.has(id)) {
        this.mpRoot.remove(rig.root);
        rig.labelSprite.material?.map?.dispose?.();
        rig.labelSprite.material?.dispose?.();
        this.remoteRigs.delete(id);
        this.livePoses.delete(id);
      }
    }

    for (let i = this.activeTracers.length - 1; i >= 0; i--) {
      const tr = this.activeTracers[i];
      if (now >= tr.expiresAt) {
        this.mpRoot.remove(tr.mesh);
        this.activeTracers.splice(i, 1);
      }
    }
  }

  private resetRigPoseAfterDeath(rig: RemoteRig): void {
    rig.body.rotation.set(0, 0, 0);
    rig.body.position.set(0, 0, 0);
    rig.tor.rotation.set(0, 0, 0);
    rig.neck.rotation.set(0, 0, 0);
    rig.hipL.rotation.set(0, 0, 0);
    rig.hipR.rotation.set(0, 0, 0);
    rig.kneeL.rotation.set(0, 0, 0);
    rig.kneeR.rotation.set(0, 0, 0);
    rig.shadowMesh.visible = true;
    rig.labelSprite.visible = true;
    rig.muzzleFlash.visible = false;
  }

  private animateDeathFall(rig: RemoteRig, dt: number): void {
    rig.deathTimer += dt;
    const e = rig.deathTimer;
    const n = Math.min(e / 0.56, 1);
    const l = n * n;
    const bounce = e > 0.48 && e < 0.76 ? Math.sin(((e - 0.48) / 0.28) * Math.PI) * 0.12 : 0;

    rig.body.rotation.x = -l * 1.5;
    rig.body.rotation.y = rig.deathTwist * l * 0.42;
    rig.body.rotation.z = rig.deathFallDir * l * 0.24;
    rig.body.position.y = l * 0.12 + bounce - (e > 2.0 ? (e - 2.0) * 0.65 : 0);

    rig.tor.rotation.x = -0.24 * l;
    rig.neck.rotation.x = -0.58 * l;
    rig.neck.rotation.y = rig.deathTwist * l * 0.35;

    rig.sR.rotation.set(lerpNum(rig.sR.rotation.x, -1.3 - l * 1.55, Math.min(1, l * 3)), 0, l * 0.95);
    rig.eR.rotation.set(-0.35 * l, 0, 0);
    rig.sL.rotation.set(lerpNum(rig.sL.rotation.x, -1.2 - l * 1.55, Math.min(1, l * 3)), 0, -l * 0.95);
    rig.eL.rotation.set(-0.45 * l, 0, 0);

    rig.hipL.rotation.x = l * 0.52;
    rig.hipR.rotation.x = -l * 0.18;
    rig.kneeL.rotation.x = l * 0.78;
    rig.kneeR.rotation.x = l * 0.38;

    rig.muzzleFlash.visible = false;
    rig.allyBadge.visible = false;
    rig.labelSprite.visible = false;
    rig.shadowMesh.visible = false;
  }

  private animateLivingRig(
    helper: NonNullable<IframeGameBridge['rayHelper']>,
    rig: RemoteRig,
    dt: number,
    prevX: number,
    prevZ: number,
    leadVy: number
  ): void {
    // 1. Weapon switching & swap dip animation
    const wid = Math.max(0, Math.min(5, Math.round(rig.targetWeaponId)));
    const isSurvivalFists =
      (this.roomMode === 'survival' || Boolean(this.cachedEngine?.svFistsOn)) && wid === 5;
    for (let i = 0; i < rig.weaponGroups.length; i++) {
      const shouldShow = i === wid && !(isSurvivalFists && i === 5);
      if (rig.weaponGroups[i].visible !== shouldShow) {
        rig.weaponGroups[i].visible = shouldShow;
        if (shouldShow) {
          rig.swapTimer = 0.34;
        }
      }
    }
    rig.muzzleFlash.position.y = MUZZLE_Y_BY_WEAPON[wid] ?? -0.58;

    if (rig.swapTimer > 0) rig.swapTimer = Math.max(0, rig.swapTimer - dt);
    if (rig.kickTimer > 0) rig.kickTimer = Math.max(0, rig.kickTimer - dt * 6.5);
    if (rig.flinchTimer > 0) rig.flinchTimer = Math.max(0, rig.flinchTimer - dt * 3.2);
    if (rig.knifeSlashTimer > 0) rig.knifeSlashTimer = Math.max(0, rig.knifeSlashTimer - dt);
    if (rig.punchTimer > 0) rig.punchTimer = Math.max(0, rig.punchTimer - dt);
    if (rig.landTimer > 0) rig.landTimer = Math.max(0, rig.landTimer - dt * 4.5);

    // 2. Smooth speed, jump/airborne detection, ADS & crouch blends
    const instSpeed = Math.hypot(rig.root.position.x - prevX, rig.root.position.z - prevZ) / dt;
    rig.smoothSpeed += (Math.min(14, instSpeed) - rig.smoothSpeed) * Math.min(1, dt * 14);
    const moving = rig.smoothSpeed > 0.35;
    const yt = moving ? Math.min(1, rig.smoothSpeed / 4.2) : 0;

    if (moving) {
      rig.walkPhase += dt * Math.max(4.5, Math.min(18, rig.smoothSpeed * 2.5));
    }

    const isAirborne = Math.abs(leadVy) > 1.75 || rig.root.position.y > 18;
    if (rig.wasAirborne && !isAirborne) {
      rig.landTimer = 1;
    }
    rig.wasAirborne = isAirborne;
    rig.airBlend += ((isAirborne ? 1 : 0) - rig.airBlend) * Math.min(1, dt * 14);
    rig.aimBlend += ((rig.targetAds ? 1 : 0) - rig.aimBlend) * Math.min(1, dt * 11);
    rig.crouchBlend += ((rig.targetCrouching ? 1 : 0) - rig.crouchBlend) * Math.min(1, dt * 14);

    const xt = Math.sin(rig.walkPhase);
    const ct = Math.cos(rig.walkPhase);
    const aim = rig.aimBlend;
    const kick = rig.kickTimer;
    const flinch = rig.flinchTimer;
    const land = rig.landTimer > 0 ? Math.sin(rig.landTimer * Math.PI) : 0;
    const swapWave = rig.swapTimer > 0 ? Math.sin((1 - rig.swapTimer / 0.34) * Math.PI) : 0;
    const crouch = rig.crouchBlend;
    const air = rig.airBlend;
    const pitch = Math.max(-1.3, Math.min(1.3, rig.targetPitch));

    // 3. Body stride bob + crouch/landing compressions
    const strideBob = Math.abs(xt) * 0.055 * yt * (1 - air) * (1 - crouch * 0.65);
    rig.body.rotation.set(0, 0, crouch * 0.14);
    rig.body.position.set(0, strideBob - crouch * 0.32 - land * 0.16, 0);

    // 4. Articulated Torso & Head/Neck aim pitch + recoil + flinch
    rig.tor.rotation.x = 0.14 * yt - pitch * 0.16 + aim * 0.06 - kick * 0.14 - flinch * 1.2 + land * 0.22 + crouch * 0.34;
    rig.tor.rotation.y = xt * 0.1 * yt * (1 - aim) + aim * 0.12;
    rig.neck.rotation.x = -0.08 * yt - pitch * 0.58 + aim * 0.1 + flinch * 1.0 - kick * 0.08;
    rig.neck.rotation.y = -0.1 * aim;

    // 5. Legs (Walk/Run -> Land -> Jump -> Crouch/Slide)
    let hipLX = xt * 0.85 * yt;
    let hipRX = -xt * 0.85 * yt;
    let kneeLX = Math.max(0, -ct) * yt;
    let kneeRX = Math.max(0, ct) * yt;

    if (land > 0.05) {
      hipLX = lerpNum(hipLX, -0.45 * land, land);
      hipRX = lerpNum(hipRX, -0.35 * land, land);
      kneeLX = lerpNum(kneeLX, 0.95 * land, land);
      kneeRX = lerpNum(kneeRX, 0.85 * land, land);
    }

    if (air > 0.02) {
      hipLX = lerpNum(hipLX, -0.68, air);
      hipRX = lerpNum(hipRX, -0.32, air);
      kneeLX = lerpNum(kneeLX, 1.15, air);
      kneeRX = lerpNum(kneeRX, 0.85, air);
    }

    if (crouch > 0.02) {
      hipLX = lerpNum(hipLX, -1.05, crouch);
      hipRX = lerpNum(hipRX, -0.45, crouch);
      kneeLX = lerpNum(kneeLX, 1.25, crouch);
      kneeRX = lerpNum(kneeRX, 1.15, crouch);
    }

    rig.hipL.rotation.x = hipLX;
    rig.hipR.rotation.x = hipRX;
    rig.kneeL.rotation.x = kneeLX;
    rig.kneeR.rotation.x = kneeRX;

    // Keep hitboxes & nameplate synced to crouch height
    rig.headHitbox.position.y = 1.64 - crouch * 0.36;
    rig.bodyHitbox.position.y = 0.72 - crouch * 0.18;
    rig.labelSprite.position.y = 2.28 - crouch * 0.34;
    rig.shadowMesh.scale.setScalar(Math.max(0.5, 1 - Math.max(0, rig.root.position.y) * 0.05));

    // 6. 2-Bone Arm IK Weapon Grip / Unarmed Boxer Punching
    const { ik } = helper;
    const isKnife = wid === 5;
    const isPistol = wid === 3;

    if (isSurvivalFists) {
      const punchDur = 0.34;
      const punchRaw = rig.punchTimer > 0 ? Math.max(0, Math.min(1, 1 - rig.punchTimer / punchDur)) : 0;
      const punchExt =
        punchRaw > 0
          ? punchRaw < 0.34
            ? Math.sin((punchRaw / 0.34) * (Math.PI / 2))
            : Math.pow(Math.cos(((punchRaw - 0.34) / 0.66) * (Math.PI / 2)), 1.35)
          : 0;
      const punchRight = rig.punchHand === 0;
      const rPunch = punchRight ? punchExt : 0;
      const lPunch = punchRight ? 0 : punchExt;

      const guardSway = Math.sin(rig.walkPhase * 0.55 + performance.now() * 0.0032) * 0.018;
      const swing = xt * 0.055 * yt * (1 - aim * 0.6);
      const pitchLift = -pitch * 0.38;

      rig.tor.rotation.y += (rPunch - lPunch) * 0.42;
      rig.tor.rotation.x += punchExt * 0.16;
      rig.neck.rotation.y -= (rPunch - lPunch) * 0.24;

      rig.gun.position.set(0, 0, 0);
      rig.gun.rotation.set(0, 0, 0);

      // Right hand: rear boxer guard -> snappy right cross forward, tucks on left jab
      const rxGuard = lerpNum(0.22, 0.14, aim);
      const ryGuard = lerpNum(0.5, 0.58, aim) + strideBob * 0.65 + guardSway - swing;
      const rzGuard = lerpNum(0.32, 0.38, aim);
      ik.tr.set(
        lerpNum(rxGuard, 0.04, rPunch) + lPunch * 0.03,
        ryGuard + (0.08 + pitchLift) * rPunch + 0.02 * lPunch - swapWave * 0.08,
        lerpNum(rzGuard, 0.67, rPunch) - lPunch * 0.08
      );

      // Left hand: lead boxer guard -> snappy left jab forward, tucks on right cross
      const lxGuard = lerpNum(-0.2, -0.14, aim);
      const lyGuard = lerpNum(0.54, 0.58, aim) + strideBob * 0.65 - guardSway + swing;
      const lzGuard = lerpNum(0.41, 0.4, aim);
      ik.tl.set(
        lerpNum(lxGuard, -0.04, lPunch) - rPunch * 0.03,
        lyGuard + (0.08 + pitchLift) * lPunch + 0.02 * rPunch - swapWave * 0.08,
        lerpNum(lzGuard, 0.67, lPunch) - rPunch * 0.08
      );

      this.solveArmIk(helper, rig.sR, rig.eR, ik.tr, 0.36, 0.34, 1);
      this.solveArmIk(helper, rig.sL, rig.eL, ik.tl, 0.36, 0.34, -1);
    } else {
      const slashProgress = rig.knifeSlashTimer > 0 ? Math.sin((1 - rig.knifeSlashTimer / 0.28) * Math.PI) : 0;

      const px = lerpNum(0.06, 0.04, aim) + (isKnife ? 0.16 : 0) - slashProgress * 0.24;
      const py = lerpNum(0.4, 0.47, aim) + strideBob * 0.75 + slashProgress * 0.06 - swapWave * 0.1;
      const pz = lerpNum(0.23, 0.27, aim) + (isPistol ? 0.06 : 0) + slashProgress * 0.22 - kick * 0.06;
      let dl = lerpNum(0.72, 0.02, aim) - pitch * 0.65 - kick * 0.28 + swapWave * 0.45;
      const yw = lerpNum(-0.1, -0.02, aim) + slashProgress * 1.15;

      if (isKnife) {
        dl = 0.55 - pitch * 0.5 + slashProgress * 0.85;
      }

      ik.euler.set(-Math.PI / 2 + dl, yw, slashProgress * 0.65, 'YXZ');
      rig.gun.quaternion.setFromEuler(ik.euler);
      ik.v.set(0, -1, 0).applyQuaternion(rig.gun.quaternion);
      ik.tr.set(px, py, pz).addScaledVector(ik.v, -aim * 0.05);

      ik.w.set(0, -0.06, -0.09).applyQuaternion(rig.gun.quaternion);
      rig.gun.position.copy(ik.tr).sub(ik.w);
      rig.gun.updateMatrix();

      const fg = FOREGRIP_BY_WEAPON[wid] ?? FOREGRIP_BY_WEAPON[0];
      if (isKnife) {
        // Offhand balances combat stance during knife fight
        ik.tl.set(-0.26, 0.36 + strideBob * 0.5, 0.32);
      } else {
        ik.tl.set(fg[0], fg[1], fg[2]).applyMatrix4(rig.gun.matrix);
      }

      this.solveArmIk(helper, rig.sR, rig.eR, ik.tr, 0.36, 0.34, 1);
      this.solveArmIk(helper, rig.sL, rig.eL, ik.tl, 0.36, 0.34, -1);
    }

    // 7. Muzzle flash fade
    if (rig.muzzleTimer > 0 && !isKnife) {
      rig.muzzleTimer = Math.max(0, rig.muzzleTimer - dt);
      rig.muzzleFlash.visible = rig.muzzleTimer > 0;
      if (rig.muzzleFlash.visible) {
        rig.muzzleFlash.rotation.y = Math.random() * 6.28;
        const s = 0.85 + Math.random() * 0.5;
        rig.muzzleFlash.scale.set(s, s, s);
      }
    } else {
      rig.muzzleFlash.visible = false;
    }
  }

  private solveArmIk(
    helper: NonNullable<IframeGameBridge['rayHelper']>,
    sh: any,
    el: any,
    target: any,
    L1: number,
    L2: number,
    side: number
  ): void {
    const { d, dh, p, u, f, k, ex, ey, mat4 } = helper.ik;
    d.copy(target).sub(sh.position);
    let D = d.length();
    const mx = (L1 + L2) * 0.992;
    const mn = Math.abs(L1 - L2) + 0.03;
    if (D > mx) {
      d.multiplyScalar(mx / D);
      D = mx;
    } else if (D < mn) {
      d.multiplyScalar(mn / Math.max(D, 1e-4));
      D = mn;
    }

    dh.copy(d).divideScalar(D);
    const cA = Math.max(-1, Math.min(1, (D * D - L1 * L1 - L2 * L2) / (2 * L1 * L2)));
    const A = Math.acos(cA);
    const sA = Math.sin(A);
    const be = Math.atan2(L2 * sA, L1 + L2 * cA);

    p.set(side, -0.4, -0.2);
    p.addScaledVector(dh, -p.dot(dh));
    if (p.lengthSq() < 1e-6) p.set(0, -1, 0);
    p.normalize();

    u.copy(dh).multiplyScalar(Math.cos(be)).addScaledVector(p, Math.sin(be));
    f.copy(d).addScaledVector(u, -L1).divideScalar(L2);
    k.copy(f).addScaledVector(u, -f.dot(u));
    if (k.lengthSq() < 1e-8) {
      k.copy(p).negate();
      k.addScaledVector(u, -k.dot(u));
    }
    k.normalize();

    ey.copy(u).negate();
    ex.copy(ey).cross(k);
    mat4.makeBasis(ex, ey, k);
    sh.rotation.setFromRotationMatrix(mat4);
    el.rotation.set(-A, 0, 0);
  }

  private tryFireLocalShot(): void {
    if (!this.matchPlaying || !this.localAlive) return;
    const cw = this.getArenaWindow();
    if (!cw || !cw.__arenaCamera || !cw.__arenaScene || !cw.THREE) return;

    const weapon = getWeaponById(this.currentWeaponId);
    const effectiveCooldownMs =
      this.roomMode === 'survival' && weapon.id === 5 ? 340 : weapon.cooldownMs;
    const now = performance.now();
    if (now - this.lastShotTime < effectiveCooldownMs) return;
    this.lastShotTime = now;

    const THREE = cw.THREE;
    const cam = cw.__arenaCamera;
    const scene = cw.__arenaScene;
    const helper = this.ensureThreeAssets(THREE);
    const { raycaster, ndcCenter, dirVec } = helper;

    const hitTargets = this.hitTargetsScratch;
    hitTargets.length = 0;
    for (const rig of this.remoteRigs.values()) {
      if (!rig.root.visible || !rig.wasAlive) continue;
      hitTargets.push(rig.headHitbox, rig.bodyHitbox);
    }

    let hitPlayerId: string | null = null;
    let isHeadshot = false;
    let hitDist = weapon.id === 5 ? 3.2 : 140;

    if (hitTargets.length > 0) {
      raycaster.far = weapon.id === 5 ? 3.2 : 260;
      raycaster.setFromCamera(ndcCenter, cam);
      const hits = raycaster.intersectObjects(hitTargets, false);

      if (hits.length > 0) {
        const candidateDist = hits[0].distance;
        let occluded = false;
        const mapGroup = scene.children?.[3];
        if (mapGroup && !mapGroup.userData?.isMultiplayerRoot) {
          raycaster.far = candidateDist;
          const wallHits = raycaster.intersectObject(mapGroup, true);
          if (wallHits.length > 0 && wallHits[0].distance < candidateDist - 0.05) {
            occluded = true;
            hitDist = wallHits[0].distance;
          }
        }
        raycaster.far = Infinity;

        if (!occluded) {
          const hitObj = hits[0].object;
          hitPlayerId = hitObj.userData?.playerId ?? null;
          isHeadshot = hitObj.userData?.part === 'head';
          hitDist = candidateDist;
        }
      }
      raycaster.far = Infinity;
    }

    const originVec = cam.position;
    cam.getWorldDirection(dirVec);
    const clampedDist = Math.min(hitDist, 240);

    this.callbacks.onShoot(
      weapon.id,
      [originVec.x, originVec.y - 0.12, originVec.z],
      [
        originVec.x + dirVec.x * clampedDist,
        originVec.y + dirVec.y * clampedDist,
        originVec.z + dirVec.z * clampedDist,
      ]
    );

    if (hitPlayerId) {
      this.callbacks.onHit(hitPlayerId, isHeadshot, weapon.id);
    }
  }

  private buildRemoteRig(THREE: ThreeLike, p: RemotePlayerState): RemoteRig {
    const { rigAssets } = this.ensureThreeAssets(THREE);
    const isBlue = p.team === 'blue';
    const shirtMat = isBlue ? rigAssets.blueShirt : rigAssets.redShirt;
    const vestMat = isBlue ? rigAssets.blueVest : rigAssets.redVest;
    const helmMat = isBlue ? rigAssets.blueHelm : rigAssets.redHelm;
    const visorMat = isBlue ? rigAssets.blueVisor : rigAssets.redVisor;

    const root = new THREE.Group();
    root.position.set(p.x, p.y, p.z);
    root.rotation.y = p.yaw + Math.PI;
    root.userData = { isMultiplayerRemote: true, playerId: p.id };

    const shadowMesh = new THREE.Mesh(rigAssets.shadowGeo, rigAssets.shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.025;
    root.add(shadowMesh);

    const allyBadge = new THREE.Mesh(rigAssets.allyBadgeGeo, rigAssets.cyanAlly);
    allyBadge.position.set(0, 2.38, 0);
    allyBadge.visible = false;
    root.add(allyBadge);

    const body = new THREE.Group();
    body.scale.setScalar(0.94);
    root.add(body);

    const makePivot = (x: number, y: number, z: number, parent: any) => {
      const grp = new THREE.Group();
      grp.position.set(x, y, z);
      grp.rotation.order = 'YXZ';
      parent.add(grp);
      return grp;
    };

    const addPart = (
      w: number,
      h: number,
      d: number,
      mat: any,
      x: number,
      y: number,
      z: number,
      parent: any
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // Torso & Tactical Vest
    const tor = makePivot(0, 0.88, 0, body);
    addPart(0.5, 0.62, 0.28, shirtMat, 0, 0.33, 0, tor);
    addPart(0.52, 0.4, 0.3, vestMat, 0, 0.4, 0, tor);
    addPart(0.54, 0.08, 0.3, rigAssets.belt, 0, 0.03, 0, tor);
    addPart(0.12, 0.1, 0.04, visorMat, 0.13, 0.5, 0.16, tor);
    addPart(0.16, 0.22, 0.05, visorMat, 0, 0.42, -0.16, tor);

    // Neck + Head + Helmet + Glowing Visor + Radio Antenna
    const neck = makePivot(0, 0.68, 0, tor);
    addPart(0.28, 0.28, 0.26, rigAssets.skin, 0, 0.16, 0, neck);
    addPart(0.34, 0.14, 0.32, helmMat, 0, 0.31, 0, neck);
    addPart(0.03, 0.18, 0.03, rigAssets.gunDark, 0.13, 0.44, -0.06, neck);
    addPart(0.3, 0.07, 0.05, visorMat, 0, 0.2, 0.14, neck);

    // Articulated Shoulders -> Elbows -> Gloved Fists
    const buildArm = (side: number) => {
      const sh = makePivot(side * 0.33, 0.55, 0, tor);
      const el = makePivot(0, -0.36, 0, sh);
      addPart(0.15, 0.36, 0.15, shirtMat, 0, -0.18, 0, sh);
      addPart(0.13, 0.27, 0.13, shirtMat, 0, -0.145, 0, el);
      addPart(0.14, 0.05, 0.14, rigAssets.gunDark, 0, -0.25, 0, el);
      addPart(0.13, 0.12, 0.13, rigAssets.skin, 0, -0.34, 0, el);
      addPart(0.136, 0.065, 0.07, vestMat, 0, -0.315, 0.038, el);
      return [sh, el] as const;
    };
    const [sR, eR] = buildArm(1);
    const [sL, eL] = buildArm(-1);

    // Weapon Pivot + All 6 Distinct Models
    const gun = makePivot(0.04, 0.47, 0.27, tor);
    const addGunPart = (
      gp: any,
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: any = rigAssets.gunDark
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      gp.add(mesh);
    };

    // 0: PULSE CARBINE
    const wCarbine = new THREE.Group();
    addGunPart(wCarbine, 0.07, 0.36, 0.1, 0, -0.12, 0);
    addGunPart(wCarbine, 0.035, 0.22, 0.035, 0, -0.4, 0, rigAssets.gunMetal);
    addGunPart(wCarbine, 0.06, 0.1, 0.08, 0, -0.06, -0.08);
    addGunPart(wCarbine, 0.05, 0.14, 0.06, 0, -0.2, -0.07);
    addGunPart(wCarbine, 0.03, 0.04, 0.06, 0, -0.08, 0.07, visorMat);
    addGunPart(wCarbine, 0.05, 0.07, 0.09, 0, -0.3, -0.07);

    // 1: SCATTER BLASTER (SHOTGUN)
    const wShotgun = new THREE.Group();
    addGunPart(wShotgun, 0.085, 0.3, 0.115, 0, -0.1, 0);
    addGunPart(wShotgun, 0.05, 0.44, 0.05, 0, -0.4, 0, rigAssets.gunMetal);
    addGunPart(wShotgun, 0.045, 0.36, 0.045, 0, -0.35, -0.058);
    addGunPart(wShotgun, 0.08, 0.13, 0.08, 0, -0.3, -0.058, rigAssets.shotgunAccent);
    addGunPart(wShotgun, 0.05, 0.1, 0.07, 0, -0.04, -0.085);
    addGunPart(wShotgun, 0.06, 0.04, 0.06, 0, -0.6, 0, rigAssets.shotgunAccent);

    // 2: RAIL CANNON
    const wRail = new THREE.Group();
    addGunPart(wRail, 0.085, 0.4, 0.115, 0, -0.12, 0);
    addGunPart(wRail, 0.04, 0.62, 0.04, 0, -0.52, 0, rigAssets.gunMetal);
    addGunPart(wRail, 0.075, 0.03, 0.075, 0, -0.42, 0, visorMat);
    addGunPart(wRail, 0.075, 0.03, 0.075, 0, -0.58, 0, visorMat);
    addGunPart(wRail, 0.075, 0.03, 0.075, 0, -0.74, 0, visorMat);
    addGunPart(wRail, 0.045, 0.15, 0.055, 0, -0.12, 0.085, visorMat);
    addGunPart(wRail, 0.05, 0.1, 0.07, 0, -0.04, -0.085);
    addGunPart(wRail, 0.06, 0.14, 0.08, 0, -0.3, -0.07);

    // 3: VIPER PISTOL
    const wPistol = new THREE.Group();
    addGunPart(wPistol, 0.055, 0.22, 0.09, 0, -0.08, 0);
    addGunPart(wPistol, 0.04, 0.14, 0.055, 0, -0.22, 0.01, rigAssets.gunMetal);
    addGunPart(wPistol, 0.05, 0.1, 0.075, 0, -0.04, -0.085);
    addGunPart(wPistol, 0.025, 0.03, 0.03, 0, -0.28, 0.04, visorMat);

    // 4: LONGSHOT SNIPER
    const wSniper = new THREE.Group();
    addGunPart(wSniper, 0.07, 0.42, 0.1, 0, -0.12, 0);
    addGunPart(wSniper, 0.03, 0.72, 0.03, 0, -0.56, 0, rigAssets.gunMetal);
    addGunPart(wSniper, 0.055, 0.18, 0.055, 0, -0.84, 0);
    addGunPart(wSniper, 0.05, 0.22, 0.06, 0, -0.14, 0.09, visorMat);
    addGunPart(wSniper, 0.06, 0.12, 0.08, 0, -0.05, -0.08);
    addGunPart(wSniper, 0.05, 0.14, 0.065, 0, -0.26, -0.075);

    // 5: ARC KNIFE
    const wKnife = new THREE.Group();
    addGunPart(wKnife, 0.04, 0.14, 0.045, 0, -0.06, -0.04);
    addGunPart(wKnife, 0.06, 0.03, 0.07, 0, -0.14, -0.04, rigAssets.gunMetal);
    addGunPart(wKnife, 0.025, 0.26, 0.055, 0, -0.28, -0.03, rigAssets.knifeBlade);

    const weaponGroups = [wCarbine, wShotgun, wRail, wPistol, wSniper, wKnife];
    for (let i = 0; i < weaponGroups.length; i++) {
      weaponGroups[i].visible = i === Math.max(0, Math.min(5, p.weaponId));
      gun.add(weaponGroups[i]);
    }

    const muzzleFlash = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.22), rigAssets.muzzle);
    muzzleFlash.position.set(0, -0.62, 0);
    muzzleFlash.visible = false;
    gun.add(muzzleFlash);

    // Articulated Hips -> Knees -> Shins -> Boots
    const buildLeg = (side: number) => {
      const hip = makePivot(side * 0.12, 0.88, 0, body);
      const knee = makePivot(0, -0.44, 0, hip);
      addPart(0.17, 0.44, 0.2, rigAssets.pants, 0, -0.22, 0, hip);
      addPart(0.15, 0.4, 0.17, rigAssets.pants, 0, -0.2, 0, knee);
      addPart(0.17, 0.1, 0.26, rigAssets.boot, 0, -0.43, 0.04, knee);
      return [hip, knee] as const;
    };
    const [hipL, kneeL] = buildLeg(-1);
    const [hipR, kneeR] = buildLeg(1);

    // Invisible Precision Hitboxes
    const headHitbox = new THREE.Mesh(rigAssets.headHitGeo, rigAssets.hit);
    headHitbox.position.set(0, 1.64, 0);
    headHitbox.userData = { playerId: p.id, part: 'head' };
    root.add(headHitbox);

    const bodyHitbox = new THREE.Mesh(rigAssets.bodyHitGeo, rigAssets.hit);
    bodyHitbox.position.set(0, 0.72, 0);
    bodyHitbox.userData = { playerId: p.id, part: 'body' };
    root.add(bodyHitbox);

    // Overhead Nameplate + HP/Shield Bar
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 192;
    labelCanvas.height = 54;
    this.drawNameplate(labelCanvas, p);

    const texture = new THREE.CanvasTexture(labelCanvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
    });
    const labelSprite = new THREE.Sprite(spriteMat);
    labelSprite.position.set(0, 2.28, 0);
    labelSprite.scale.set(1.9, 0.54, 1);
    root.add(labelSprite);

    const hashCode = p.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

    return {
      playerId: p.id,
      root,
      shadowMesh,
      allyBadge,
      body,
      tor,
      neck,
      sR,
      eR,
      sL,
      eL,
      hipL,
      kneeL,
      hipR,
      kneeR,
      gun,
      weaponGroups,
      muzzleFlash,
      bodyHitbox,
      headHitbox,
      labelSprite,
      labelCanvas,
      labelKey: `${p.name}:${p.hp}:${p.shield}:${p.team}`,
      targetX: p.x,
      targetY: p.y,
      targetZ: p.z,
      targetYaw: p.yaw,
      targetPitch: p.pitch,
      targetWeaponId: p.weaponId,
      targetAds: p.ads,
      targetCrouching: p.crouching,
      smoothSpeed: 0,
      walkPhase: 0,
      aimBlend: 0,
      crouchBlend: 0,
      airBlend: 0,
      kickTimer: 0,
      flinchTimer: 0,
      swapTimer: 0,
      knifeSlashTimer: 0,
      punchTimer: 0,
      punchHand: 0,
      landTimer: 0,
      muzzleTimer: 0,
      wasAirborne: false,
      wasAlive: p.alive,
      deathTimer: p.alive ? 0 : 99,
      deathTwist: hashCode % 2 === 0 ? 1 : -1,
      deathFallDir: hashCode % 3 === 0 ? -1 : 1,
      lastTeam: p.team,
    };
  }

  private patchSurvivalFists(engine: any, cw: ArenaWindow): void {
    const THREE = cw.THREE;
    if (!engine || !THREE) return;

    const rebuildFistGroup = (grp: any, side: 1 | -1, mats: any) => {
      if (!grp) return;
      while (grp.children.length > 0) {
        grp.remove(grp.children[0]);
      }

      const addBox = (
        parent: any,
        w: number,
        h: number,
        d: number,
        mat: any,
        x: number,
        y: number,
        z: number,
        rx = 0,
        ry = 0,
        rz = 0
      ) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(x, y, z);
        if (rx || ry || rz) mesh.rotation.set(rx, ry, rz);
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        parent.add(mesh);
        return mesh;
      };

      // Fingerless tactical glove palm + armored knuckle guard + cuff
      addBox(grp, 0.088, 0.066, 0.076, mats.glove, 0, -0.004, 0.014);
      addBox(grp, 0.084, 0.022, 0.034, mats.pad, 0, 0.024, -0.02);
      addBox(grp, 0.082, 0.062, 0.032, mats.cuff, 0, -0.006, 0.056);

      // 4 articulated curled finger digits across front of fist
      for (let f = 0; f < 4; f++) {
        const fx = -0.0285 + f * 0.019;
        addBox(grp, 0.016, 0.026, 0.024, mats.skin, fx, 0.008, -0.036);
        addBox(grp, 0.015, 0.024, 0.024, mats.crease, fx, -0.015, -0.03);
      }

      // Thumb tucked cleanly along inner side of fist
      addBox(grp, 0.024, 0.03, 0.046, mats.skin, -side * 0.048, -0.003, -0.008, -0.22, side * 0.28, 0);
      addBox(grp, 0.022, 0.022, 0.024, mats.glove, -side * 0.046, 0.006, 0.015);

      // Long angled tactical sleeve extending cleanly past lower-corner viewport edge
      const arm = new THREE.Group();
      arm.position.set(0, -0.01, 0.068);
      const armDir = new THREE.Vector3(side * 0.42, -0.32, 0.78).normalize();
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), armDir);
      addBox(arm, 0.092, 0.072, 0.014, mats.band, 0, 0, 0.028);
      addBox(arm, 0.088, 0.074, 0.78, mats.sleeve, 0, 0, 0.42);
      grp.add(arm);
    };

    const ensureFistsGeometryRebuilt = () => {
      const F = engine.fistsG;
      if (!F || !engine.fistR || !engine.fistL) return;
      if (F.__mpFistsRebuilt) return;
      const mats = {
        glove: new THREE.MeshStandardMaterial({ color: 0x232b2f, roughness: 0.82, metalness: 0.18 }),
        pad: new THREE.MeshStandardMaterial({ color: 0x404850, roughness: 0.5, metalness: 0.42 }),
        skin: new THREE.MeshStandardMaterial({ color: 0xd9a07c, roughness: 0.82, metalness: 0.04 }),
        crease: new THREE.MeshStandardMaterial({ color: 0xba7c58, roughness: 0.88, metalness: 0.02 }),
        cuff: new THREE.MeshStandardMaterial({ color: 0x141821, roughness: 0.65, metalness: 0.35 }),
        sleeve: new THREE.MeshStandardMaterial({ color: 0x1d3a5f, roughness: 0.88, metalness: 0.06 }),
        band: new THREE.MeshStandardMaterial({
          color: 0x19e6ff,
          emissive: 0x19e6ff,
          emissiveIntensity: 1.25,
          roughness: 0.35,
        }),
      };
      rebuildFistGroup(engine.fistR, 1, mats);
      rebuildFistGroup(engine.fistL, -1, mats);
      F.__mpFistsRebuilt = true;
    };

    ensureFistsGeometryRebuilt();

    if (!engine.__mpUpdateFistsHooked && typeof engine.updateFists === 'function') {
      engine.__mpUpdateFistsHooked = true;
      engine.updateFists = function (i: any) {
        ensureFistsGeometryRebuilt();
        const F = engine.fistsG;
        if (!F) return;

        const on =
          !!engine.svFistsOn &&
          i.weaponId === 5 &&
          i.pendingWeaponId == null &&
          i.grenadeAnim === 0;
        F.visible = on;

        const m = engine.weaponRig?.models;
        if (engine.svFistsOn && m && m[5]) {
          m[5].visible = false;
        }
        if (!on) {
          F.position.set(0, 0, 0);
          F.rotation.set(0, 0, 0);
          return;
        }

        const ads = Math.max(0, Math.min(1, i.ads || 0));
        // Compensate weaponRig.root right-handed +0.22 offset so fists stay centered symmetrically
        F.position.set(-0.22 * (1 - ads), 0.03 - ads * 0.065, 0.06 - ads * 0.05);
        F.rotation.set(0, 0, 0);

        const p = i.slashAnim > 0 ? Math.max(0, Math.min(1, i.slashAnim)) : 0;
        const right = (i.slashDir || 1) < 0;
        const ext =
          p > 0
            ? p < 0.32
              ? Math.sin((p / 0.32) * (Math.PI / 2))
              : Math.pow(Math.cos(((p - 0.32) / 0.68) * (Math.PI / 2)), 1.35)
            : 0;
        const er = right ? ext : 0;
        const el = right ? 0 : ext;

        const elapsed = typeof engine.elapsed === 'number' ? engine.elapsed : performance.now() * 0.001;
        const speed = Math.hypot(i.vx || 0, i.vz || 0);
        const moveAmp = Math.min(1, speed / 7.5) * (1 - ads * 0.65) * (1 - ext * 0.7);
        const walk = typeof i.walkPhase === 'number' ? i.walkPhase : elapsed * 8;
        const sway = Math.sin(elapsed * 2.1) * 0.005 * (1 - ads * 0.5);
        const bobX = Math.cos(walk) * 0.012 * moveAmp;
        const bobY = Math.abs(Math.sin(walk)) * 0.016 * moveAmp;
        const bobZ = Math.sin(walk) * 0.022 * moveAmp;

        const R = engine.fistR;
        const Lh = engine.fistL;

        // Right fist (rear cross -> snaps forward & pronates horizontal on right punch, tucks on left jab)
        R.position.set(
          0.195 - ads * 0.055 - 0.14 * er + 0.015 * el + bobX,
          -0.025 + ads * 0.06 + sway + bobY + 0.08 * er + 0.02 * el,
          -0.02 - ads * 0.04 - 0.34 * er + 0.055 * el - bobZ
        );
        R.rotation.set(
          0.22 - 0.32 * er + 0.06 * el,
          0.18 + 0.16 * er,
          -0.72 - ads * 0.12 + 0.6 * er
        );

        // Left fist (lead jab -> snaps forward & pronates horizontal on left punch, tucks on right cross)
        Lh.position.set(
          -0.185 + ads * 0.055 + 0.14 * el - 0.015 * er + bobX,
          -0.01 + ads * 0.06 - sway + bobY + 0.08 * el + 0.02 * er,
          -0.06 - ads * 0.04 - 0.32 * el + 0.055 * er + bobZ
        );
        Lh.rotation.set(
          0.2 - 0.32 * el + 0.06 * er,
          -0.18 - 0.16 * el,
          0.72 + ads * 0.12 - 0.6 * el
        );
      };
    }
  }

  private drawNameplate(canvas: HTMLCanvasElement, p: RemotePlayerState): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(5, 7, 13, 0.85)';
    ctx.fillRect(10, 6, 172, 42);
    ctx.strokeStyle = p.team === 'blue' ? '#19e6ff' : '#ff3b5c';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 6, 172, 42);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px Oxanium, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.name.slice(0, 14).toUpperCase(), 96, 24);

    const barW = 148;
    const barX = 22;
    const barY = 33;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(barX, barY, barW, 8);

    const hpRatio = Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));
    ctx.fillStyle = p.team === 'blue' ? '#19e6ff' : '#ff3b5c';
    ctx.fillRect(barX, barY, Math.round(barW * hpRatio), 8);

    if (p.shield > 0) {
      const shRatio = Math.max(0, Math.min(1, p.shield / Math.max(1, p.maxShield)));
      ctx.fillStyle = '#ffcf40';
      ctx.fillRect(barX, barY - 3, Math.round(barW * shRatio), 2);
    }
  }

  private createTracerMesh(THREE: ThreeLike, start: any, end: any, colorHex: string): void {
    const dist = start.distanceTo(end);
    if (dist < 0.25) return;

    const helper = this.ensureThreeAssets(THREE);
    let mat = helper.tracerMats.get(colorHex);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorHex),
        transparent: true,
        opacity: 0.9,
      });
      helper.tracerMats.set(colorHex, mat);
    }

    const mesh = new THREE.Mesh(helper.tracerGeo, mat);
    mesh.scale.set(1, dist, 1);
    mesh.position.copy(start).lerp(end, 0.5);

    helper.dirVec.copy(end).sub(start).normalize();
    (helper.quat as any).setFromUnitVectors(helper.upVec, helper.dirVec);
    mesh.quaternion.copy(helper.quat);

    this.mpRoot.add(mesh);
    this.activeTracers.push({
      mesh,
      expiresAt: performance.now() + 95,
    });
  }
}
