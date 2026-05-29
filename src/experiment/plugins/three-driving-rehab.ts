import { JsPsych, ParameterType } from 'jspsych';
import type { JsPsychPlugin, TrialType } from 'jspsych';
import { SoundManager } from '../../utils/soundManager';

type ThreeModule = typeof import('three');

const info = {
  name: 'three-driving-rehab',
  version: '1.0.0',
  parameters: {
    duration_ms: {
      type: ParameterType.INT,
      default: 90_000,
    },
    red_flash_enabled: {
      type: ParameterType.BOOL,
      default: true,
    },
  },
  data: {
    rt: { type: ParameterType.INT },
    correct: { type: ParameterType.BOOL },
    target: { type: ParameterType.STRING },
    response: { type: ParameterType.STRING },
    duration_ms: { type: ParameterType.INT },
    average_rt: { type: ParameterType.INT },
    median_rt: { type: ParameterType.INT },
    valid_event_count: { type: ParameterType.INT },
    collisions: { type: ParameterType.INT },
    lane_deviations: { type: ParameterType.INT },
    average_fps: { type: ParameterType.INT },
    route_progress: { type: ParameterType.FLOAT },
    driving_events: { type: ParameterType.COMPLEX },
  },
} as const;

type Info = typeof info;

interface Vec2 {
  x: number;
  z: number;
}

interface RouteSegment {
  start: Vec2;
  dir: Vec2;
  length: number;
  instruction: string;
}

interface RoutePoint {
  x: number;
  z: number;
  dir: Vec2;
  normal: Vec2;
  segmentIndex: number;
  localDistance: number;
}

interface DrivingInput {
  steering: number;
  throttle: number;
  brake: number;
  gamepadName: string;
}

type HazardId = 'child-crossing' | 'plane-crash' | 'drunk-driver' | 'elder-stopped' | 'wrong-way-driver';

interface HazardScript {
  id: HazardId;
  label: string;
  distance: number;
}

interface DrivingEventResult {
  event_id: HazardId;
  label: string;
  distance_m: number;
  rt_ms: number | null;
  valid: boolean;
  collision: boolean;
  brake_preheld: boolean;
  response: string;
}

interface ActiveHazard {
  script: HazardScript;
  group: any;
  triggerDistance: number;
  hazardDistance: number;
  startTime: number;
  brakeTime: number | null;
  rt: number | null;
  preheldBrake: boolean;
  collision: boolean;
  resolved: boolean;
  removeAt: number | null;
  currentDistance: number;
  result: DrivingEventResult;
}

class ThreeDrivingRehabPlugin implements JsPsychPlugin<Info> {
  static info = info;

  private three: ThreeModule | null = null;
  private renderer: any = null;
  private scene: any = null;
  private camera: any = null;
  private raf = 0;
  private finished = false;
  private routeLength = 0;
  private lastFrameTime = 0;
  private trialStartTime = 0;
  private progress = 0;
  private speed = 0;
  private lateralOffset = 0;
  private laneDeviationCount = 0;
  private laneDeviationActive = false;
  private lastBrakePressed = false;
  private fpsSamples: number[] = [];
  private triggeredHazards = new Set<HazardId>();
  private activeHazards: ActiveHazard[] = [];
  private eventResults: DrivingEventResult[] = [];
  private keyState = {
    left: false,
    right: false,
    up: false,
    down: false,
  };

  private keydownListener: ((event: KeyboardEvent) => void) | null = null;
  private keyupListener: ((event: KeyboardEvent) => void) | null = null;
  private resizeListener: (() => void) | null = null;

  private hud: {
    status: HTMLDivElement;
    speed: HTMLDivElement;
    distance: HTMLDivElement;
    event: HTMLDivElement;
    redFlash: HTMLDivElement;
    inputBars?: HTMLDivElement;
  } | null = null;

  private readonly roadWidth = 12;
  private readonly hazardLeadDistance = 34;
  private readonly route: RouteSegment[] = [
    { start: { x: 0, z: 0 }, dir: { x: 0, z: 1 }, length: 110, instruction: '前方路口右轉' },
    { start: { x: 0, z: 110 }, dir: { x: 1, z: 0 }, length: 120, instruction: '下一路口左轉' },
    { start: { x: 120, z: 110 }, dir: { x: 0, z: 1 }, length: 135, instruction: '直行抵達目的地' },
  ];

  private readonly scripts: HazardScript[] = [
    { id: 'child-crossing', label: '小孩突然衝出馬路', distance: 42 },
    { id: 'plane-crash', label: '飛機墜落於前方道路', distance: 106 },
    { id: 'drunk-driver', label: '醉酒駕駛車輛開上分隔島', distance: 168 },
    { id: 'elder-stopped', label: '老人走到路中間停下', distance: 238 },
    { id: 'wrong-way-driver', label: '毒駕車輛逆向衝來', distance: 303 },
  ];

  constructor(private jsPsych: JsPsych) {
    this.routeLength = this.route.reduce((sum, segment) => sum + segment.length, 0);
  }

  trial(display_element: HTMLElement, trial: TrialType<Info>) {
    display_element.innerHTML = '';
    this.resetTrialState();
    SoundManager.init();

    const root = document.createElement('div');
    root.className = 'driving-rehab-root';
    root.tabIndex = 0;
    Object.assign(root.style, {
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      background: '#0f1720',
      color: '#fff',
      fontFamily: 'Inter, Noto Sans TC, sans-serif',
      userSelect: 'none',
    });
    display_element.appendChild(root);
    root.focus();

    const overlay = this.createCalibrationOverlay(root);
    const threePromise = import('three').then((three) => {
      this.three = three;
      const ready = overlay.querySelector<HTMLDivElement>('[data-driving-ready]');
      if (ready) ready.textContent = '3D 資源已載入。請確認輸入訊號後開始任務。';
    });

    this.attachKeyboardListeners(() => {
      void startDriving();
    }, trial, display_element);
    this.startCalibrationPreview(overlay);

    const startButton = overlay.querySelector<HTMLButtonElement>('[data-driving-start]');
    const startDriving = async () => {
      if (this.finished || this.renderer) return;
      startButton?.setAttribute('disabled', 'true');
      startButton && (startButton.textContent = '載入中...');
      try {
        await threePromise;
        if (!this.three) throw new Error('Three.js failed to load.');
        overlay.remove();
        this.initScene(root);
        this.initHud(root, trial.red_flash_enabled ?? true);
        this.trialStartTime = performance.now();
        this.lastFrameTime = this.trialStartTime;
        this.lastBrakePressed = this.readInput().brake > 0.35;
        this.raf = requestAnimationFrame((time) => this.loop(time, trial, display_element));
      } catch (error) {
        console.error(error);
        this.finishTrial(trial, display_element, 'load-error');
      }
    };

    startButton?.addEventListener('click', () => {
      void startDriving();
    });
  }

  private resetTrialState() {
    this.cleanupRenderResources();
    this.finished = false;
    this.progress = 0;
    this.speed = 0;
    this.lateralOffset = 0;
    this.trialStartTime = 0;
    this.lastFrameTime = 0;
    this.laneDeviationCount = 0;
    this.laneDeviationActive = false;
    this.lastBrakePressed = false;
    this.fpsSamples = [];
    this.triggeredHazards = new Set<HazardId>();
    this.activeHazards = [];
    this.eventResults = [];
    this.keyState = { left: false, right: false, up: false, down: false };
  }

  private createCalibrationOverlay(root: HTMLDivElement): HTMLDivElement {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '20',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px',
      background: 'linear-gradient(135deg, rgba(6, 22, 36, 0.96), rgba(20, 38, 52, 0.96))',
    });

    overlay.innerHTML = `
      <div style="width:min(760px, 100%); border:1px solid rgba(255,255,255,0.18); border-radius:24px; padding:32px; background:rgba(255,255,255,0.08); box-shadow:0 30px 90px rgba(0,0,0,0.36);">
        <div style="font-size:13px; letter-spacing:2px; text-transform:uppercase; color:#7dd3fc; font-weight:700; margin-bottom:8px;">Driving Cognitive Rehab Simulator</div>
        <h1 style="font-size:34px; line-height:1.15; margin:0 0 12px;">駕駛認知復健模擬器</h1>
        <p style="font-size:16px; line-height:1.7; color:rgba(255,255,255,0.78); margin:0 0 24px;">
          將貨物由 A 點送至 B 點。請依照地面導航箭頭前進，遇到突發事件時立即按下煞車。
        </p>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:22px;">
          <div style="padding:14px; border-radius:14px; background:rgba(255,255,255,0.08);"><b>方向</b><br><span style="color:rgba(255,255,255,0.68);">← / → 或方向盤</span></div>
          <div style="padding:14px; border-radius:14px; background:rgba(255,255,255,0.08);"><b>油門</b><br><span style="color:rgba(255,255,255,0.68);">↑ 或油門踏板</span></div>
          <div style="padding:14px; border-radius:14px; background:rgba(255,255,255,0.08);"><b>緊急煞車</b><br><span style="color:rgba(255,255,255,0.68);">↓ 或煞車踏板</span></div>
        </div>
        <div data-driving-input-bars style="display:grid; gap:10px; margin-bottom:18px;"></div>
        <div data-driving-ready style="font-size:13px; color:rgba(255,255,255,0.68); margin-bottom:20px;">正在動態載入 3D 資源...</div>
        <button data-driving-start style="width:100%; min-height:56px; border:0; border-radius:16px; background:#38bdf8; color:#062338; font-size:18px; font-weight:800; cursor:pointer;">開始送貨任務</button>
        <div style="margin-top:14px; text-align:center; font-size:12px; color:rgba(255,255,255,0.55);">Enter 開始，Esc 可提前結束並返回結果頁。</div>
      </div>
    `;

    const inputBars = overlay.querySelector<HTMLDivElement>('[data-driving-input-bars]');
    if (inputBars) this.hud = { status: document.createElement('div'), speed: document.createElement('div'), distance: document.createElement('div'), event: document.createElement('div'), redFlash: document.createElement('div'), inputBars };

    root.appendChild(overlay);
    return overlay;
  }

  private startCalibrationPreview(overlay: HTMLDivElement) {
    const update = () => {
      if (!overlay.isConnected || this.finished || this.renderer) return;
      const inputBars = overlay.querySelector<HTMLDivElement>('[data-driving-input-bars]');
      if (inputBars) {
        const input = this.readInput();
        inputBars.innerHTML = '';
        inputBars.appendChild(this.createInputBar('方向', input.steering, -1, 1));
        inputBars.appendChild(this.createInputBar('油門', input.throttle, 0, 1));
        inputBars.appendChild(this.createInputBar('煞車', input.brake, 0, 1));
        const device = document.createElement('div');
        device.style.fontSize = '12px';
        device.style.color = 'rgba(255,255,255,0.62)';
        device.textContent = input.gamepadName ? `已偵測方向盤/控制器：${input.gamepadName}` : '未偵測到方向盤，將使用鍵盤控制。';
        inputBars.appendChild(device);
      }
      requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }

  private createInputBar(label: string, value: number, min: number, max: number): HTMLDivElement {
    const wrapper = document.createElement('div');
    const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
    wrapper.innerHTML = `
      <div style="display:flex; justify-content:space-between; font-size:12px; color:rgba(255,255,255,0.72); margin-bottom:4px;">
        <span>${label}</span><span>${value.toFixed(2)}</span>
      </div>
      <div style="height:8px; border-radius:999px; background:rgba(255,255,255,0.14); overflow:hidden;">
        <div style="height:100%; width:${normalized * 100}%; background:#38bdf8; border-radius:999px;"></div>
      </div>
    `;
    return wrapper;
  }

  private attachKeyboardListeners(
    onStart: () => void,
    trial: TrialType<Info>,
    display_element: HTMLElement,
  ) {
    this.keydownListener = (event: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) {
        event.preventDefault();
      }
      if (event.code === 'ArrowLeft') this.keyState.left = true;
      if (event.code === 'ArrowRight') this.keyState.right = true;
      if (event.code === 'ArrowUp') this.keyState.up = true;
      if (event.code === 'ArrowDown') this.keyState.down = true;
      if (event.code === 'Enter' || event.code === 'Space') onStart();
      if (event.code === 'Escape') this.finishTrial(trial, display_element, 'aborted');
    };
    this.keyupListener = (event: KeyboardEvent) => {
      if (event.code === 'ArrowLeft') this.keyState.left = false;
      if (event.code === 'ArrowRight') this.keyState.right = false;
      if (event.code === 'ArrowUp') this.keyState.up = false;
      if (event.code === 'ArrowDown') this.keyState.down = false;
    };
    window.addEventListener('keydown', this.keydownListener);
    window.addEventListener('keyup', this.keyupListener);
  }

  private initScene(root: HTMLDivElement) {
    const THREE = this.requireThree();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fc7df);
    this.scene.fog = new THREE.Fog(0x8fc7df, 90, 260);

    const width = Math.max(1, root.clientWidth);
    const height = Math.max(1, root.clientHeight);
    this.camera = new THREE.PerspectiveCamera(68, width / height, 0.1, 520);

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(width, height, false);
    this.renderer.shadowMap.enabled = false;
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    root.appendChild(this.renderer.domElement);

    this.resizeListener = () => {
      if (!this.renderer || !this.camera) return;
      const nextWidth = Math.max(1, root.clientWidth);
      const nextHeight = Math.max(1, root.clientHeight);
      this.camera.aspect = nextWidth / nextHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(nextWidth, nextHeight, false);
    };
    window.addEventListener('resize', this.resizeListener);

    this.buildWorld();
  }

  private initHud(root: HTMLDivElement, redFlashEnabled: boolean) {
    const hud = document.createElement('div');
    Object.assign(hud.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '10',
      pointerEvents: 'none',
    });

    const top = document.createElement('div');
    Object.assign(top.style, {
      position: 'absolute',
      top: '18px',
      left: '18px',
      right: '18px',
      display: 'grid',
      gridTemplateColumns: '1.2fr auto auto',
      gap: '12px',
      alignItems: 'start',
      color: '#fff',
      textShadow: '0 2px 8px rgba(0,0,0,0.55)',
    });

    const status = this.createHudChip('任務：A 點送貨至 B 點');
    const speed = this.createHudChip('0 km/h');
    const distance = this.createHudChip('0 m');
    top.append(status, speed, distance);

    const event = this.createHudChip('保持車道並注意突發事件');
    Object.assign(event.style, {
      position: 'absolute',
      top: '82px',
      left: '50%',
      transform: 'translateX(-50%)',
      minWidth: 'min(560px, calc(100vw - 48px))',
      textAlign: 'center',
      background: 'rgba(5, 17, 28, 0.52)',
    });

    const redFlash = document.createElement('div');
    Object.assign(redFlash.style, {
      position: 'absolute',
      inset: '0',
      opacity: '0',
      transition: 'opacity 90ms linear',
      boxShadow: redFlashEnabled ? 'inset 0 0 0 22px rgba(255, 46, 46, 0.86), inset 0 0 80px rgba(255, 0, 0, 0.42)' : 'none',
    });

    const cockpit = this.createCockpitMask();
    hud.append(redFlash, cockpit, top, event);
    root.appendChild(hud);

    this.hud = { status, speed, distance, event, redFlash };
  }

  private createHudChip(text: string): HTMLDivElement {
    const div = document.createElement('div');
    div.textContent = text;
    Object.assign(div.style, {
      padding: '10px 14px',
      borderRadius: '14px',
      border: '1px solid rgba(255,255,255,0.16)',
      background: 'rgba(5, 17, 28, 0.64)',
      backdropFilter: 'blur(8px)',
      fontSize: '14px',
      fontWeight: '700',
      lineHeight: '1.35',
    });
    return div;
  }

  private createCockpitMask(): HTMLDivElement {
    const cockpit = document.createElement('div');
    Object.assign(cockpit.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      boxShadow: 'inset 0 0 0 10px rgba(4, 12, 18, 0.68), inset 0 80px 90px rgba(4, 12, 18, 0.28)',
    });

    const dash = document.createElement('div');
    Object.assign(dash.style, {
      position: 'absolute',
      left: '0',
      right: '0',
      bottom: '0',
      height: '24%',
      background: 'linear-gradient(180deg, rgba(30,39,44,0.92), rgba(8,12,16,0.98))',
      borderTop: '3px solid rgba(255,255,255,0.10)',
      borderRadius: '50% 50% 0 0 / 16% 16% 0 0',
    });

    const wheel = document.createElement('div');
    Object.assign(wheel.style, {
      position: 'absolute',
      left: '50%',
      bottom: '4%',
      width: '220px',
      height: '110px',
      transform: 'translateX(-50%)',
      border: '18px solid rgba(9, 14, 18, 0.96)',
      borderBottom: '0',
      borderRadius: '140px 140px 0 0',
      boxShadow: '0 0 0 2px rgba(255,255,255,0.08), inset 0 8px 24px rgba(255,255,255,0.06)',
    });

    const leftPillar = document.createElement('div');
    Object.assign(leftPillar.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '9%',
      height: '100%',
      background: 'linear-gradient(90deg, rgba(5,10,14,0.88), rgba(5,10,14,0.10))',
      clipPath: 'polygon(0 0, 100% 0, 42% 100%, 0 100%)',
    });

    const rightPillar = document.createElement('div');
    Object.assign(rightPillar.style, {
      position: 'absolute',
      right: '0',
      top: '0',
      width: '9%',
      height: '100%',
      background: 'linear-gradient(270deg, rgba(5,10,14,0.88), rgba(5,10,14,0.10))',
      clipPath: 'polygon(0 0, 100% 0, 100% 100%, 58% 100%)',
    });

    cockpit.append(dash, wheel, leftPillar, rightPillar);
    return cockpit;
  }

  private buildWorld() {
    const THREE = this.requireThree();
    if (!this.scene) return;

    const roadMat = new THREE.MeshBasicMaterial({ color: 0x2f3438 });
    const sidewalkMat = new THREE.MeshBasicMaterial({ color: 0xb8b0a2 });
    const laneMat = new THREE.MeshBasicMaterial({ color: 0xf4e86d });
    const grassMat = new THREE.MeshBasicMaterial({ color: 0x6f9a63 });

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), grassMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(60, -0.02, 155);
    this.scene.add(ground);

    for (const segment of this.route) {
      const mid = {
        x: segment.start.x + segment.dir.x * segment.length / 2,
        z: segment.start.z + segment.dir.z * segment.length / 2,
      };
      const angle = Math.atan2(segment.dir.x, segment.dir.z);

      const road = new THREE.Mesh(new THREE.BoxGeometry(this.roadWidth, 0.04, segment.length), roadMat);
      road.position.set(mid.x, 0, mid.z);
      road.rotation.y = angle;
      this.scene.add(road);

      const leftSidewalk = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, segment.length), sidewalkMat);
      leftSidewalk.position.set(
        mid.x - segment.dir.z * (this.roadWidth / 2 + 1.5),
        0.01,
        mid.z + segment.dir.x * (this.roadWidth / 2 + 1.5),
      );
      leftSidewalk.rotation.y = angle;
      this.scene.add(leftSidewalk);

      const rightSidewalk = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, segment.length), sidewalkMat);
      rightSidewalk.position.set(
        mid.x + segment.dir.z * (this.roadWidth / 2 + 1.5),
        0.01,
        mid.z - segment.dir.x * (this.roadWidth / 2 + 1.5),
      );
      rightSidewalk.rotation.y = angle;
      this.scene.add(rightSidewalk);

      for (let d = 12; d < segment.length; d += 18) {
        const center = {
          x: segment.start.x + segment.dir.x * d,
          z: segment.start.z + segment.dir.z * d,
        };
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 6), laneMat);
        stripe.position.set(center.x, 0.045, center.z);
        stripe.rotation.y = angle;
        this.scene.add(stripe);
      }
    }

    for (const distance of [110, 230]) {
      const point = this.getRoutePoint(distance);
      const cross = new THREE.Mesh(new THREE.BoxGeometry(76, 0.035, this.roadWidth), roadMat);
      cross.position.set(point.x, 0.025, point.z);
      cross.rotation.y = Math.atan2(point.normal.x, point.normal.z);
      this.scene.add(cross);
    }

    this.addBuildings();
    this.addRouteArrows();
    this.addDestinationMarker();
  }

  private addBuildings() {
    const THREE = this.requireThree();
    if (!this.scene) return;
    const colors = [0xb8c1cc, 0xd9b38c, 0x98b7a1, 0xc9a4a4, 0xb0a6cf];

    for (let d = 15; d < this.routeLength - 10; d += 20) {
      const point = this.getRoutePoint(d);
      for (const side of [-1, 1]) {
        const height = 7 + ((d * (side + 3)) % 13);
        const width = 8 + (d % 5);
        const depth = 8 + ((d + 3) % 6);
        const color = colors[Math.floor((d + side * 7) % colors.length)];
        const material = new THREE.MeshBasicMaterial({ color });
        const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
        building.position.set(
          point.x + point.normal.x * side * (this.roadWidth / 2 + 9 + (d % 8)),
          height / 2,
          point.z + point.normal.z * side * (this.roadWidth / 2 + 9 + (d % 8)),
        );
        building.rotation.y = Math.atan2(point.dir.x, point.dir.z);
        this.scene.add(building);
      }
    }
  }

  private addRouteArrows() {
    const THREE = this.requireThree();
    if (!this.scene) return;
    const arrowPlacements = [
      { distance: 72, label: '→' },
      { distance: 194, label: '←' },
      { distance: 286, label: '↑' },
    ];

    for (const placement of arrowPlacements) {
      const point = this.getRoutePoint(placement.distance);
      const texture = this.createArrowTexture(placement.label);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      });
      const arrow = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), material);
      arrow.rotation.x = -Math.PI / 2;
      arrow.rotation.z = -Math.atan2(point.dir.x, point.dir.z);
      arrow.position.set(point.x, 0.08, point.z);
      this.scene.add(arrow);
    }
  }

  private addDestinationMarker() {
    const THREE = this.requireThree();
    if (!this.scene) return;
    const point = this.getRoutePoint(this.routeLength - 5);
    const group = new THREE.Group();
    const postMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const flagMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5, 0.35), postMat);
    post.position.y = 2.5;
    const flag = new THREE.Mesh(new THREE.BoxGeometry(4, 2.2, 0.18), flagMat);
    flag.position.set(2, 4.2, 0);
    group.add(post, flag);
    group.position.set(point.x + point.normal.x * 6, 0, point.z + point.normal.z * 6);
    this.scene.add(group);
  }

  private createArrowTexture(label: string) {
    const THREE = this.requireThree();
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 256, 256);
      ctx.fillStyle = 'rgba(250, 204, 21, 0.90)';
      ctx.strokeStyle = 'rgba(24, 24, 27, 0.55)';
      ctx.lineWidth = 10;
      ctx.font = 'bold 188px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText(label, 128, 128);
      ctx.fillText(label, 128, 128);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  private loop(time: number, trial: TrialType<Info>, display_element: HTMLElement) {
    if (this.finished || !this.renderer || !this.scene || !this.camera) return;
    if (!display_element.isConnected) {
      this.finishTrial(trial, display_element, 'aborted');
      return;
    }

    const dt = Math.min(0.05, Math.max(0.001, (time - this.lastFrameTime) / 1000));
    this.lastFrameTime = time;
    this.fpsSamples.push(1 / dt);
    if (this.fpsSamples.length > 240) this.fpsSamples.shift();

    const elapsed = time - this.trialStartTime;
    const input = this.readInput();
    const brakePressed = input.brake > 0.35;
    if (brakePressed && !this.lastBrakePressed) {
      this.handleBrakePressed(time);
    }
    this.lastBrakePressed = brakePressed;

    this.updateVehicle(input, dt);
    this.spawnScriptedHazards(time);
    this.updateHazards(time);
    this.updateCamera(input.steering);
    this.updateHud(trial.duration_ms ?? 90_000, elapsed);

    this.renderer.render(this.scene, this.camera);

    if (this.progress >= this.routeLength - 2) {
      SoundManager.playRunEnd();
      this.finishTrial(trial, display_element, 'completed');
      return;
    }
    if (elapsed >= (trial.duration_ms ?? 90_000)) {
      this.finishTrial(trial, display_element, 'timeout');
      return;
    }

    this.raf = requestAnimationFrame((nextTime) => this.loop(nextTime, trial, display_element));
  }

  private updateVehicle(input: DrivingInput, dt: number) {
    const throttleAccel = 7.5;
    const brakeDecel = 20;
    const rollingDrag = 1.7;
    const maxSpeed = 18;

    this.speed += input.throttle * throttleAccel * dt;
    this.speed -= input.brake * brakeDecel * dt;
    this.speed -= rollingDrag * dt;
    this.speed = Math.max(0, Math.min(maxSpeed, this.speed));

    const steerScale = 5.6 * Math.max(0.25, this.speed / maxSpeed);
    this.lateralOffset += input.steering * steerScale * dt;
    this.lateralOffset *= 1 - Math.min(0.12, dt * 2.2);
    this.lateralOffset = Math.max(-5.8, Math.min(5.8, this.lateralOffset));
    this.progress += this.speed * dt;

    const deviating = Math.abs(this.lateralOffset) > 3.5;
    if (deviating && !this.laneDeviationActive) {
      this.laneDeviationCount += 1;
    }
    this.laneDeviationActive = deviating;
  }

  private spawnScriptedHazards(time: number) {
    const input = this.readInput();
    for (const script of this.scripts) {
      if (this.triggeredHazards.has(script.id)) continue;
      if (this.progress < script.distance) continue;

      this.triggeredHazards.add(script.id);
      const hazardDistance = Math.min(this.routeLength - 8, this.progress + this.hazardLeadDistance);
      const group = this.createHazardMesh(script.id);
      const point = this.getRoutePoint(hazardDistance);
      group.position.set(point.x, 0, point.z);
      group.rotation.y = Math.atan2(point.dir.x, point.dir.z);
      this.scene?.add(group);

      const preheldBrake = input.brake > 0.35;
      const result: DrivingEventResult = {
        event_id: script.id,
        label: script.label,
        distance_m: Math.round(script.distance),
        rt_ms: null,
        valid: !preheldBrake,
        collision: false,
        brake_preheld: preheldBrake,
        response: preheldBrake ? 'invalid-preheld-brake' : 'pending',
      };

      const hazard: ActiveHazard = {
        script,
        group,
        triggerDistance: this.progress,
        hazardDistance,
        startTime: time,
        brakeTime: preheldBrake ? time : null,
        rt: null,
        preheldBrake,
        collision: false,
        resolved: false,
        removeAt: null,
        currentDistance: hazardDistance,
        result,
      };
      this.activeHazards.push(hazard);
      this.eventResults.push(result);
      this.flashRed();
      if (this.hud) this.hud.event.textContent = script.label;
    }
  }

  private updateHazards(time: number) {
    for (const hazard of this.activeHazards) {
      const age = time - hazard.startTime;
      const point = this.getRoutePoint(hazard.currentDistance);
      const baseY = hazard.script.id === 'plane-crash' ? Math.max(0.3, 18 - age * 0.018) : 0;
      let lateral = 0;

      if (hazard.script.id === 'child-crossing') {
        lateral = -5 + Math.min(1, age / 1800) * 10;
      } else if (hazard.script.id === 'drunk-driver') {
        lateral = 4.2 + Math.sin(age / 230) * 1.1;
      } else if (hazard.script.id === 'wrong-way-driver') {
        hazard.currentDistance = Math.max(hazard.triggerDistance, hazard.hazardDistance - age * 0.012);
        const movingPoint = this.getRoutePoint(hazard.currentDistance);
        hazard.group.position.set(
          movingPoint.x - movingPoint.normal.x * 1.6,
          0,
          movingPoint.z - movingPoint.normal.z * 1.6,
        );
        hazard.group.rotation.y = Math.atan2(-movingPoint.dir.x, -movingPoint.dir.z);
      }

      if (hazard.script.id !== 'wrong-way-driver') {
        hazard.group.position.set(
          point.x + point.normal.x * lateral,
          baseY,
          point.z + point.normal.z * lateral,
        );
        hazard.group.rotation.y = Math.atan2(point.dir.x, point.dir.z) + (hazard.script.id === 'drunk-driver' ? Math.sin(age / 300) * 0.5 : 0);
      }

      if (hazard.script.id === 'plane-crash') {
        hazard.group.rotation.z = Math.min(1.15, age / 900);
      }

      const distanceToHazard = hazard.currentDistance - this.progress;
      const safeBrake = hazard.brakeTime !== null && this.speed < 2.4 && distanceToHazard > 2;
      const collisionNow = !hazard.resolved && distanceToHazard <= 4 && this.speed > 2.4;

      if (safeBrake) {
        this.resolveHazard(hazard, time, false, hazard.preheldBrake ? 'invalid-preheld-brake' : 'brake');
      } else if (collisionNow) {
        this.resolveHazard(hazard, time, true, hazard.brakeTime ? 'collision-after-brake' : 'collision-no-brake');
      }

      if (!hazard.resolved && age > 5200) {
        this.resolveHazard(hazard, time, true, hazard.brakeTime ? 'timeout-after-brake' : 'timeout-no-brake');
      }

      if (hazard.removeAt !== null && time >= hazard.removeAt) {
        this.scene?.remove(hazard.group);
        this.disposeObject(hazard.group);
        hazard.removeAt = null;
      }
    }

    this.activeHazards = this.activeHazards.filter((hazard) => hazard.removeAt !== null || !hazard.resolved);
  }

  private resolveHazard(hazard: ActiveHazard, time: number, collision: boolean, response: string) {
    if (hazard.resolved) return;
    hazard.resolved = true;
    hazard.collision = collision;
    hazard.result.collision = collision;
    hazard.result.response = response;
    hazard.result.rt_ms = hazard.rt;
    hazard.result.valid = !hazard.preheldBrake && hazard.rt !== null;
    hazard.removeAt = time + 950;

    if (collision) {
      SoundManager.playIncorrect();
      this.speed = Math.min(this.speed, 2.5);
    } else {
      SoundManager.playCorrect();
    }

    if (this.hud) {
      const rtText = hazard.rt !== null ? `${hazard.rt} ms` : '無有效 RT';
      this.hud.event.textContent = collision ? `${hazard.script.label}：碰撞 / ${rtText}` : `${hazard.script.label}：已煞停 / ${rtText}`;
    }
  }

  private handleBrakePressed(time: number) {
    const hazard = this.activeHazards.find((item) => !item.resolved && item.brakeTime === null);
    if (!hazard || hazard.preheldBrake) return;
    hazard.brakeTime = time;
    hazard.rt = Math.round(time - hazard.startTime);
    hazard.result.rt_ms = hazard.rt;
    hazard.result.response = 'brake';
    hazard.result.valid = true;
    if (this.hud) this.hud.event.textContent = `${hazard.script.label}：煞車反應 ${hazard.rt} ms`;
  }

  private createHazardMesh(id: HazardId) {
    switch (id) {
      case 'child-crossing':
        return this.createPersonMesh(0xffd166, 0.72);
      case 'elder-stopped':
        return this.createPersonMesh(0xd9d9d9, 0.9);
      case 'plane-crash':
        return this.createPlaneMesh();
      case 'drunk-driver':
        return this.createCarMesh(0xf97316);
      case 'wrong-way-driver':
        return this.createCarMesh(0xef4444);
      default:
        return this.createCarMesh(0xef4444);
    }
  }

  private createPersonMesh(color: number, scale: number) {
    const THREE = this.requireThree();
    const group = new THREE.Group();
    const skin = new THREE.MeshBasicMaterial({ color: 0xf2c6a0 });
    const bodyMat = new THREE.MeshBasicMaterial({ color });
    const dark = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45 * scale, 8, 6), skin);
    head.position.y = 2.1 * scale;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8 * scale, 1.15 * scale, 0.45 * scale), bodyMat);
    body.position.y = 1.25 * scale;
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22 * scale, 0.9 * scale, 0.22 * scale), dark);
    leftLeg.position.set(-0.22 * scale, 0.45 * scale, 0);
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22 * scale, 0.9 * scale, 0.22 * scale), dark);
    rightLeg.position.set(0.22 * scale, 0.45 * scale, 0);
    group.add(head, body, leftLeg, rightLeg);
    return group;
  }

  private createCarMesh(color: number) {
    const THREE = this.requireThree();
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshBasicMaterial({ color });
    const glassMat = new THREE.MeshBasicMaterial({ color: 0x1e3a5f });
    const tireMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 4.2), bodyMat);
    body.position.y = 0.75;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 1.7), glassMat);
    cabin.position.set(0, 1.35, -0.25);
    group.add(body, cabin);
    for (const x of [-1.25, 1.25]) {
      for (const z of [-1.35, 1.35]) {
        const wheel = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.55, 0.75), tireMat);
        wheel.position.set(x, 0.4, z);
        group.add(wheel);
      }
    }
    return group;
  }

  private createPlaneMesh() {
    const THREE = this.requireThree();
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0xd6dde4 });
    const wingMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 7), bodyMat);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(8, 0.18, 1.4), wingMat);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(4, 0.16, 1.1), wingMat);
    tail.position.z = -2.8;
    tail.position.y = 0.75;
    group.add(body, wing, tail);
    group.scale.set(1.2, 1.2, 1.2);
    return group;
  }

  private updateCamera(steering: number) {
    if (!this.camera) return;
    const point = this.getRoutePoint(this.progress);
    const look = this.getRoutePoint(Math.min(this.routeLength, this.progress + 35));
    const cabinSway = steering * 0.45;

    this.camera.position.set(
      point.x + point.normal.x * (this.lateralOffset + cabinSway),
      2.15,
      point.z + point.normal.z * (this.lateralOffset + cabinSway),
    );
    this.camera.lookAt(
      look.x + look.normal.x * this.lateralOffset,
      1.65,
      look.z + look.normal.z * this.lateralOffset,
    );
  }

  private updateHud(durationMs: number, elapsedMs: number) {
    if (!this.hud) return;
    const remaining = Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000));
    const nextTurn = this.getRoutePoint(Math.min(this.routeLength - 1, this.progress + 30));
    const instruction = this.route[nextTurn.segmentIndex]?.instruction ?? '直行';
    this.hud.status.textContent = `導航：${instruction} · 剩餘 ${remaining}s`;
    this.hud.speed.textContent = `${Math.round(this.speed * 3.6)} km/h`;
    this.hud.distance.textContent = `${Math.max(0, Math.round(this.routeLength - this.progress))} m`;
  }

  private flashRed() {
    if (!this.hud?.redFlash || this.hud.redFlash.style.boxShadow === 'none') return;
    this.hud.redFlash.style.opacity = '1';
    window.setTimeout(() => {
      if (this.hud?.redFlash) this.hud.redFlash.style.opacity = '0';
    }, 120);
  }

  private readInput(): DrivingInput {
    let steering = 0;
    let throttle = this.keyState.up ? 1 : 0;
    let brake = this.keyState.down ? 1 : 0;
    let gamepadName = '';

    if (this.keyState.left) steering -= 1;
    if (this.keyState.right) steering += 1;

    const gamepads = navigator.getGamepads?.() ?? [];
    const gamepad = Array.from(gamepads).find((pad): pad is Gamepad => Boolean(pad));
    if (gamepad) {
      gamepadName = gamepad.id;
      const axisSteering = Math.abs(gamepad.axes[0] ?? 0) > 0.08 ? gamepad.axes[0] : 0;
      const throttleButton = Math.max(gamepad.buttons[7]?.value ?? 0, gamepad.buttons[0]?.value ?? 0);
      const brakeButton = Math.max(gamepad.buttons[6]?.value ?? 0, gamepad.buttons[1]?.value ?? 0);
      const throttleAxis = this.normalizePedalAxis(gamepad.axes[2] ?? gamepad.axes[5] ?? 1);
      const brakeAxis = this.normalizePedalAxis(gamepad.axes[3] ?? gamepad.axes[4] ?? 1);
      steering = Math.abs(axisSteering) > Math.abs(steering) ? axisSteering : steering;
      throttle = Math.max(throttle, throttleButton, throttleAxis);
      brake = Math.max(brake, brakeButton, brakeAxis);
    }

    return {
      steering: Math.max(-1, Math.min(1, steering)),
      throttle: Math.max(0, Math.min(1, throttle)),
      brake: Math.max(0, Math.min(1, brake)),
      gamepadName,
    };
  }

  private normalizePedalAxis(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, (1 - value) / 2));
  }

  private getRoutePoint(distance: number): RoutePoint {
    const clamped = Math.max(0, Math.min(this.routeLength, distance));
    let traveled = 0;
    for (let i = 0; i < this.route.length; i += 1) {
      const segment = this.route[i];
      if (clamped <= traveled + segment.length || i === this.route.length - 1) {
        const local = Math.max(0, Math.min(segment.length, clamped - traveled));
        const dir = this.getSmoothedDirection(i, local);
        const normal = { x: -dir.z, z: dir.x };
        return {
          x: segment.start.x + segment.dir.x * local,
          z: segment.start.z + segment.dir.z * local,
          dir,
          normal,
          segmentIndex: i,
          localDistance: local,
        };
      }
      traveled += segment.length;
    }
    const last = this.route[this.route.length - 1];
    return {
      x: last.start.x + last.dir.x * last.length,
      z: last.start.z + last.dir.z * last.length,
      dir: last.dir,
      normal: { x: -last.dir.z, z: last.dir.x },
      segmentIndex: this.route.length - 1,
      localDistance: last.length,
    };
  }

  private getSmoothedDirection(index: number, local: number): Vec2 {
    const segment = this.route[index];
    const blendDistance = 14;
    if (local > segment.length - blendDistance && this.route[index + 1]) {
      const t = (local - (segment.length - blendDistance)) / blendDistance;
      return this.normalizeDir({
        x: segment.dir.x * (1 - t) + this.route[index + 1].dir.x * t,
        z: segment.dir.z * (1 - t) + this.route[index + 1].dir.z * t,
      });
    }
    if (local < blendDistance && this.route[index - 1]) {
      const t = local / blendDistance;
      return this.normalizeDir({
        x: this.route[index - 1].dir.x * (1 - t) + segment.dir.x * t,
        z: this.route[index - 1].dir.z * (1 - t) + segment.dir.z * t,
      });
    }
    return segment.dir;
  }

  private normalizeDir(dir: Vec2): Vec2 {
    const length = Math.hypot(dir.x, dir.z) || 1;
    return { x: dir.x / length, z: dir.z / length };
  }

  private finishTrial(trial: TrialType<Info>, display_element: HTMLElement, response: string) {
    if (this.finished) return;
    this.finished = true;

    for (const script of this.scripts) {
      if (this.eventResults.some((event) => event.event_id === script.id)) continue;
      this.eventResults.push({
        event_id: script.id,
        label: script.label,
        distance_m: Math.round(script.distance),
        rt_ms: null,
        valid: false,
        collision: false,
        brake_preheld: false,
        response: 'not-reached',
      });
    }

    const duration = this.trialStartTime > 0
      ? Math.round(performance.now() - this.trialStartTime)
      : 0;
    const validRts = this.eventResults
      .filter((event) => event.valid && event.rt_ms !== null)
      .map((event) => event.rt_ms as number)
      .sort((a, b) => a - b);
    const averageRt = validRts.length
      ? Math.round(validRts.reduce((sum, rt) => sum + rt, 0) / validRts.length)
      : 0;
    const medianRt = validRts.length
      ? (validRts.length % 2
        ? validRts[Math.floor(validRts.length / 2)]
        : Math.round((validRts[validRts.length / 2 - 1] + validRts[validRts.length / 2]) / 2))
      : 0;
    const collisions = this.eventResults.filter((event) => event.collision).length;
    const averageFps = this.fpsSamples.length
      ? Math.round(this.fpsSamples.reduce((sum, fps) => sum + fps, 0) / this.fpsSamples.length)
      : 0;

    this.detachGlobalListeners();
    this.cleanupRenderResources();
    display_element.innerHTML = '';

    this.jsPsych.finishTrial({
      rt: averageRt,
      correct: response === 'completed' && collisions === 0,
      target: 'Delivery A to B',
      response,
      duration_ms: duration > 0 ? duration : trial.duration_ms,
      average_rt: averageRt,
      median_rt: medianRt,
      valid_event_count: validRts.length,
      collisions,
      lane_deviations: this.laneDeviationCount,
      average_fps: averageFps,
      route_progress: Math.round(this.progress * 10) / 10,
      driving_events: this.eventResults,
    });
  }

  private detachGlobalListeners() {
    cancelAnimationFrame(this.raf);
    if (this.keydownListener) {
      window.removeEventListener('keydown', this.keydownListener);
      this.keydownListener = null;
    }
    if (this.keyupListener) {
      window.removeEventListener('keyup', this.keyupListener);
      this.keyupListener = null;
    }
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
      this.resizeListener = null;
    }
  }

  private cleanupRenderResources() {
    cancelAnimationFrame(this.raf);
    if (this.scene) {
      this.disposeObject(this.scene);
      this.scene.clear?.();
      this.scene = null;
    }
    if (this.renderer) {
      this.renderer.dispose?.();
      this.renderer.forceContextLoss?.();
      this.renderer.domElement?.remove?.();
      this.renderer = null;
    }
    this.camera = null;
    this.hud = null;
  }

  private disposeObject(object: any) {
    object?.traverse?.((child: any) => {
      child.geometry?.dispose?.();
      this.disposeMaterial(child.material);
    });
  }

  private disposeMaterial(material: any) {
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    for (const item of materials) {
      for (const key of ['map', 'alphaMap', 'aoMap', 'bumpMap', 'emissiveMap', 'metalnessMap', 'normalMap', 'roughnessMap']) {
        item[key]?.dispose?.();
      }
      item.dispose?.();
    }
  }

  private requireThree(): ThreeModule {
    if (!this.three) {
      throw new Error('Three.js module is not loaded.');
    }
    return this.three;
  }
}

export default ThreeDrivingRehabPlugin;
