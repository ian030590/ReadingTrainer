import { useState, useCallback, useEffect } from 'react';
import { useT } from '../i18n';
import { useNavigate } from 'react-router-dom';
import {
  getUsers,
  addUser,
  removeUser,
  getActiveUser,
  setActiveUser,
  getSetting,
  setSetting,
  isCalibrated,
} from '../utils/settings';
import { pixiAppManager } from '../utils/pixiPool';
import { SoundManager } from '../utils/soundManager';
import {
  oculomotorModes,
  oculomotorPatterns,
} from './training/oculomotor/presets';
import type { OculomotorMode, OculomotorPattern, OculomotorTargetShape } from './training/oculomotor/types';

export function HomePage() {
  const { t } = useT();
  const navigate = useNavigate();
  const [users, setUsersState] = useState(getUsers);
  const [activeUser, setActiveUserState] = useState(getActiveUser);
  const [newName, setNewName] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);

  // ── Module expansion state ──
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [localDifficulty, setLocalDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>(
    () => getSetting('difficulty'),
  );
  const [localRounds, setLocalRounds] = useState<number>(() => getSetting('totalRounds'));
  const [customRoundsInput, setCustomRoundsInput] = useState('');
  const [oculomotorMode, setOculomotorMode] = useState<OculomotorMode>(
    () => getSetting('oculomotorMode'),
  );
  const [oculomotorPattern, setOculomotorPattern] = useState<OculomotorPattern>(
    () => getSetting('oculomotorPattern'),
  );
  const [oculomotorDurationSec, setOculomotorDurationSec] = useState(
    () => getSetting('oculomotorDurationSec'),
  );
  const [oculomotorSpeedDegPerSec, setOculomotorSpeedDegPerSec] = useState(
    () => getSetting('oculomotorSpeedDegPerSec'),
  );
  const [oculomotorTargetSizeMm, setOculomotorTargetSizeMm] = useState(
    () => getSetting('oculomotorTargetSizeMm'),
  );
  const [oculomotorDistractorCount, setOculomotorDistractorCount] = useState(
    () => getSetting('oculomotorDistractorCount'),
  );
  const [oculomotorTargetColor, setOculomotorTargetColor] = useState(
    () => getSetting('oculomotorTargetColor'),
  );
  const [oculomotorBackgroundColor, setOculomotorBackgroundColor] = useState(
    () => getSetting('oculomotorBackgroundColor'),
  );
  const [oculomotorTargetShape, setOculomotorTargetShape] = useState<OculomotorTargetShape>(
    () => getSetting('oculomotorTargetShape'),
  );
  const [oculomotorCustomTargetImage, setOculomotorCustomTargetImage] = useState(
    () => getSetting('oculomotorCustomTargetImage'),
  );
  const [oculomotorTargetOpacity, setOculomotorTargetOpacity] = useState(
    () => getSetting('oculomotorTargetOpacity'),
  );
  const [oculomotorBackgroundImage, setOculomotorBackgroundImage] = useState(
    () => getSetting('oculomotorBackgroundImage'),
  );
  const [oculomotorAudio, setOculomotorAudio] = useState(
    () => getSetting('oculomotorAudio'),
  );
  const [oculomotorBounceJitter, setOculomotorBounceJitter] = useState(
    () => getSetting('oculomotorBounceJitter'),
  );
  const [oculomotorEnableWebgazer, setOculomotorEnableWebgazer] = useState(
    () => getSetting('oculomotorEnableWebgazer'),
  );
  const [gaborDurationSec, setGaborDurationSec] = useState(60);
  const [gaborMaxSpots, setGaborMaxSpots] = useState(10);
  const [readingWPS, setReadingWPS] = useState(() => getSetting('readingWPS'));
  const [readingCrowding, setReadingCrowding] = useState(() => getSetting('readingCrowding'));
  const [readingContrast, setReadingContrast] = useState(() => getSetting('readingContrast'));
  const [drivingDurationSec, setDrivingDurationSec] = useState(() => getSetting('drivingDurationSec'));
  const [drivingRedFlashEnabled, setDrivingRedFlashEnabled] = useState(() => getSetting('drivingRedFlashEnabled'));
  const [drivingDifficulty, setDrivingDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>(() => getSetting('drivingDifficulty'));
  const [prewarmed, setPrewarmed] = useState(() => pixiAppManager.ready);

  const refreshUsers = useCallback(() => {
    setUsersState(getUsers());
    setActiveUserState(getActiveUser());
  }, []);

  const handleSelectUser = (name: string) => {
    setActiveUser(name || null);
    setActiveUserState(name || null);
  };

  const handleAddUser = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    addUser(trimmed);
    setActiveUser(trimmed);
    setNewName('');
    setShowAddUser(false);
    refreshUsers();
  };

  const handleRemoveUser = (name: string) => {
    if (confirm(t('home.deleteUserPrompt', { name }))) {
      removeUser(name);
      refreshUsers();
    }
  };

  // ── Warm up PixiJS when module panel expands ──
  useEffect(() => {
    if (!expandedModule) return;
    if (expandedModule === 'driving-rehab') {
      setPrewarmed(false);
      let cancelled = false;
      import('three')
        .then(() => {
          if (!cancelled) setPrewarmed(true);
        })
        .catch(() => {
          if (!cancelled) setPrewarmed(false);
        });
      return () => { cancelled = true; };
    }
    if (pixiAppManager.ready) {
      setPrewarmed(true);
      return;
    }
    setPrewarmed(false);
    let cancelled = false;
    pixiAppManager.warmUp().then(() => {
      if (!cancelled) setPrewarmed(true);
    });
    return () => { cancelled = true; };
  }, [expandedModule]);


  // ── Persist settings when changed ──
  useEffect(() => {
    setSetting('difficulty', localDifficulty);
  }, [localDifficulty]);

  useEffect(() => {
    setSetting('totalRounds', localRounds);
  }, [localRounds]);

  useEffect(() => {
    setSetting('oculomotorMode', oculomotorMode);
  }, [oculomotorMode]);

  useEffect(() => {
    setSetting('oculomotorPattern', oculomotorPattern);
  }, [oculomotorPattern]);

  useEffect(() => {
    setSetting('oculomotorDurationSec', oculomotorDurationSec);
  }, [oculomotorDurationSec]);

  useEffect(() => {
    setSetting('oculomotorSpeedDegPerSec', oculomotorSpeedDegPerSec);
  }, [oculomotorSpeedDegPerSec]);

  useEffect(() => {
    setSetting('oculomotorTargetSizeMm', oculomotorTargetSizeMm);
  }, [oculomotorTargetSizeMm]);

  useEffect(() => {
    setSetting('oculomotorDistractorCount', oculomotorDistractorCount);
  }, [oculomotorDistractorCount]);

  useEffect(() => {
    setSetting('oculomotorTargetColor', oculomotorTargetColor);
  }, [oculomotorTargetColor]);

  useEffect(() => {
    setSetting('oculomotorBackgroundColor', oculomotorBackgroundColor);
  }, [oculomotorBackgroundColor]);

  useEffect(() => {
    setSetting('oculomotorTargetShape', oculomotorTargetShape);
  }, [oculomotorTargetShape]);

  useEffect(() => {
    setSetting('oculomotorCustomTargetImage', oculomotorCustomTargetImage);
  }, [oculomotorCustomTargetImage]);

  useEffect(() => {
    setSetting('oculomotorTargetOpacity', oculomotorTargetOpacity);
  }, [oculomotorTargetOpacity]);

  useEffect(() => {
    setSetting('oculomotorBackgroundImage', oculomotorBackgroundImage);
  }, [oculomotorBackgroundImage]);

  useEffect(() => {
    setSetting('oculomotorAudio', oculomotorAudio);
  }, [oculomotorAudio]);

  useEffect(() => {
    setSetting('oculomotorBounceJitter', oculomotorBounceJitter);
  }, [oculomotorBounceJitter]);

  useEffect(() => {
    setSetting('oculomotorEnableWebgazer', oculomotorEnableWebgazer);
  }, [oculomotorEnableWebgazer]);

  useEffect(() => {
    setSetting('readingWPS', readingWPS);
  }, [readingWPS]);

  useEffect(() => {
    setSetting('readingCrowding', readingCrowding);
  }, [readingCrowding]);

  useEffect(() => {
    setSetting('readingContrast', readingContrast);
  }, [readingContrast]);

  useEffect(() => {
    setSetting('drivingDurationSec', drivingDurationSec);
  }, [drivingDurationSec]);

  useEffect(() => {
    setSetting('drivingRedFlashEnabled', drivingRedFlashEnabled);
  }, [drivingRedFlashEnabled]);

  useEffect(() => {
    setSetting('drivingDifficulty', drivingDifficulty);
  }, [drivingDifficulty]);


  // ── Handlers ──
  const handleCardClick = (moduleId: string) => {
    if (!activeUser) {
      alert(t('home.pleaseSelectUser'));
      return;
    }
    setExpandedModule(expandedModule === moduleId ? null : moduleId);
  };

  const handleStartTraining = () => {
    if (!expandedModule || !activeUser) return;
    SoundManager.init();
    const params = new URLSearchParams({
      module: expandedModule,
      difficulty: localDifficulty,
      rounds: String(localRounds),
    });

    if (expandedModule === 'oculomotor-training') {
      params.set('mode', oculomotorMode);
      params.set('pattern', oculomotorPattern);
      params.set('duration', String(oculomotorDurationSec));
      params.set('speed', String(oculomotorSpeedDegPerSec));
      params.set('size', String(oculomotorTargetSizeMm));
      params.set('distractors', String(oculomotorDistractorCount));
      params.set('targetColor', oculomotorTargetColor);
      params.set('backgroundColor', oculomotorBackgroundColor);
      params.set('shape', oculomotorTargetShape);
    }

    if (expandedModule === 'gabor-patching') {
      navigate(`/training?module=gabor-patching&duration=${gaborDurationSec}&difficulty=${localDifficulty}&maxSpots=${gaborMaxSpots}`);
      return;
    }

    if (expandedModule === 'moving-card') {
      navigate(`/training?module=moving-card&difficulty=${localDifficulty}`);
      return;
    }

    if (expandedModule === 'reading-training') {
      navigate('/training?module=reading-training');
      return;
    }

    if (expandedModule === 'driving-rehab') {
      navigate(`/training?module=driving-rehab&duration=${drivingDurationSec}&redFlash=${drivingRedFlashEnabled}&drivingDifficulty=${drivingDifficulty}`);
      return;
    }

    navigate(`/training?${params.toString()}`);
  };

  const handleRoundsPreset = (rounds: number) => {
    setLocalRounds(rounds);
    setCustomRoundsInput('');
  };

  const handleCustomRoundsChange = (val: string) => {
    setCustomRoundsInput(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= 1 && num <= 100) {
      setLocalRounds(num);
    }
  };

  const handleCustomTargetImageChange = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert(t('home.pleaseSelectImage'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setOculomotorCustomTargetImage(reader.result);
        setOculomotorTargetShape('custom');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleBackgroundImageChange = (file: File | undefined) => {
    if (!file) {
      setOculomotorBackgroundImage('');
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert(t('home.pleaseSelectImage'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setOculomotorBackgroundImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAudioChange = (file: File | undefined) => {
    if (!file) {
      setOculomotorAudio('');
      return;
    }
    if (!file.type.startsWith('audio/')) {
      alert(t('home.pleaseSelectAudio')); // We will define this key later or just use english/chinese hardcoded if missing, but let's assume it'll be defined
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setOculomotorAudio(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const calibrated = isCalibrated();
  const roundsPresets = [3, 5, 10, 15];
  const durationPresets = [30, 60, 90, 120];
  const targetShapeOptions: { key: OculomotorTargetShape; label: string }[] = [
    { key: 'circle', label: t('home.shape.circle') },
    { key: 'star', label: t('home.shape.star') },
    { key: 'square', label: t('home.shape.square') },
    { key: 'cross', label: t('home.shape.cross') },
    { key: 'triangle', label: t('home.shape.triangle') },
    { key: 'custom', label: t('home.shape.custom') },
  ];
  const diffOptions: { key: 'beginner' | 'intermediate' | 'advanced'; label: string; desc: string }[] = [
    { key: 'beginner', label: t('home.diff.beginner'), desc: t('home.diff.beginnerDesc') },
    { key: 'intermediate', label: t('home.diff.intermediate'), desc: t('home.diff.intermediateDesc') },
    { key: 'advanced', label: t('home.diff.advanced'), desc: t('home.diff.advancedDesc') },
  ];
  const gaborDiffOptions: { key: 'beginner' | 'intermediate' | 'advanced'; label: string; desc: string }[] = [
    { key: 'beginner', label: t('home.diff.beginner'), desc: t('home.diff.gaborBeginnerDesc' as any) },
    { key: 'intermediate', label: t('home.diff.intermediate'), desc: t('home.diff.gaborIntermediateDesc' as any) },
    { key: 'advanced', label: t('home.diff.advanced'), desc: t('home.diff.gaborAdvancedDesc' as any) },
  ];

  return (
    <div className="page-content">
      {/* ── User Selector ── */}
      <div className="user-selector">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <select
          value={activeUser || ''}
          onChange={(e) => handleSelectUser(e.target.value)}
        >
          <option value="">{t('home.selectUser')}</option>
          {users.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAddUser(!showAddUser)}>
          {showAddUser ? t('btn.cancel') : t('btn.add')}
        </button>
        {activeUser && (
          <button className="btn btn-danger btn-sm" onClick={() => handleRemoveUser(activeUser)}>
            {t('btn.delete')}
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen?.();
            } else {
              document.exitFullscreen?.();
            }
          }}
          title={t('home.toggleFullscreen')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
            <path d="M3 16v3a2 2 0 0 0 2 2h3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
          </svg>
        </button>
      </div>

      {/* ── Add User Form ── */}
      {showAddUser && (
        <div className="user-selector fade-in" style={{ marginTop: -16 }}>
          <input
            className="input"
            type="text"
            placeholder={t('home.enterUserName')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddUser()}
            autoFocus
          />
          <button className="btn btn-primary btn-sm" onClick={handleAddUser}>
            {t('btn.confirmAdd')}
          </button>
        </div>
      )}

      {/* ── Calibration Notice ── */}
      {!calibrated && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 24,
          padding: '10px 16px',
          background: 'rgba(210, 153, 34, 0.1)',
          border: '1px solid var(--warning)',
          borderRadius: 'var(--radius-m)',
          fontSize: 13,
          color: 'var(--warning)',
          maxWidth: 700,
          width: '100%',
        }}>
          {t('home.calWarning')}
        </div>
      )}

      {/* ── Section Title ── */}
      <h1 className="section-title fade-in-up">{t('home.listTitle')}</h1>
      <p className="section-subtitle fade-in-up">{t('home.listSubtitle')}</p>

      {/* ── Training Cards ── */}
      <div className="training-grid">
        <div
          className={`card fade-in-up ${expandedModule === 'moving-card' ? 'card-active' : ''}`}
          onClick={() => handleCardClick('moving-card')}
        >
          <div className="card-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <div className="card-title">{t('home.module.movingCard.title')}</div>
          <div className="card-desc">
            {t('home.module.movingCard.desc')}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 16,
            fontSize: 13,
            color: 'var(--accent)',
            fontWeight: 600,
          }}>
            {expandedModule === 'moving-card' ? t('btn.collapseSettings') : t('btn.selectModule')}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              style={{
                transform: expandedModule === 'moving-card' ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.3s ease',
              }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>

        <div
          className={`card fade-in-up ${expandedModule === 'oculomotor-training' ? 'card-active' : ''}`}
          onClick={() => handleCardClick('oculomotor-training')}
        >
          <div className="card-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="2.5" />
              <path d="M12 3a9 9 0 0 1 9 9" />
              <path d="M21 12a9 9 0 0 1-9 9" />
              <path d="M12 21a9 9 0 0 1-9-9" />
              <path d="M3 12a9 9 0 0 1 9-9" />
              <path d="M12 7v2" />
              <path d="M17 12h-2" />
              <path d="M12 17v-2" />
              <path d="M7 12h2" />
            </svg>
          </div>
          <div className="card-title">{t('home.module.oculomotor.title')}</div>
          <div className="card-desc">
            {t('home.module.oculomotor.desc')}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 16,
            fontSize: 13,
            color: 'var(--accent)',
            fontWeight: 600,
          }}>
            {expandedModule === 'oculomotor-training' ? t('btn.collapseSettings') : t('btn.selectModule')}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              style={{
                transform: expandedModule === 'oculomotor-training' ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.3s ease',
              }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>

        <div
          className={`card fade-in-up ${expandedModule === 'gabor-patching' ? 'card-active' : ''}`}
          onClick={() => handleCardClick('gabor-patching')}
        >
          <div className="card-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12a4 4 0 0 1 8 0" />
              <path d="M12 8v8" />
            </svg>
          </div>
          <div className="card-title">{t('home.module.gaborPatching.title')}</div>
          <div className="card-desc">
            {t('home.module.gaborPatching.desc')}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 16,
            fontSize: 13,
            color: 'var(--accent)',
            fontWeight: 600,
          }}>
            {expandedModule === 'gabor-patching' ? t('btn.collapseSettings') : t('btn.selectModule')}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              style={{
                transform: expandedModule === 'gabor-patching' ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.3s ease',
              }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>

        <div
          className={`card fade-in-up ${expandedModule === 'reading-training' ? 'card-active' : ''}`}
          onClick={() => handleCardClick('reading-training')}
        >
          <div className="card-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
            </svg>
          </div>
          <div className="card-title">{t('home.module.reading.title')}</div>
          <div className="card-desc">
            {t('home.module.reading.desc')}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 16,
            fontSize: 13,
            color: 'var(--accent)',
            fontWeight: 600,
          }}>
            {expandedModule === 'reading-training' ? t('btn.collapseSettings') : t('btn.selectModule')}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              style={{
                transform: expandedModule === 'reading-training' ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.3s ease',
              }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>

        <div
          className={`card fade-in-up ${expandedModule === 'driving-rehab' ? 'card-active' : ''}`}
          onClick={() => handleCardClick('driving-rehab')}
        >
          <div className="card-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 13h18l-2 6H5l-2-6Z" />
              <path d="M6 13l2-5h8l2 5" />
              <circle cx="7.5" cy="19" r="1.5" />
              <circle cx="16.5" cy="19" r="1.5" />
              <path d="M10 4h4" />
            </svg>
          </div>
          <div className="card-title">{t('home.module.driving.title')}</div>
          <div className="card-desc">
            {t('home.module.driving.desc')}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 16,
            fontSize: 13,
            color: 'var(--accent)',
            fontWeight: 600,
          }}>
            {expandedModule === 'driving-rehab' ? t('btn.collapseSettings') : t('btn.selectModule')}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              style={{
                transform: expandedModule === 'driving-rehab' ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.3s ease',
              }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
      </div>

      {/* ── Module Config Panel ── */}
      {expandedModule === 'moving-card' && (
        <div className="config-modal-overlay fade-in" onClick={() => setExpandedModule(null)}>
          <div className="module-config-panel config-modal-panel" onClick={(e) => e.stopPropagation()}>
            {/* Difficulty */}
            <div className="config-section">
              <div className="config-label">{t('home.config.difficulty')}</div>
              <div className="difficulty-selector">
                {diffOptions.map((opt) => (
                  <button
                    key={opt.key}
                    className={`diff-btn ${localDifficulty === opt.key ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setLocalDifficulty(opt.key); }}
                  >
                    <span className="diff-btn-label">{opt.label}</span>
                    <span className="diff-btn-desc">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Rounds */}
            <div className="config-section">
              <div className="config-label">{t('home.config.rounds')}</div>
              <div className="rounds-selector">
                {roundsPresets.map((r) => (
                  <button
                    key={r}
                    className={`rounds-btn ${localRounds === r && !customRoundsInput ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); handleRoundsPreset(r); }}
                  >
                    {r}
                  </button>
                ))}
                <input
                  className="rounds-custom-input"
                  type="number"
                  min="1"
                  max="100"
                  placeholder={t('home.config.custom')}
                  value={customRoundsInput}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => handleCustomRoundsChange(e.target.value)}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="config-actions">
              <button
                className="btn btn-primary btn-lg config-start-btn"
                onClick={(e) => { e.stopPropagation(); handleStartTraining(); }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                {t('btn.startTraining')}
                {prewarmed && <span className="ready-dot" />}
              </button>
              <button
                className="btn btn-ghost btn-lg"
                onClick={(e) => { e.stopPropagation(); setExpandedModule(null); }}
              >
                {t('btn.cancel')}
              </button>
            </div>

            {/* Current settings summary */}
            <div className="config-summary">
              {t('home.config.user')} <strong>{activeUser}</strong> ·{' '}
              {t('home.config.diffLabel')} <strong>{diffOptions.find((d) => d.key === localDifficulty)?.label}</strong> ·{' '}
              {t('home.config.roundsLabel')} <strong>{localRounds}</strong>
            </div>
          </div>
        </div>
      )}

      {expandedModule === 'oculomotor-training' && (
        <div className="config-modal-overlay fade-in" onClick={() => setExpandedModule(null)}>
          <div className="module-config-panel config-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="config-section">
              <div className="config-label">{t('home.config.trainingMode')}</div>
              <div className="difficulty-selector">
                {oculomotorModes.map((mode) => (
                  <button
                    key={mode.id}
                    className={`diff-btn ${oculomotorMode === mode.id ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOculomotorMode(mode.id);
                    }}
                  >
                    <span className="diff-btn-label">{t(`preset.mode.${mode.id}` as any)}</span>
                    <span className="diff-btn-desc">{t(`preset.mode.${mode.id}Desc` as any)}</span>
                  </button>
                ))}
              </div>
            </div>

            {oculomotorMode !== 'lilac-chaser' && (
              <div className="config-section">
                <div className="config-label">{t('home.config.movementPath')}</div>
                <select
                  className="input"
                  value={oculomotorPattern}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setOculomotorPattern(e.target.value as OculomotorPattern)}
                >
                  {oculomotorPatterns.map((pattern) => (
                    <option key={pattern.id} value={pattern.id}>{t(`preset.path.${pattern.id}` as any)}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="config-section">
              <div className="config-label">{t('home.config.durationSec')}</div>
              <div className="rounds-selector">
                {durationPresets.map((duration) => (
                  <button
                    key={duration}
                    className={`rounds-btn ${oculomotorDurationSec === duration ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOculomotorDurationSec(duration);
                    }}
                  >
                    {duration}
                  </button>
                ))}
                <input
                  className="rounds-custom-input"
                  type="number"
                  min="15"
                  max="300"
                  value={oculomotorDurationSec}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (Number.isFinite(value)) {
                      setOculomotorDurationSec(Math.max(15, Math.min(300, value)));
                    }
                  }}
                />
              </div>
            </div>

            <div className="config-section">
              <div className="config-label">{t('home.config.speedAndSize')}</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, justifyContent: 'center' }}>
                {[1, 2, 4, 8].map(mult => (
                  <button
                    key={mult}
                    className="btn btn-secondary btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOculomotorSpeedDegPerSec(Math.min(80, oculomotorSpeedDegPerSec * mult));
                    }}
                  >
                    {mult}x
                  </button>
                ))}
              </div>
              <div className="difficulty-selector">
                <label className="diff-btn" style={{ cursor: 'default', alignItems: 'stretch' }}>
                  <span className="diff-btn-desc">{t('home.config.speed')}</span>
                  <input
                    className="rounds-custom-input"
                    type="number"
                    min="2"
                    max="80"
                    value={oculomotorSpeedDegPerSec}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (Number.isFinite(value)) {
                        setOculomotorSpeedDegPerSec(Math.max(2, Math.min(80, value)));
                      }
                    }}
                    style={{ width: '100%' }}
                  />
                </label>
                <label className="diff-btn" style={{ cursor: 'default', alignItems: 'stretch' }}>
                  <span className="diff-btn-desc">{t('home.config.size')}</span>
                  <input
                    className="rounds-custom-input"
                    type="number"
                    min="2"
                    max="100"
                    value={oculomotorTargetSizeMm}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (Number.isFinite(value)) {
                        setOculomotorTargetSizeMm(Math.max(2, Math.min(100, value)));
                      }
                    }}
                    style={{ width: '100%' }}
                  />
                </label>
                <label className="diff-btn" style={{ cursor: 'default', alignItems: 'stretch' }}>
                  <span className="diff-btn-desc">{t('home.config.distractors')}</span>
                  <input
                    className="rounds-custom-input"
                    type="number"
                    min="0"
                    max="12"
                    value={oculomotorDistractorCount}
                    disabled={oculomotorMode !== 'multi-object'}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10);
                      if (Number.isFinite(value)) {
                        setOculomotorDistractorCount(Math.max(0, Math.min(12, value)));
                      }
                    }}
                    style={{ width: '100%', opacity: oculomotorMode === 'multi-object' ? 1 : 0.5 }}
                  />
                </label>
              </div>
            </div>

            <div className="config-section">
              <div className="config-label">{t('home.config.colors')}</div>
              <div className="color-settings-row">
                <label className="color-field">
                  <span>{t('home.config.targetColor')}</span>
                  <input
                    type="color"
                    value={oculomotorTargetColor}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setOculomotorTargetColor(e.target.value)}
                  />
                </label>
                <label className="color-field">
                  <span>{t('home.config.bgColor')}</span>
                  <input
                    type="color"
                    value={oculomotorBackgroundColor}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setOculomotorBackgroundColor(e.target.value)}
                  />
                </label>
                <label className="color-field" style={{ flex: 2 }}>
                  <span>{t('home.config.opacity')} ({oculomotorTargetOpacity})</span>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    value={oculomotorTargetOpacity}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setOculomotorTargetOpacity(parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </label>
              </div>
            </div>
            
            <div className="config-section">
              <div className="config-label">{t('home.config.advancedConfig')}</div>
              <div className="color-settings-row">
                <label className="color-field" style={{ flex: 1 }}>
                  <span>{t('home.config.bgImage')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleBackgroundImageChange(e.target.files?.[0])}
                    style={{ fontSize: 12, width: '100%' }}
                  />
                  {oculomotorBackgroundImage && (
                    <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setOculomotorBackgroundImage(''); }}>
                      {t('btn.delete')}
                    </button>
                  )}
                </label>
                <label className="color-field" style={{ flex: 1 }}>
                  <span>{t('home.config.audio')}</span>
                  <input
                    type="file"
                    accept="audio/*"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleAudioChange(e.target.files?.[0])}
                    style={{ fontSize: 12, width: '100%' }}
                  />
                  {oculomotorAudio && (
                    <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setOculomotorAudio(''); }}>
                      {t('btn.delete')}
                    </button>
                  )}
                </label>
              </div>
              <div className="color-settings-row" style={{ marginTop: 16 }}>
                <label className="color-field" style={{ flex: 1 }}>
                  <span>{t('home.config.bounceJitter')} ({oculomotorBounceJitter})</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={oculomotorBounceJitter}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setOculomotorBounceJitter(parseInt(e.target.value, 10))}
                    style={{ width: '100%' }}
                  />
                </label>
              </div>
            </div>

            <div className="config-section">
              <div className="config-label">{t('settings.train.wgToggle')}</div>
              <label className="diff-btn" style={{ cursor: 'pointer', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="diff-btn-label">{t('settings.train.wgToggle')}</span>
                  <span className="diff-btn-desc" style={{ fontSize: '0.85em' }}>{t('settings.train.wgDesc')}</span>
                </div>
                <input
                  type="checkbox"
                  checked={oculomotorEnableWebgazer}
                  onChange={(e) => setOculomotorEnableWebgazer(e.target.checked)}
                  style={{ transform: 'scale(1.5)', cursor: 'pointer' }}
                />
              </label>
            </div>

            <div className="config-section">
              <div className="config-label">{t('home.config.targetShape')}</div>
              <div className="shape-selector">
                {targetShapeOptions.map((shape) => (
                  <button
                    key={shape.key}
                    className={`shape-btn ${oculomotorTargetShape === shape.key ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOculomotorTargetShape(shape.key);
                    }}
                  >
                    {shape.label}
                  </button>
                ))}
              </div>
              {oculomotorTargetShape === 'custom' && (
                <div className="custom-image-field">
                  <input
                    className="input"
                    type="file"
                    accept="image/*"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleCustomTargetImageChange(e.target.files?.[0])}
                  />
                  {oculomotorCustomTargetImage && (
                    <div className="custom-image-preview">
                      <img src={oculomotorCustomTargetImage} alt={t('home.config.customTargetPreview')} />
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOculomotorCustomTargetImage('');
                        }}
                      >
                        {t('btn.removeImage')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="config-actions">
              <button
                className="btn btn-primary btn-lg config-start-btn"
                onClick={(e) => { e.stopPropagation(); handleStartTraining(); }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                {t('btn.startTraining')}
                {prewarmed && <span className="ready-dot" />}
              </button>
              <button
                className="btn btn-ghost btn-lg"
                onClick={(e) => { e.stopPropagation(); setExpandedModule(null); }}
              >
                {t('btn.cancel')}
              </button>
            </div>

            <div className="config-summary">
              {t('home.config.user')} <strong>{activeUser}</strong> ·{' '}
              {t('home.config.modeLabel')} <strong>{t(`preset.mode.${oculomotorModes.find((mode) => mode.id === oculomotorMode)?.id}` as any)}</strong> ·{' '}
              {t('home.config.durationLabel')} <strong>{oculomotorDurationSec}s</strong>
            </div>
          </div>
        </div>
      )}

      {expandedModule === 'gabor-patching' && (
        <div className="config-modal-overlay fade-in" onClick={() => setExpandedModule(null)}>
          <div className="module-config-panel config-modal-panel" onClick={(e) => e.stopPropagation()}>
            {/* Difficulty */}
            <div className="config-section">
              <div className="config-label">{t('home.config.difficulty')}</div>
              <div className="difficulty-selector">
                {gaborDiffOptions.map((opt) => (
                  <button
                    key={opt.key}
                    className={`diff-btn ${localDifficulty === opt.key ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setLocalDifficulty(opt.key); }}
                  >
                    <span className="diff-btn-label">{opt.label}</span>
                    <span className="diff-btn-desc">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div className="config-section">
              <div className="config-label">{t('home.config.gaborDuration')}</div>
              <div className="rounds-selector">
                {durationPresets.map((duration) => (
                  <button
                    key={duration}
                    className={`rounds-btn ${gaborDurationSec === duration ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setGaborDurationSec(duration);
                    }}
                  >
                    {duration}s
                  </button>
                ))}
                <input
                  className="rounds-custom-input"
                  type="number"
                  min="15"
                  max="300"
                  value={gaborDurationSec}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (Number.isFinite(value)) {
                      setGaborDurationSec(Math.max(15, Math.min(300, value)));
                    }
                  }}
                />
              </div>
            </div>

            {/* Max Spots */}
            <div className="config-section">
              <div className="config-label">{t('home.config.gaborMaxSpots')}</div>
              <div className="difficulty-selector">
                <input
                  className="rounds-custom-input"
                  type="number"
                  min="3"
                  max="50"
                  value={gaborMaxSpots}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (Number.isFinite(value)) {
                      setGaborMaxSpots(Math.max(3, Math.min(50, value)));
                    }
                  }}
                  style={{ width: '100%', maxWidth: 200 }}
                />
              </div>
            </div>

            <div className="config-actions">
              <button
                className="btn btn-primary btn-lg config-start-btn"
                onClick={(e) => { e.stopPropagation(); handleStartTraining(); }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                {t('btn.startTraining')}
                {prewarmed && <span className="ready-dot" />}
              </button>
              <button
                className="btn btn-ghost btn-lg"
                onClick={(e) => { e.stopPropagation(); setExpandedModule(null); }}
              >
                {t('btn.cancel')}
              </button>
            </div>

            <div className="config-summary">
              {t('home.config.user')} <strong>{activeUser}</strong> ·{' '}
              {t('home.config.diffLabel')} <strong>{gaborDiffOptions.find((d) => d.key === localDifficulty)?.label}</strong> ·{' '}
              {t('home.config.durationLabel')} <strong>{gaborDurationSec}s</strong> ·{' '}
              {t('home.config.gaborMaxSpots')} <strong>{gaborMaxSpots}</strong>
            </div>
          </div>
        </div>
      )}

      {expandedModule === 'reading-training' && (
        <div className="config-modal-overlay fade-in" onClick={() => setExpandedModule(null)}>
          <div className="module-config-panel config-modal-panel" onClick={(e) => e.stopPropagation()}>

            <div className="config-section">
              <div className="config-label">閱讀設定</div>
              <div className="difficulty-selector">
                <label className="diff-btn" style={{ cursor: 'default', alignItems: 'stretch' }}>
                  <span className="diff-btn-desc">閱讀速度 (WPS)</span>
                  <input
                    className="rounds-custom-input"
                    type="number"
                    min="1"
                    max="20"
                    value={readingWPS}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10);
                      if (Number.isFinite(value)) setReadingWPS(Math.max(1, Math.min(20, value)));
                    }}
                    style={{ width: '100%' }}
                  />
                </label>
                <label className="diff-btn" style={{ cursor: 'default', alignItems: 'stretch' }}>
                  <span className="diff-btn-desc">單次字數 (Crowding)</span>
                  <input
                    className="rounds-custom-input"
                    type="number"
                    min="1"
                    max="5"
                    value={readingCrowding}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10);
                      if (Number.isFinite(value)) setReadingCrowding(Math.max(1, Math.min(5, value)));
                    }}
                    style={{ width: '100%' }}
                  />
                </label>
                <label className="diff-btn" style={{ cursor: 'default', alignItems: 'stretch' }}>
                  <span className="diff-btn-desc">對比度 (logCS)</span>
                  <input
                    type="range"
                    min="0.0"
                    max="2.0"
                    step="0.1"
                    value={readingContrast}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setReadingContrast(parseFloat(e.target.value))}
                    style={{ width: '100%', marginTop: 'auto' }}
                  />
                  <div style={{ textAlign: 'center', fontSize: 12 }}>{readingContrast.toFixed(1)}</div>
                </label>
              </div>
            </div>

            <div className="config-actions">
              <button
                className="btn btn-primary btn-lg config-start-btn"
                onClick={(e) => { e.stopPropagation(); handleStartTraining(); }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                {t('btn.startTraining')}
                {prewarmed && <span className="ready-dot" />}
              </button>
              <button
                className="btn btn-ghost btn-lg"
                onClick={(e) => { e.stopPropagation(); setExpandedModule(null); }}
              >
                {t('btn.cancel')}
              </button>
            </div>

            <div className="config-summary">
              {t('home.config.user')} <strong>{activeUser}</strong> ·{' '}
              故事 <strong>隨機抽選</strong>
            </div>
          </div>
        </div>
      )}

      {expandedModule === 'driving-rehab' && (
        <div className="config-modal-overlay fade-in" onClick={() => setExpandedModule(null)}>
          <div className="module-config-panel config-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="config-section">
              <div className="config-label">{t('home.config.drivingMission')}</div>
              <div className="color-settings-row">
                <div className="color-field"><span>{t('home.config.drivingRoute')}</span><strong style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-tertiary)' }}>{t('home.config.drivingRouteDesc')}</strong></div>
                <div className="color-field"><span>{t('home.config.drivingEvents')}</span><strong style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-tertiary)' }}>{t('home.config.drivingEventsDesc')}</strong></div>
              </div>
            </div>

            <div className="config-section">
              <div className="config-label">事件反應難度</div>
              <div className="difficulty-selector">
                {(['beginner', 'intermediate', 'advanced'] as const).map((level) => {
                  const labels: Record<string, string> = { beginner: '初級', intermediate: '中級', advanced: '高級' };
                  const descs: Record<string, string> = { beginner: '反應窗口 5.2 秒', intermediate: '反應窗口 3.2 秒', advanced: '反應窗口 1.8 秒' };
                  return (
                    <button
                      key={level}
                      className={`diff-btn ${drivingDifficulty === level ? 'active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); setDrivingDifficulty(level); }}
                    >
                      <span className="diff-btn-label">{labels[level]}</span>
                      <span className="diff-btn-desc">{descs[level]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="config-section">
              <div className="config-label">{t('home.config.drivingDuration')}</div>
              <div className="rounds-selector">
                {durationPresets.map((duration) => (
                  <button
                    key={duration}
                    className={`rounds-btn ${drivingDurationSec === duration ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDrivingDurationSec(duration);
                    }}
                  >
                    {duration}s
                  </button>
                ))}
                <input
                  className="rounds-custom-input"
                  type="number"
                  min="30"
                  max="300"
                  value={drivingDurationSec}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (Number.isFinite(value)) {
                      setDrivingDurationSec(Math.max(30, Math.min(300, value)));
                    }
                  }}
                />
              </div>
            </div>

            <div className="config-section">
              <div className="config-label">{t('home.config.drivingAssist')}</div>
              <label className="diff-btn" style={{ cursor: 'pointer', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="diff-btn-label">{t('home.config.drivingRedFlash')}</span>
                  <span className="diff-btn-desc">{t('home.config.drivingRedFlashDesc')}</span>
                </div>
                <input
                  type="checkbox"
                  checked={drivingRedFlashEnabled}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDrivingRedFlashEnabled(e.target.checked)}
                  style={{ transform: 'scale(1.5)', cursor: 'pointer' }}
                />
              </label>
            </div>

            <div className="config-section">
              <div className="config-label">{t('home.config.drivingControls')}</div>
              <div className="color-settings-row">
                <div className="color-field"><span>{t('home.config.drivingSteer')}</span><strong>← / →</strong></div>
                <div className="color-field"><span>{t('home.config.drivingThrottle')}</span><strong>↑</strong></div>
                <div className="color-field"><span>{t('home.config.drivingBrake')}</span><strong>↓</strong></div>
                <div className="color-field"><span>{t('home.config.drivingWheel')}</span><strong>Gamepad API</strong></div>
              </div>
            </div>

            <div className="config-actions">
              <button
                className="btn btn-primary btn-lg config-start-btn"
                onClick={(e) => { e.stopPropagation(); handleStartTraining(); }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                {t('btn.startTraining')}
                {prewarmed && <span className="ready-dot" />}
              </button>
              <button
                className="btn btn-ghost btn-lg"
                onClick={(e) => { e.stopPropagation(); setExpandedModule(null); }}
              >
                {t('btn.cancel')}
              </button>
            </div>

            <div className="config-summary">
              {t('home.config.user')} <strong>{activeUser}</strong> ·{' '}
              {t('home.config.durationLabel')} <strong>{drivingDurationSec}s</strong> ·{' '}
              難度 <strong>{drivingDifficulty === 'beginner' ? '初級' : drivingDifficulty === 'intermediate' ? '中級' : '高級'}</strong> ·{' '}
              {t('home.config.drivingRedFlash')} <strong>{drivingRedFlashEnabled ? t('common.on') : t('common.off')}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
