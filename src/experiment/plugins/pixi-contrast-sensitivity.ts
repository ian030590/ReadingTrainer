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
      default: [
        'ArrowRight', 'ArrowUpRight', 'ArrowUp', 'ArrowUpLeft', 
        'ArrowLeft', 'ArrowDownLeft', 'ArrowDown', 'ArrowDownRight',
        '7', '9', '1', '3', '8', '2', '4', '6',
        'Home', 'PageUp', 'End', 'PageDown'
      ],
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

      const isGrating = trial.optotype === 'grating';
      const size = isGrating ? Math.max(this.app!.screen.width, this.app!.screen.height) * 1.5 : (trial.stroke_px || 10) * 10;
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
      const k = key.toLowerCase();
      const isUp = k === 'arrowup' || k === 'arrowdown' || k === '8' || k === '2';
      const isRight = k === 'arrowright' || k === 'arrowleft' || k === '4' || k === '6';
      const isUpRight = k === 'arrowupright' || k === 'arrowdownleft' || k === '9' || k === '1' || k === 'pageup' || k === 'end';
      const isDownRight = k === 'arrowdownright' || k === 'arrowupleft' || k === '3' || k === '7' || k === 'pagedown' || k === 'home';
      
      let userDirection = -1;
      if (isUp) userDirection = 0;
      else if (isUpRight) userDirection = 2;
      else if (isRight) userDirection = 4;
      else if (isDownRight) userDirection = 6;
      
      isCorrect = (userDirection === trial.direction);
    }
    
    if (trial.optotype === 'landolt') {
      const isUpRight = key === 'ArrowUpRight' || key === '9' || key === 'PageUp';
      const isUpLeft = key === 'ArrowUpLeft' || key === '7' || key === 'Home';
      const isDownRight = key === 'ArrowDownRight' || key === '3' || key === 'PageDown';
      const isDownLeft = key === 'ArrowDownLeft' || key === '1' || key === 'End';
      const isUp = key === 'ArrowUp' || key === '8';
      const isDown = key === 'ArrowDown' || key === '2';
      const isLeft = key === 'ArrowLeft' || key === '4';
      const isRight = key === 'ArrowRight' || key === '6';
      
      let userDirection = -1;
      if (isRight) userDirection = 0;
      else if (isUpRight) userDirection = 1;
      else if (isUp) userDirection = 2;
      else if (isUpLeft) userDirection = 3;
      else if (isLeft) userDirection = 4;
      else if (isDownLeft) userDirection = 5;
      else if (isDown) userDirection = 6;
      else if (isDownRight) userDirection = 7;
      
      isCorrect = (userDirection === trial.direction);
    } else if (trial.optotype === 'tumblingE') {
      const isUp = key === 'ArrowUp' || key === '8';
      const isDown = key === 'ArrowDown' || key === '2';
      const isLeft = key === 'ArrowLeft' || key === '4';
      const isRight = key === 'ArrowRight' || key === '6';
      
      let userDirection = -1;
      if (isRight) userDirection = 0;
      else if (isUp) userDirection = 2;
      else if (isLeft) userDirection = 4;
      else if (isDown) userDirection = 6;
      
      isCorrect = (userDirection === trial.direction);
    }

    this.jsPsych.finishTrial({
      rt,
      response: key,
      correct: isCorrect,
    });
  }
}

export default PixiContrastSensitivityPlugin;
