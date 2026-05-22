# Reading Trainer

Reading Trainer 是一個基於 **TypeScript + PixiJS** 建構的視覺與閱讀能力訓練 Web 應用程式。UI/UX 設計參考了 [FrACT10](https://michaelbach.de/fract/) 的科學化測試介面，使用 Canvas 渲染確保精確的視覺刺激呈現。

## 技術棧

- **TypeScript** — 強型別開發
- **PixiJS v8** — 高效能 2D Canvas 渲染
- **Vite** — 快速開發與建置工具
- **GitHub Pages** — 自動化部署（GitHub Actions）

## 系統架構設計

本系統設計為**模組化擴充架構**（Plugin Pattern），新的訓練模組只需實作 `TrainingModule` 介面並註冊至 `TrainingRegistry` 即可自動出現在訓練清單中。

### 核心架構

```
src/
├── main.ts                    # 應用程式入口
├── core/
│   ├── Globals.ts             # 全域常數
│   ├── SceneManager.ts        # 場景生命週期管理
│   ├── Settings.ts            # 設定持久化（localStorage）
│   └── SoundManager.ts        # 音效回饋
├── scenes/
│   ├── MainMenuScene.ts       # 主選單
│   ├── TrainingListScene.ts   # 訓練清單（自動讀取 Registry）
│   ├── SettingsScene.ts       # 設定與螢幕校正
│   └── PeripheralVisionScene.ts  # 周邊視覺訓練
├── trainings/
│   ├── TrainingModule.ts      # 模組介面定義
│   ├── TrainingRegistry.ts    # 模組註冊中心
│   └── PeripheralVisionModule.ts  # 周邊視覺訓練模組
├── ui/
│   ├── Theme.ts               # 設計 token（暗色主題）
│   ├── Button.ts              # 互動按鈕元件
│   ├── Panel.ts               # 面板容器
│   └── Slider.ts              # 滑桿元件
└── utils/
    ├── SpatialUtils.ts        # 空間轉換（px↔mm↔degree）
    └── MathUtils.ts           # 數學/動畫工具函式
```

### 新增訓練模組

1. 在 `src/scenes/` 新增場景類別（實作 `Scene` 介面）
2. 在 `src/trainings/` 新增模組類別（實作 `TrainingModule` 介面）
3. 在 `src/main.ts` 中 `register()` 新模組

```typescript
// 範例：新增 XxxModule
const xxx = new XxxModule();
xxx.setGoBack(() => sm.goTo('trainingList'));
TrainingRegistry.register(xxx);
``` 

## 訓練模組

### 移動卡片訓練 (Moving Card Training)

動態字母配對遊戲，訓練注視中心點時快速辨識周邊文字的能力。

- **校正機制**：文字大小根據螢幕校正值（塑膠卡片法）動態計算
- **參考資料**：FrACT10 CardController、styts/eye-training

## 評估模組

### 視力評估 (Visual Acuity Assessment)

類似 FrACT10 的視力測驗模組，使用 BestPEST 自適應閾值算法自動調整視標大小以測定視力閾值。

**支援的測驗類型：**

| 測驗 | 選項數 | 預設試驗數 | 說明 |
|------|--------|-----------|------|
| 蘭氏環 (Landolt C) | 8 | 18 | 辨別環形缺口方向，國際標準視力檢測法 |
| 翻轉 E (Tumbling E) | 4 | 24 | 辨別 E 字母開口方向 |
| Sloan 字母 | 10 | 18 | 辨別 CDHKNORSVZ 字母 |
| 圖形視標 | 4 | 24 | 辨別簡易圖形（房子、圓形、正方形、星星） |
| 條紋視力 (PL) | 2 | 36 | Preferential Looking 條紋方向判斷 |

**結果格式：** LogMAR、十進制視力 (decVA)、Snellen fraction、ETDRS Letter Score

**核心演算法：** BestPEST (Maximum-Likelihood Adaptive Threshold Estimation)，移植自 FrACT10 的 `ThresholderPest.j`。

> ⚠️ **免責聲明：** 本測驗參考 FrACT 測驗模式以及演算法，為程式練習所用。若要了解自己視力，請尋求專業醫療協助。

## 開發

```bash
npm install       # 安裝依賴
npm run dev       # 啟動開發伺服器
npm run build     # 建置生產版本
npm run preview   # 預覽生產版本
```

## 部署

推送到 `main` 分支會自動觸發 GitHub Actions 部署至 GitHub Pages。
