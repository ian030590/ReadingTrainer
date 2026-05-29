import { JsPsych, ParameterType } from 'jspsych';
import type { JsPsychPlugin, TrialType } from 'jspsych';
import { Application, Sprite, Texture, Graphics } from 'pixi.js';
import { pixiAppManager } from '../../utils/pixiPool';
import { drawLandoltC, drawTumblingE, drawContrastGrating } from '../../pages/assessment/logic/optotypeRenderer';
import type { LandoltDirection, EDirection } from '../../pages/assessment/logic/optotypeRenderer';

const info = {
  name: 'pixi-contrast-sensitivity',
  version: '1.0.0',
  parameters: {
    optotype: {
      type: ParameterType.STRING,
      default: 'landolt',
    },
    direction: {
      type: ParameterType.INT,
      default: 0,
    },
    stroke_px: {
      type: ParameterType.INT,
      default: 10,
    },
    contrast: {
      type: ParameterType.FLOAT,
      default: 1.0,
    },
    fore_color: {
      type: ParameterType.STRING,
      default: '#000000',
    },
    back_color: {
      type: ParameterType.STRING,
      default: '#808080',
    },
    fixation_duration_ms: {
      type: ParameterType.INT,
      default: 500,
    },
    choices: {
      type: ParameterType.KEYS,
      default: ['ArrowRight', 'ArrowUpRight', 'ArrowUp', 'ArrowUpLeft', 'ArrowLeft', 'ArrowDownLeft', 'ArrowDown', 'ArrowDownRight'],
    },
  },
  data: {
    rt: { type: ParameterType.INT },
    correct: { type: ParameterType.BOOL },
    response: { type: ParameterType.STRING },
  },
} as const;

type Info = typeof info;

class PixiContrastSensitivityPlugin implements JsPsychPlugin<Info> {
  static info = info;
  private app: Application | null = null;
  private keyboardListener: any;

  constructor(private jsPsych: JsPsych) {}

  trial(display_element: HTMLElement, trial: TrialType<Info>, on_load: () => void) {
    this.app = pixiAppManager.getApp();
    if (!this.app) {
      console.error('Pixi App not initialized');
      this.jsPsych.finishTrial();
      return;
    }

    display_element.innerHTML = '';
    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    display_element.appendChild(container);
    pixiAppManager.attachTo(container);
    pixiAppManager.clearStage();
    this.app.renderer.background.color = trial.back_color!;

    const cx = this.app.screen.width / 2;
    const cy = this.app.screen.height / 2;

    const cross = new Graphics();
    cross.setStrokeStyle({ width: 2, color: 0x000000 });
    cross.moveTo(cx - 10, cy);
    cross.lineTo(cx + 10, cy);
    cross.moveTo(cx, cy - 10);
    cross.lineTo(cx, cy + 10);
    this.app.stage.addChild(cross);

    on_load();

    this.jsPsych.pluginAPI.setTimeout(() => {
      cross.destroy();

      const size = (trial.stroke_px || 10) * 10;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      
      ctx.fillStyle = trial.back_color!;
      ctx.fillRect(0, 0, size, size);

      if (trial.optotype === 'landolt') {
        drawLandoltC(ctx, size / 2, size / 2, trial.stroke_px!, trial.direction as LandoltDirection, trial.fore_color!, trial.back_color!);
      } else if (trial.optotype === 'tumblingE') {
        drawTumblingE(ctx, size / 2, size / 2, trial.stroke_px!, trial.direction as EDirection, trial.fore_color!);
      } else if (trial.optotype === 'grating') {
        drawContrastGrating(ctx, size / 2, size / 2, size, trial.direction!, trial.contrast!, trial.back_color!);
      }
      
      const texture = Texture.from(canvas);
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.x = cx;
      sprite.y = cy;
      this.app!.stage.addChild(sprite);

      this.keyboardListener = this.jsPsych.pluginAPI.getKeyboardResponse({
        callback_function: (info: any) => {
          this.endTrial(info.rt, info.key, trial, sprite);
        },
        valid_responses: trial.choices,
        rt_method: 'performance',
        persist: false,
        allow_held_key: false,
      });

    }, trial.fixation_duration_ms!);
  }

  private endTrial(rt: number, key: string, trial: TrialType<Info>, sprite: Sprite) {
    if (this.keyboardListener) {
      this.jsPsych.pluginAPI.cancelKeyboardResponse(this.keyboardListener);
    }
    sprite.destroy();
    pixiAppManager.clearStage();
    pixiAppManager.detachCanvas();

    let isCorrect = false;
    let expectedKey = '';
    if (trial.optotype === 'landolt') {
      const keys = ['ArrowRight', 'ArrowUpRight', 'ArrowUp', 'ArrowUpLeft', 'ArrowLeft', 'ArrowDownLeft', 'ArrowDown', 'ArrowDownRight'];
      expectedKey = keys[trial.direction!];
    } else if (trial.optotype === 'tumblingE') {
      const keys = ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown'];
      expectedKey = keys[trial.direction! / 2];
    } else if (trial.optotype === 'grating') {
      const isUp = key === 'ArrowUp' || key === 'ArrowDown';
      const isRight = key === 'ArrowRight' || key === 'ArrowLeft';
      const isUpRight = key === 'ArrowUpRight' || key === 'ArrowDownLeft';
      const isDownRight = key === 'ArrowDownRight' || key === 'ArrowUpLeft';
      
      let userDirection = -1;
      if (isUp) userDirection = 0;
      else if (isUpRight) userDirection = 2;
      else if (isRight) userDirection = 4;
      else if (isDownRight) userDirection = 6;
      
      isCorrect = (userDirection === trial.direction);
    }
    
    if (trial.optotype !== 'grating') {
      isCorrect = (key.toLowerCase() === expectedKey.toLowerCase());
    }

    this.jsPsych.finishTrial({
      rt,
      response: key,
      correct: isCorrect,
    });
  }
}

export default PixiContrastSensitivityPlugin;
