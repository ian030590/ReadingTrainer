import React, { useState } from 'react';
import {
  getSetting,
  setSetting,
  isCalibrated,
  getMMPerPixel,
  CAL_BAR_LENGTH_PX,
  CARD_WIDTH_MM,
  CARD_HEIGHT_MM,
} from '../utils/settings';
import { pixelFromMillimeter } from '../utils/spatialUtils';

type Tab = 'general' | 'calibration' | 'gamma' | 'crowding';

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const tabs: { label: string; tab: Tab }[] = [
    { label: '一般設定', tab: 'general' },
    { label: '螢幕校正', tab: 'calibration' },
    { label: 'Gamma', tab: 'gamma' },
    { label: 'Crowding', tab: 'crowding' },
  ];

  return (
    <div className="page-content">
      <h1 className="section-title fade-in-up">設定與校正</h1>
      <p className="section-subtitle fade-in-up">調整訓練參數與螢幕校正</p>

      <div className="settings-container">
        {/* Tabs */}
        <div className="settings-tabs">
          {tabs.map((t) => (
            <button
              key={t.tab}
              className={`settings-tab ${activeTab === t.tab ? 'active' : ''}`}
              onClick={() => setActiveTab(t.tab)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'general' && <GeneralTab refresh={refresh} />}
        {activeTab === 'calibration' && <CalibrationTab refresh={refresh} />}
        {activeTab === 'gamma' && <GammaTab refresh={refresh} />}
        {activeTab === 'crowding' && <CrowdingTab refresh={refresh} />}
      </div>
    </div>
  );
}

/* ── General Tab ── */
function GeneralTab({ refresh }: { refresh: () => void }) {
  return (
    <div className="fade-in">
      {/* Viewing Distance */}
      <SettingRow
        title="觀看距離"
        desc="受試者眼睛至螢幕的距離（公分）"
        value={`${getSetting('distanceInCM')} cm`}
        onEdit={(val) => {
          const num = parseInt(val, 10);
          if (!isNaN(num) && num >= 10 && num <= 500) {
            setSetting('distanceInCM', num);
            refresh();
          }
        }}
        editPlaceholder="60"
      />



      {/* Sound Toggle */}
      <div className="setting-row">
        <div className="setting-info">
          <h3>音效回饋</h3>
          <p>訓練時的正確/錯誤音效</p>
        </div>
        <button
          className={`btn btn-sm ${getSetting('auditoryFeedbackEnabled') ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => {
            setSetting('auditoryFeedbackEnabled', !getSetting('auditoryFeedbackEnabled'));
            refresh();
          }}
        >
          {getSetting('auditoryFeedbackEnabled') ? '✓ 已開啟' : '✗ 已關閉'}
        </button>
      </div>

      {/* Download Prefix */}
      <SettingRow
        title="成績檔案前綴"
        desc="匯出成績時的檔案識別碼"
        value={getSetting('downloadDirectory') || '(未設定)'}
        onEdit={(val) => {
          setSetting('downloadDirectory', val);
          refresh();
        }}
        editPlaceholder="輸入前綴"
      />
    </div>
  );
}

/* ── Calibration Tab ── */
function CalibrationTab({ refresh }: { refresh: () => void }) {
  const [calMode, setCalMode] = useState<'ruler' | 'card'>('ruler');
  const calibrated = isCalibrated();
  const mmPerPx = getMMPerPixel();

  return (
    <div className="fade-in">
      {/* Mode Switch */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button
          className={`btn btn-sm ${calMode === 'ruler' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setCalMode('ruler')}
        >
          尺規校正
        </button>
        <button
          className={`btn btn-sm ${calMode === 'card' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setCalMode('card')}
        >
          卡片校正
        </button>
      </div>

      {calMode === 'ruler' ? (
        <RulerCalibration refresh={refresh} />
      ) : (
        <CardCalibration refresh={refresh} />
      )}

      {/* Info */}
      <div className="cal-info" style={{ color: calibrated ? 'var(--success)' : 'var(--warning)' }}>
        <p>解析度: {mmPerPx.toFixed(3)} mm/px ({(1 / mmPerPx).toFixed(2)} px/mm)</p>
        <p style={{ fontWeight: 600, marginTop: 4 }}>
          {calibrated ? '✓ 校正完成' : '⚠ 尚未校正（使用預設值）'}
        </p>
      </div>
    </div>
  );
}

function RulerCalibration({ refresh }: { refresh: () => void }) {
  const [inputVal, setInputVal] = useState('');
  const rulerBarPx = 500;

  const handleApply = () => {
    const val = parseFloat(inputVal);
    if (!isNaN(val) && val > 0 && val <= 10000) {
      setSetting('rulerLengthInMM', val);
      const pxPerMM = rulerBarPx / val;
      const newCalBarMM = CAL_BAR_LENGTH_PX / pxPerMM;
      setSetting('calBarLengthInMM', newCalBarMM);
      refresh();
    }
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.8 }}>
        請拿出一把實體尺放在螢幕上，與下方的藍色線條對齊。<br />
        然後輸入藍色線條的實際長度(mm)。
      </p>
      <div className="cal-ruler-bar" style={{ width: rulerBarPx }} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
        <input
          className="input"
          style={{ width: 160 }}
          type="number"
          placeholder="藍線長度 (mm)"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleApply()}
        />
        <button className="btn btn-primary btn-sm" onClick={handleApply}>確認校正</button>
      </div>
    </div>
  );
}

function CardCalibration({ refresh }: { refresh: () => void }) {
  const wPx = pixelFromMillimeter(CARD_WIDTH_MM);
  const hPx = pixelFromMillimeter(CARD_HEIGHT_MM);
  const factors = [1.1, 1.01, 1.0 / 1.01, 1.0 / 1.1];
  const labels = ['− −', '−', '+', '+ +'];

  const handleAdjust = (factor: number) => {
    const current = getSetting('calBarLengthInMM');
    setSetting('calBarLengthInMM', current * factor);
    refresh();
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.8 }}>
        請拿出一張標準塑膠卡片（身分證、信用卡或健保卡），<br />
        輕靠在螢幕上，使用下方按鈕調整至大小完全一致。
      </p>
      <div
        className="cal-card-outline"
        style={{ width: wPx, height: hPx }}
      >
        <span style={{
          position: 'absolute', bottom: -24, left: '50%', transform: 'translateX(-50%)',
          fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap',
        }}>
          {CARD_WIDTH_MM}mm × {CARD_HEIGHT_MM}mm
        </span>
      </div>
      <div className="cal-controls" style={{ marginTop: 36 }}>
        {labels.map((label, i) => (
          <button
            key={label}
            className="btn btn-secondary btn-sm"
            onClick={() => handleAdjust(factors[i])}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        className="btn btn-danger btn-sm"
        style={{ marginTop: 16 }}
        onClick={() => { setSetting('calBarLengthInMM', 149); refresh(); }}
      >
        重設校正值
      </button>
    </div>
  );
}

/* ── Gamma Tab ── */
function GammaTab({ refresh }: { refresh: () => void }) {
  const gammaVal = getSetting('gammaValue');
  const deltas = [
    { label: '− 0.1', delta: -0.1 },
    { label: '− 0.01', delta: -0.01 },
    { label: '+ 0.01', delta: 0.01 },
    { label: '+ 0.1', delta: 0.1 },
  ];

  // Calculate gamma-corrected gray
  const gray50 = Math.pow(0.5, 1.0 / gammaVal);
  const grayHex = Math.round(gray50 * 255).toString(16).padStart(2, '0');
  const grayColor = `#${grayHex}${grayHex}${grayHex}`;

  return (
    <div className="fade-in" style={{ textAlign: 'center' }}>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.8 }}>
        調整 Gamma 值直到中央棋盤圖案與周圍灰色完全融合。<br />預設值 2.0。
      </p>

      <div style={{
        width: 300,
        height: 300,
        background: grayColor,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-m)',
      }}>
        <GammaCheckerboard gammaVal={gammaVal} size={100} />
      </div>

      <div style={{ marginTop: 20, fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
        Gamma: {gammaVal.toFixed(2)}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
        {deltas.map((b) => (
          <button
            key={b.label}
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const nv = Math.round((gammaVal + b.delta) * 100) / 100;
              if (nv >= 0.8 && nv <= 4.0) {
                setSetting('gammaValue', nv);
                refresh();
              }
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function GammaCheckerboard({ gammaVal, size }: { gammaVal: number; size: number }) {
  const cellSize = 4;
  const gPlus = Math.pow(0.05, 1.0 / gammaVal);
  const gMinus = Math.pow(0.95, 1.0 / gammaVal);

  const toHex = (v: number) => {
    const h = Math.round(v * 255).toString(16).padStart(2, '0');
    return `#${h}${h}${h}`;
  };

  const darkColor = toHex(gPlus);
  const lightColor = toHex(gMinus);

  // Use an inline SVG pattern for the checkerboard
  const cells: React.ReactElement[] = [];
  for (let y = 0; y < size; y += cellSize) {
    for (let x = 0; x < size; x += cellSize) {
      const isEven = ((x / cellSize + y / cellSize) % 2) === 0;
      cells.push(
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width={cellSize}
          height={cellSize}
          fill={isEven ? darkColor : lightColor}
        />
      );
    }
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {cells}
    </svg>
  );
}

/* ── Crowding Tab ── */
function CrowdingTab({ refresh }: { refresh: () => void }) {
  const crowdTypes = ['無', '兩側橫棒', '包圍方框', '包圍圓圈', '相鄰字符', '兩側字符', '完整包圍'];
  const distTypes = ['2.6 bar-widths (DIN)', '1 個字符', '0.5 個字符', '緊貼'];

  return (
    <div className="fade-in">
      <div className="setting-row">
        <div className="setting-info">
          <h3>擠壓類型</h3>
          <p>影響周邊字符對目標的干擾程度</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="setting-value" style={{ fontSize: 14 }}>
            {crowdTypes[getSetting('crowdingType')]}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setSetting('crowdingType', ((getSetting('crowdingType') + 1) % 7) as number);
              refresh();
            }}
          >
            切換
          </button>
        </div>
      </div>

      <div className="setting-row">
        <div className="setting-info">
          <h3>擠壓間距</h3>
          <p>控制干擾字符與目標的距離</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="setting-value" style={{ fontSize: 14 }}>
            {distTypes[getSetting('crowdingDistanceType')]}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setSetting('crowdingDistanceType', ((getSetting('crowdingDistanceType') + 1) % 4) as number);
              refresh();
            }}
          >
            切換
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Reusable Setting Row with Edit ── */
function SettingRow({
  title,
  desc,
  value,
  onEdit,
  editPlaceholder,
}: {
  title: string;
  desc: string;
  value: string;
  onEdit: (val: string) => void;
  editPlaceholder: string;
}) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');

  const handleStartEdit = () => {
    setInputVal('');
    setEditing(true);
  };

  const handleConfirm = () => {
    onEdit(inputVal);
    setEditing(false);
  };

  return (
    <div className="setting-row">
      <div className="setting-info">
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
      {editing ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            style={{ width: 120 }}
            placeholder={editPlaceholder}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
              if (e.key === 'Escape') setEditing(false);
            }}
            autoFocus
          />
          <button className="btn btn-primary btn-sm" onClick={handleConfirm}>確認</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>取消</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="setting-value">{value}</span>
          <button className="btn btn-ghost btn-sm" onClick={handleStartEdit}>✎ 編輯</button>
        </div>
      )}
    </div>
  );
}
