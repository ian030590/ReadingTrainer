import { JsPsych, ParameterType } from 'jspsych';
import type { JsPsychPlugin, TrialType } from 'jspsych';
import { Application, Sprite, Texture, Text } from 'pixi.js';
import { pixiAppManager } from '../../utils/pixiPool';
import { typography } from '../../theme';
import { SoundManager } from '../../utils/soundManager';

const info = {
  name: 'pixi-gabor-patch',
  version: '1.0.0',
  parameters: {
    duration_ms: {
      type: ParameterType.INT,
      default: 60_000,
    },
    max_spots: {
      type: ParameterType.INT,
      default: 10,
    },
    min_size: {
      type: ParameterType.FLOAT,
      default: 0.2, // scale factor relative to 256px
    },
    max_size: {
      type: ParameterType.FLOAT,
      default: 0.8,
    },
    min_opacity: {
      type: ParameterType.FLOAT,
      default: 0.15,
    },
    max_opacity: {
      type: ParameterType.FLOAT,
      default: 0.8,
    },
    background_color: {
      type: ParameterType.STRING,
      default: '#808080',
    },
    difficulty: {
      type: ParameterType.STRING,
      default: 'beginner',
    },
  },
  data: {
    rt: { type: ParameterType.INT },
    correct: { type: ParameterType.BOOL },
    target: { type: ParameterType.STRING },
    response: { type: ParameterType.STRING },
    acquired_targets: { type: ParameterType.INT },
    duration_ms: { type: ParameterType.INT },
    score: { type: ParameterType.INT },
  },
} as const;

type Info = typeof info;

function createGaborTexture(size: number, freq: number, angle: number): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Texture.EMPTY;

  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;
  const cx = size / 2;
  const cy = size / 2;
  const sigma = size / 6;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const gauss = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
      const phase = dx * Math.cos(angle) + dy * Math.sin(angle);
      const sine = Math.sin(2 * Math.PI * freq * phase);
      
      const intensity = Math.round(128 + 127 * gauss * sine);
      const alpha = Math.round(255 * gauss);

      const i = (y * size + x) * 4;
      data[i] = intensity;
      data[i + 1] = intensity;
      data[i + 2] = intensity;
      data[i + 3] = alpha;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return Texture.from(canvas);
}

class PixiGaborPatchPlugin implements JsPsychPlugin<Info> {
  static info = info;
  private app: Application | null = null;
  private textures: Texture[] = [];
  private spots: Array<{ sprite: Sprite, targetSize: number, targetOpacity: number, type: number, spawnTime: number, maxScore: number, minSize: number, lifetime: number }> = [];
  private score = 0;
  private hits = 0;
  private gameStartTime = 0;
  private gameLoopRaf = 0;
  private isGameOver = false;

  constructor(private jsPsych: JsPsych) {}

  trial(display_element: HTMLElement, trial: TrialType<Info>) {
    display_element.innerHTML = '';
    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.cursor = 'crosshair';
    display_element.appendChild(container);

    const HUD = document.createElement('div');
    HUD.style.position = 'absolute';
    HUD.style.top = '20px';
    HUD.style.left = '20px';
    HUD.style.right = '20px';
    HUD.style.display = 'flex';
    HUD.style.justifyContent = 'space-between';
    HUD.style.pointerEvents = 'none';
    HUD.style.fontFamily = 'Inter, sans-serif';
    HUD.style.fontSize = '24px';
    HUD.style.fontWeight = 'bold';
    HUD.style.color = '#FFFFFF';
    HUD.style.textShadow = '0 2px 4px rgba(0,0,0,0.5)';

    const timerEl = document.createElement('div');
    const scoreEl = document.createElement('div');
    HUD.appendChild(timerEl);
    HUD.appendChild(scoreEl);
    container.appendChild(HUD);

    this.score = 0;
    this.hits = 0;
    this.spots = [];
    this.isGameOver = false;

    pixiAppManager.ensureReady().then(app => {
      this.app = app;
      pixiAppManager.attachTo(container);
      pixiAppManager.clearStage();
      app.renderer.background.color = trial.background_color ?? '#808080';
      
      // Generate some distinct Gabor textures
      this.textures = [
        createGaborTexture(256, 0.05, 0),
        createGaborTexture(256, 0.08, Math.PI / 4),
        createGaborTexture(256, 0.03, Math.PI / 2),
      ];

      this.gameStartTime = performance.now();

      const updateHUD = () => {
        const elapsed = performance.now() - this.gameStartTime;
        const duration = trial.duration_ms ?? 60000;
        const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));
        timerEl.textContent = `Time: ${remaining}s`;
        scoreEl.textContent = `Score: ${this.score}`;
      };

      const spawnSpot = () => {
        if (!this.app || this.isGameOver) return;
        const type = Math.floor(Math.random() * this.textures.length);
        const tex = this.textures[type];
        const sprite = new Sprite(tex);
        
        sprite.anchor.set(0.5);
        sprite.x = 128 + Math.random() * (this.app!.screen.width - 256);
        sprite.y = 128 + Math.random() * (this.app!.screen.height - 256);
        sprite.rotation = Math.random() * Math.PI * 2;
        
        const minSize = trial.min_size ?? 0.2;
        const maxSize = trial.max_size ?? 0.8;
        const targetSize = maxSize;
        sprite.scale.set(minSize);
        
        const minOp = trial.min_opacity ?? 0.15;
        const maxOp = trial.max_opacity ?? 0.8;
        const targetOpacity = maxOp;
        sprite.alpha = 0;
        
        sprite.eventMode = 'static';
        sprite.cursor = 'pointer';

        const spawnTime = performance.now();
        const maxScore = 1000;
        
        let lifetime = 4000;
        if (trial.difficulty === 'intermediate') {
          lifetime = 3000;
        } else if (trial.difficulty === 'advanced') {
          lifetime = 2000;
        }

        const spotData = { sprite, targetSize, targetOpacity, type, spawnTime, maxScore, minSize, lifetime };

        sprite.on('pointerdown', (e: any) => {
          e.stopPropagation();
          this.handleSpotClick(spotData);
        });

        this.app!.stage.addChild(sprite);
        this.spots.push(spotData);
      };

      const loop = (time: number) => {
        if (this.isGameOver || !this.app) return;
        
        const elapsed = time - this.gameStartTime;
        if (elapsed >= (trial.duration_ms ?? 60000)) {
          this.endGame(trial, display_element);
          return;
        }

        updateHUD();

        // Update spots (grow, fade in, and remove if score <= 0)
        for (let i = this.spots.length - 1; i >= 0; i--) {
          const spot = this.spots[i];
          const spotAge = time - spot.spawnTime;
          const progress = Math.min(1, spotAge / spot.lifetime);
          
          const currentSize = spot.minSize + progress * (spot.targetSize - spot.minSize);
          const currentOpacity = progress * spot.targetOpacity;
          
          spot.sprite.scale.set(currentSize);
          spot.sprite.alpha = currentOpacity;
          
          const currentScore = Math.ceil(spot.maxScore * (1 - progress));
          
          if (currentScore <= 0) {
            SoundManager.playPop();
            this.app.stage.removeChild(spot.sprite);
            spot.sprite.destroy();
            this.spots.splice(i, 1);
          }
        }

        // Spawn new spots if under limit
        let spawnChance = 0.02;
        if (trial.difficulty === 'intermediate') {
          spawnChance = 0.05;
        } else if (trial.difficulty === 'advanced') {
          spawnChance = 0.08;
        }
        if (this.spots.length < (trial.max_spots ?? 10) && Math.random() < spawnChance) {
          spawnSpot();
        }

        this.gameLoopRaf = requestAnimationFrame(loop);
      };

      // Initial spawn
      for (let i = 0; i < 3; i++) spawnSpot();
      
      this.gameLoopRaf = requestAnimationFrame(loop);
    });
  }

  private handleSpotClick(spot: { sprite: Sprite, targetSize: number, targetOpacity: number, type: number, spawnTime: number, maxScore: number, minSize: number, lifetime: number }) {
    if (this.isGameOver || !this.app) return;

    const now = performance.now();
    const spotAge = now - spot.spawnTime;
    const progress = Math.min(1, spotAge / spot.lifetime);
    const finalPoints = Math.max(0, Math.ceil(spot.maxScore * (1 - progress)));

    if (finalPoints <= 0) return; // ignore clicks on dead spots

    this.score += finalPoints;
    this.hits += 1;

    // Show floating score
    const floatText = new Text({
      text: finalPoints.toString(),
      style: {
        fontFamily: 'Inter',
        fontSize: 24,
        fontWeight: 'bold',
        fill: 0xFFFFFF,
        dropShadow: {
          alpha: 0.5,
          color: 0x000000,
          blur: 2,
          distance: 2,
        }
      }
    });
    floatText.anchor.set(0.5);
    floatText.x = spot.sprite.x;
    floatText.y = spot.sprite.y - 20;
    this.app.stage.addChild(floatText);

    // Animate floating text
    let frame = 0;
    const animateText = () => {
      frame++;
      floatText.y -= 1;
      floatText.alpha -= 0.02;
      if (frame < 50 && !this.isGameOver) {
        requestAnimationFrame(animateText);
      } else if (this.app && !this.app.stage.destroyed) {
        this.app.stage.removeChild(floatText);
        floatText.destroy();
      }
    };
    requestAnimationFrame(animateText);

    // Remove spot
    this.app.stage.removeChild(spot.sprite);
    spot.sprite.destroy();
    this.spots = this.spots.filter(s => s !== spot);
  }

  private endGame(trial: TrialType<Info>, display_element: HTMLElement) {
    this.isGameOver = true;
    cancelAnimationFrame(this.gameLoopRaf);

    if (this.app) {
      pixiAppManager.clearStage();
      pixiAppManager.detachCanvas();
      this.app = null;
    }

    // Cleanup textures
    for (const tex of this.textures) {
      tex.destroy(true);
    }
    this.textures = [];

    const trialData = {
      rt: trial.duration_ms,
      correct: true,
      target: 'GaborPatches',
      response: 'clicks',
      acquired_targets: this.hits,
      score: this.score,
      duration_ms: trial.duration_ms,
    };

    display_element.innerHTML = '';
    this.jsPsych.finishTrial(trialData);
  }
}

export default PixiGaborPatchPlugin;
