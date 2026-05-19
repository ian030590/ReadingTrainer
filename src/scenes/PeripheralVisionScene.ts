/**
 * Peripheral Vision Training Scene.
 * State machine: idle → playing → gameover.
 * Supports different difficulty levels and responsive layout.
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { Scene } from '../core/SceneManager';
import { Theme } from '../ui/Theme';
import { Button } from '../ui/Button';
import { getSetting, saveTrainingRecord } from '../core/Settings';
import { SoundManager } from '../core/SoundManager';
import { shuffleArray, generateRandomLetters, generateScatteredPositions } from '../utils/MathUtils';
import { pixelFromMillimeter } from '../utils/SpatialUtils';

type GameState = 'idle' | 'playing' | 'gameover';

interface GameOption {
  letters: string;
  isCorrect: boolean;
  container: Container;
  // logic positions
  currentX: number;
  currentY: number;
}

interface RoundRecord {
  target: string;
  foundX: number;
  foundY: number;
  timeMs: number;
}

export class PeripheralVisionScene implements Scene {
  readonly container = new Container();
  private goBack: () => void;
  
  // game state
  private gameState: GameState = 'idle';
  private score = 0;
  private currentRound = 0;
  private currentTarget = '';
  private options: GameOption[] = [];
  private records: RoundRecord[] = [];
  private roundStartTime = 0;
  private moveTimerId: ReturnType<typeof setInterval> | null = null;
  private feedbackActive = false;
  
  // layout cache
  private cachedW = 800;
  private cachedH = 600;

  // DOM containers
  private bg = new Graphics();
  private header = new Graphics();
  private headerTitle = new Text();
  private backBtn: Button;
  private scoreText = new Text();
  private roundText = new Text();
  private gameArea = new Container();

  // Sub-states
  private stateIdle = new Container();
  private idleStartBtn: Button;
  private idleHint = new Text();
  
  private statePlaying = new Container();
  private playBorder = new Graphics();
  private playCross = new Graphics();
  private targetText = new Text();
  private optionsLayer = new Container();
  
  private stateGameover = new Container();

  constructor(goBack: () => void) {
    this.goBack = goBack;
    
    this.backBtn = new Button({
      label: '← 返回清單', width: 130, height: 36, fontSize: Theme.fontSizeS, variant: 'ghost',
      onClick: () => { this.stopMoveTimer(); this.goBack(); },
    });

    this.idleStartBtn = new Button({
      label: '開始訓練', width: 220, height: 56, fontSize: Theme.fontSizeXL, variant: 'primary',
      onClick: () => this.startGame(),
    });

    this.initHierarchy();
  }

  private initHierarchy(): void {
    this.container.addChild(this.bg);
    this.container.addChild(this.header);
    this.container.addChild(this.headerTitle);
    this.container.addChild(this.backBtn);
    this.container.addChild(this.scoreText);
    this.container.addChild(this.roundText);
    this.container.addChild(this.gameArea);
    
    this.gameArea.addChild(this.stateIdle);
    this.gameArea.addChild(this.statePlaying);
    this.gameArea.addChild(this.stateGameover);

    this.stateIdle.addChild(this.idleStartBtn);
    this.stateIdle.addChild(this.idleHint);

    this.statePlaying.addChild(this.playBorder);
    this.statePlaying.addChild(this.playCross);
    this.statePlaying.addChild(this.targetText);
    this.statePlaying.addChild(this.optionsLayer);

    this.headerTitle.text = '👁️  周邊視覺訓練';
    this.headerTitle.style = { fontFamily: Theme.fontFamily, fontSize: Theme.fontSizeL, fontWeight: '700', fill: Theme.textPrimary };
    
    this.scoreText.style = { fontFamily: Theme.fontFamily, fontSize: Theme.fontSizeM, fontWeight: '600', fill: Theme.textPrimary };
    this.roundText.style = { fontFamily: Theme.fontFamily, fontSize: Theme.fontSizeM, fill: Theme.textSecondary };
    
    this.idleHint.text = '在中央目標出現後，快速找到周圍相同的字母配對並點擊';
    this.idleHint.style = { fontFamily: Theme.fontFamily, fontSize: Theme.fontSizeM, fill: Theme.textMuted, align: 'center' };
    this.idleHint.anchor.set(0.5, 0);

    this.targetText.style = { fontFamily: Theme.fontFamily, fontWeight: '700', fill: Theme.accent, letterSpacing: 4 };
    this.targetText.anchor.set(0.5);
  }

  onEnter(): void {
    SoundManager.init();
    this.gameState = 'idle';
    this.score = 0;
    this.currentRound = 0;
    this.records = [];
    this.updateScoreboard();
    this.switchState('idle');
  }

  onResize(width: number, height: number): void {
    this.cachedW = width;
    this.cachedH = height;

    this.bg.clear().rect(0, 0, width, height).fill({ color: Theme.bg });
    this.header.clear().rect(0, 0, width, 56).fill({ color: Theme.bgPanel }).rect(0, 55, width, 1).fill({ color: Theme.border });
    
    this.headerTitle.x = Theme.paddingL; this.headerTitle.y = 16;
    this.backBtn.x = width - 150; this.backBtn.y = 10;
    
    this.scoreText.x = Theme.paddingL; this.scoreText.y = 68;
    this.roundText.x = width - 180; this.roundText.y = 68;

    this.gameArea.y = 95;

    const cx = width / 2;
    this.idleStartBtn.x = cx - 110; this.idleStartBtn.y = 100;
    this.idleHint.x = cx; this.idleHint.y = 180;

    // Play border
    const pW = width - 60;
    const pH = height - 95 - 60; // 60 bottom margin
    if (pW > 0 && pH > 0) {
      this.playBorder.clear().roundRect(30, 0, pW, pH, Theme.radiusM).stroke({ color: Theme.border, width: 1 });
    }
    
    this.targetText.x = cx; this.targetText.y = 40;
    this.playCross.clear().moveTo(cx - 8, 80).lineTo(cx + 8, 80).moveTo(cx, 72).lineTo(cx, 88).stroke({ color: Theme.textMuted, width: 2 });
    
    // If playing, we need to reposition current elements to prevent them from going out of bounds
    // However, real-time responsive game repositioning is complex. For now, it's best to restart round if extreme resize happens
    if (this.gameState === 'gameover') {
      this.renderGameOver();
    }
  }

  private switchState(state: GameState): void {
    this.gameState = state;
    this.stateIdle.visible = state === 'idle';
    this.statePlaying.visible = state === 'playing';
    this.stateGameover.visible = state === 'gameover';
  }

  private startGame(): void {
    this.score = 0;
    this.currentRound = 0;
    this.records = [];
    this.switchState('playing');
    this.generateNewRound();
    this.startMoveTimer();
  }

  private generateNewRound(): void {
    if (this.gameState === 'gameover') return;
    this.feedbackActive = false;
    this.currentRound++;
    this.updateScoreboard();
    this.optionsLayer.removeChildren();
    
    this.currentTarget = generateRandomLetters(2);
    const targetSize = pixelFromMillimeter(getSetting('targetPhysicalSizeMm'));
    this.targetText.text = this.currentTarget;
    this.targetText.style.fontSize = Math.max(16, targetSize);
    
    const diff = getSetting('difficulty');
    const optionCount = getSetting('optionCount');
    
    const distractors = new Set<string>();
    while (distractors.size < optionCount - 1) {
      const d = generateRandomLetters(2);
      if (d !== this.currentTarget) distractors.add(d);
    }
    
    const rawOptions: { letters: string; isCorrect: boolean }[] = [{ letters: this.currentTarget, isCorrect: true }];
    distractors.forEach((l) => rawOptions.push({ letters: l, isCorrect: false }));
    shuffleArray(rawOptions);
    
    this.options = [];
    
    const gridX = 40;
    const gridY = 120;
    const gridW = this.cachedW - 80;
    const gridH = this.cachedH - 95 - 60 - 140; // minus margins
    
    const optionFontSize = Math.max(12, pixelFromMillimeter(getSetting('optionPhysicalSizeMm')));
    const cellW = gridW / 5;
    const cellH = gridH / 4;
    const oW = cellW * 0.8;
    const oH = cellH * 0.8;

    let positions: {x: number, y: number}[] = [];

    if (diff === 'beginner') {
      // Grid logic
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 5; c++) {
          positions.push({ x: gridX + c * cellW + cellW * 0.1 + oW/2, y: gridY + r * cellH + cellH * 0.1 + oH/2 });
        }
      }
      shuffleArray(positions);
    } else {
      // Scattered logic
      positions = generateScatteredPositions(
        optionCount, 
        { x: gridX + oW/2, y: gridY + oH/2, w: gridW - oW, h: gridH - oH },
        Math.max(oW, oH) * 1.1 // minimum distance to prevent overlap
      );
    }

    for (let i = 0; i < rawOptions.length; i++) {
      const opt = rawOptions[i];
      if (i >= positions.length) break; // safeguard
      
      const pos = positions[i];
      const optContainer = new Container();
      optContainer.eventMode = 'static';
      optContainer.cursor = 'pointer';

      // To rotate properly, set pivot to center
      optContainer.pivot.set(oW / 2, oH / 2);
      optContainer.x = pos.x;
      optContainer.y = pos.y;
      
      if (diff === 'advanced') {
        optContainer.rotation = (Math.random() - 0.5) * Math.PI * 0.5; // +/- 45 degrees
      }

      const optBg = new Graphics();
      optBg.roundRect(0, 0, oW, oH, Theme.radiusS).fill({ color: Theme.bgCard }).roundRect(0, 0, oW, oH, Theme.radiusS).stroke({ color: Theme.border, width: 1 });
      optContainer.addChild(optBg);

      const optText = new Text({
        text: opt.letters,
        style: { fontFamily: Theme.fontFamily, fontSize: optionFontSize, fontWeight: '600', fill: Theme.textPrimary },
      });
      optText.anchor.set(0.5);
      optText.x = oW / 2; optText.y = oH / 2;
      optContainer.addChild(optText);

      const gameOpt: GameOption = {
        letters: opt.letters,
        isCorrect: opt.isCorrect,
        container: optContainer,
        currentX: pos.x,
        currentY: pos.y,
      };

      optContainer.on('pointerover', () => {
        optBg.clear().roundRect(0, 0, oW, oH, Theme.radiusS).fill({ color: Theme.bgCardHover }).roundRect(0, 0, oW, oH, Theme.radiusS).stroke({ color: Theme.accent, width: 2 });
      });
      optContainer.on('pointerout', () => {
        optBg.clear().roundRect(0, 0, oW, oH, Theme.radiusS).fill({ color: Theme.bgCard }).roundRect(0, 0, oW, oH, Theme.radiusS).stroke({ color: Theme.border, width: 1 });
      });
      optContainer.on('pointertap', () => this.handleOptionClick(gameOpt, optBg, oW, oH));

      this.options.push(gameOpt);
      this.optionsLayer.addChild(optContainer);
    }

    this.roundStartTime = performance.now();
  }

  private handleOptionClick(opt: GameOption, bg: Graphics, w: number, h: number): void {
    if (this.feedbackActive || this.gameState !== 'playing') return;
    this.feedbackActive = true;
    const timeMs = Math.round(performance.now() - this.roundStartTime);

    if (opt.isCorrect) {
      bg.clear().roundRect(0, 0, w, h, Theme.radiusS).fill({ color: 0x1A3D2B }).roundRect(0, 0, w, h, Theme.radiusS).stroke({ color: Theme.success, width: 2 });
      SoundManager.playCorrect();
      this.score += 10;
      
      this.records.push({
        target: this.currentTarget,
        foundX: Math.round(opt.currentX),
        foundY: Math.round(opt.currentY),
        timeMs
      });
      
      this.updateScoreboard();

      const totalRounds = getSetting('totalRounds');
      setTimeout(() => {
        if (this.currentRound >= totalRounds) {
          this.endGame();
        } else {
          this.generateNewRound();
        }
      }, 400);
    } else {
      bg.clear().roundRect(0, 0, w, h, Theme.radiusS).fill({ color: 0x3D1A1A }).roundRect(0, 0, w, h, Theme.radiusS).stroke({ color: Theme.error, width: 2 });
      SoundManager.playIncorrect();

      setTimeout(() => {
        bg.clear().roundRect(0, 0, w, h, Theme.radiusS).fill({ color: Theme.bgCard }).roundRect(0, 0, w, h, Theme.radiusS).stroke({ color: Theme.border, width: 1 });
        this.feedbackActive = false;
      }, 400);
    }
  }

  private startMoveTimer(): void {
    this.stopMoveTimer();
    const interval = getSetting('optionMoveIntervalMs');
    this.moveTimerId = setInterval(() => this.moveRandomOption(), interval);
  }

  private stopMoveTimer(): void {
    if (this.moveTimerId) {
      clearInterval(this.moveTimerId);
      this.moveTimerId = null;
    }
  }

  private moveRandomOption(): void {
    if (this.gameState !== 'playing' || this.options.length === 0) return;
    
    const opt = this.options[Math.floor(Math.random() * this.options.length)];
    const diff = getSetting('difficulty');
    
    const gridX = 40, gridY = 120;
    const gridW = this.cachedW - 80;
    const gridH = this.cachedH - 95 - 60 - 140;
    
    const cellW = gridW / 5;
    const cellH = gridH / 4;
    const oW = cellW * 0.8;
    const oH = cellH * 0.8;
    
    let bestPos = null;

    if (diff === 'beginner') {
      // Find empty grid cells
      const allGridPos: {x: number, y: number}[] = [];
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 5; c++) {
          allGridPos.push({ x: gridX + c * cellW + cellW * 0.1 + oW/2, y: gridY + r * cellH + cellH * 0.1 + oH/2 });
        }
      }
      
      const emptyPos = allGridPos.filter(pos => {
        return !this.options.some(o => Math.abs(o.currentX - pos.x) < 5 && Math.abs(o.currentY - pos.y) < 5);
      });

      if (emptyPos.length > 0) {
        bestPos = emptyPos[Math.floor(Math.random() * emptyPos.length)];
      }
    } else {
      // Scattered: find a random continuous position without overlap
      const minDistSq = Math.pow(Math.max(oW, oH) * 1.1, 2);
      for (let attempt = 0; attempt < 100; attempt++) {
        const px = gridX + oW/2 + Math.random() * (gridW - oW);
        const py = gridY + oH/2 + Math.random() * (gridH - oH);
        
        let overlap = false;
        for (const other of this.options) {
          if (other === opt) continue;
          const dx = px - other.currentX;
          const dy = py - other.currentY;
          if (dx * dx + dy * dy < minDistSq) {
            overlap = true;
            break;
          }
        }
        if (!overlap) {
          bestPos = { x: px, y: py };
          break;
        }
      }
    }

    if (bestPos) {
      opt.currentX = bestPos.x;
      opt.currentY = bestPos.y;
      
      const startX = opt.container.x;
      const startY = opt.container.y;
      const duration = 300;
      const startTime = performance.now();
      
      const animate = () => {
        if (this.gameState !== 'playing') return;
        const elapsed = performance.now() - startTime;
        const t = Math.min(1, elapsed / duration);
        // simple ease out
        const ease = 1 - Math.pow(1 - t, 3);
        opt.container.x = startX + (bestPos.x - startX) * ease;
        opt.container.y = startY + (bestPos.y - startY) * ease;
        
        if (t < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }
  }

  private endGame(): void {
    this.stopMoveTimer();
    this.switchState('gameover');
    SoundManager.playRunEnd();
    this.renderGameOver();
  }

  private renderGameOver(): void {
    this.stateGameover.removeChildren();
    const cx = this.cachedW / 2;

    const resultTitle = new Text({
      text: '訓練結束！',
      style: { fontFamily: Theme.fontFamily, fontSize: Theme.fontSize2XL, fontWeight: '700', fill: Theme.textPrimary },
    });
    resultTitle.anchor.set(0.5);
    resultTitle.x = cx; resultTitle.y = 40;
    this.stateGameover.addChild(resultTitle);

    const scoreDisplay = new Text({
      text: `總分: ${this.score}`,
      style: { fontFamily: Theme.fontFamily, fontSize: 48, fontWeight: '700', fill: Theme.accent },
    });
    scoreDisplay.anchor.set(0.5);
    scoreDisplay.x = cx; scoreDisplay.y = 100;
    this.stateGameover.addChild(scoreDisplay);

    // Dashboard Table
    let tableY = 160;
    const tableW = Math.min(600, this.cachedW - 40);
    const displayRecords = this.records.slice(0, 10);
    const tableH = 40 + displayRecords.length * 30 + (this.records.length > 10 ? 30 : 0) + 10;
    
    // Table Background
    const tableBg = new Graphics();
    tableBg.roundRect(cx - tableW/2, tableY, tableW, tableH, 8).fill({ color: Theme.bgCard }).stroke({ color: Theme.border, width: 1 });
    this.stateGameover.addChild(tableBg);
    
    // Header Row Bg
    tableBg.roundRect(cx - tableW/2, tableY, tableW, 40, 8).fill({ color: Theme.bgPanel });

    const col1 = cx - tableW/2 + 60;
    const col2 = cx;
    const col3 = cx + tableW/2 - 100;

    const tableHeader1 = new Text({ text: '題目', style: { fontFamily: Theme.fontFamily, fontSize: Theme.fontSizeM, fill: Theme.textSecondary, fontWeight: 'bold' } });
    tableHeader1.anchor.set(0.5, 0.5); tableHeader1.x = col1; tableHeader1.y = tableY + 20;
    this.stateGameover.addChild(tableHeader1);

    const tableHeader2 = new Text({ text: '反應時間 (ms)', style: { fontFamily: Theme.fontFamily, fontSize: Theme.fontSizeM, fill: Theme.textSecondary, fontWeight: 'bold' } });
    tableHeader2.anchor.set(0.5, 0.5); tableHeader2.x = col2; tableHeader2.y = tableY + 20;
    this.stateGameover.addChild(tableHeader2);

    const tableHeader3 = new Text({ text: '發現座標 (X, Y)', style: { fontFamily: Theme.fontFamily, fontSize: Theme.fontSizeM, fill: Theme.textSecondary, fontWeight: 'bold' } });
    tableHeader3.anchor.set(0.5, 0.5); tableHeader3.x = col3; tableHeader3.y = tableY + 20;
    this.stateGameover.addChild(tableHeader3);
    
    tableY += 55;
    
    // Rows
    displayRecords.forEach((r, i) => {
      const targetTxt = new Text({ text: r.target, style: { fontFamily: Theme.fontFamily, fontSize: Theme.fontSizeS, fill: Theme.accent, fontWeight: 'bold' } });
      targetTxt.anchor.set(0.5, 0.5); targetTxt.x = col1; targetTxt.y = tableY;
      this.stateGameover.addChild(targetTxt);

      const timeTxt = new Text({ text: `${r.timeMs} ms`, style: { fontFamily: Theme.fontFamily, fontSize: Theme.fontSizeS, fill: Theme.textPrimary } });
      timeTxt.anchor.set(0.5, 0.5); timeTxt.x = col2; timeTxt.y = tableY;
      this.stateGameover.addChild(timeTxt);

      const posTxt = new Text({ text: `(${r.foundX}, ${r.foundY})`, style: { fontFamily: Theme.fontFamily, fontSize: Theme.fontSizeS, fill: Theme.textMuted } });
      posTxt.anchor.set(0.5, 0.5); posTxt.x = col3; posTxt.y = tableY;
      this.stateGameover.addChild(posTxt);
      
      tableY += 30;
    });
    
    if (this.records.length > 10) {
      const extra = new Text({ text: `...以及其他 ${this.records.length - 10} 筆紀錄`, style: { fontFamily: Theme.fontFamily, fontSize: Theme.fontSizeS, fill: Theme.textMuted } });
      extra.anchor.set(0.5, 0.5); extra.x = cx; extra.y = tableY;
      this.stateGameover.addChild(extra);
      tableY += 30;
    }

    tableY += 20;

    // Save Button
    const saveBtn = new Button({
      label: '💾 下載訓練紀錄', width: 200, height: 48, fontSize: Theme.fontSizeL, variant: 'primary',
      onClick: () => this.downloadRecords(),
    });
    saveBtn.x = cx - 210; saveBtn.y = tableY + 20;
    this.stateGameover.addChild(saveBtn);

    const backBtn = new Button({
      label: '返回清單', width: 180, height: 48, fontSize: Theme.fontSizeL, variant: 'secondary',
      onClick: () => this.goBack(),
    });
    backBtn.x = cx + 30; backBtn.y = tableY + 20;
    this.stateGameover.addChild(backBtn);
  }

  private downloadRecords(): void {
    let text = `--- 訓練紀錄 [周邊視覺訓練] ---\n`;
    text += `時間: ${new Date().toLocaleString()}\n`;
    text += `難度: ${getSetting('difficulty')}\n`;
    text += `總分: ${this.score}\n\n`;
    text += `回合\t題目\t反應時間(ms)\t發現座標(X, Y)\n`;
    
    this.records.forEach((r, i) => {
      text += `${i+1}\t${r.target}\t${r.timeMs}\t\t(${r.foundX}, ${r.foundY})\n`;
    });
    text += `\n`;
    
    saveTrainingRecord('周邊視覺訓練', text);

    // To simulate appending, we download ALL records of today.
    const allRecords = getSetting('difficulty'); // dummy use
    const history = window.localStorage.getItem('readingtrainer_history_' + new Date().toISOString().split('T')[0]);
    let finalOutput = '';
    if (history) {
      const parsed = JSON.parse(history) as {formattedText: string}[];
      finalOutput = parsed.map(p => p.formattedText).join('\n\n');
    } else {
      finalOutput = text;
    }

    const blob = new Blob([finalOutput], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `閱讀訓練分數_周邊視覺訓練_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private updateScoreboard(): void {
    const totalRounds = getSetting('totalRounds');
    this.scoreText.text = `分數: ${this.score}`;
    this.roundText.text = `回合: ${this.currentRound} / ${totalRounds}`;
  }

  onUpdate(_dt: number): void { }
  onExit(): void {
    this.stopMoveTimer();
  }
}
