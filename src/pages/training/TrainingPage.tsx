import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useT } from '../../i18n';
import { initJsPsych } from 'jspsych';
import type { JsPsych } from 'jspsych';
import PixiMovingCardPlugin from '../../experiment/plugins/pixi-moving-card';
import PixiOculomotorTrainingPlugin from '../../experiment/plugins/pixi-oculomotor-training';
import ThreeDrivingRehabPlugin from '../../experiment/plugins/three-driving-rehab';
import WebGazerExtension from '@jspsych/extension-webgazer';
import { buildTimeline } from '../../experiment/timeline';
import { getActiveUser, getSetting } from '../../utils/settings';
import { getRandomStory } from './reading/stories';
import {
  getOculomotorModeLabel,
  getOculomotorPatternLabel,
  isOculomotorMode,
  isOculomotorPattern,
} from './oculomotor/presets';
import type { OculomotorTargetShape } from './oculomotor/types';


// Ensure the plugin class is referenced so bundler doesn't tree-shake it
void PixiMovingCardPlugin;
void PixiOculomotorTrainingPlugin;
void ThreeDrivingRehabPlugin;

type Phase = 'running' | 'results';

interface TrialData {
  trial_index: number;
  rt: number;
  correct: boolean;
  target: string;
  response: string;
  mode?: string;
  pattern?: string;
  acquired_targets?: number;
  average_fps?: number;
  duration_ms?: number;
  score?: number;
  trial_type?: string;
  reading_time?: number;
  average_rt?: number;
  median_rt?: number;
  valid_event_count?: number;
  collisions?: number;
  lane_deviations?: number;
  route_progress?: number;
  driving_events?: Array<{
    event_id: string;
    label: string;
    distance_m: number;
    rt_ms: number | null;
    valid: boolean;
    collision: boolean;
    brake_preheld: boolean;
    response: string;
  }>;
}

export function TrainingPage() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const moduleId = searchParams.get('module') || 'moving-card';
  const difficulty = searchParams.get('difficulty') || getSetting('difficulty');
  const totalRounds = parseInt(searchParams.get('rounds') || '', 10) || getSetting('totalRounds');
  const requestedMode = searchParams.get('mode') || getSetting('oculomotorMode');
  const requestedPattern = searchParams.get('pattern') || getSetting('oculomotorPattern');
  const oculomotorMode = isOculomotorMode(requestedMode) ? requestedMode : getSetting('oculomotorMode');
  const oculomotorPattern = isOculomotorPattern(requestedPattern)
    ? requestedPattern
    : getSetting('oculomotorPattern');
  const oculomotorDurationSec = parseInt(searchParams.get('duration') || '', 10)
    || getSetting('oculomotorDurationSec');
  const oculomotorSpeedDegPerSec = parseFloat(searchParams.get('speed') || '')
    || getSetting('oculomotorSpeedDegPerSec');
  const oculomotorTargetSizeMm = parseFloat(searchParams.get('size') || '')
    || getSetting('oculomotorTargetSizeMm');
  const oculomotorDistractorCount = parseInt(searchParams.get('distractors') || '', 10);
  const requestedTargetShape = searchParams.get('shape') || getSetting('oculomotorTargetShape');
  const oculomotorTargetShape = isOculomotorTargetShape(requestedTargetShape)
    ? requestedTargetShape
    : getSetting('oculomotorTargetShape');
  const oculomotorTargetColor = searchParams.get('targetColor') || getSetting('oculomotorTargetColor');
  const oculomotorBackgroundColor = searchParams.get('backgroundColor') || getSetting('oculomotorBackgroundColor');
  const oculomotorCustomTargetImage = getSetting('oculomotorCustomTargetImage');
  const enableWebGazer = getSetting('oculomotorEnableWebgazer');
  const drivingDurationSec = parseInt(searchParams.get('duration') || '', 10)
    || getSetting('drivingDurationSec');
  const requestedDrivingFlash = searchParams.get('redFlash');
  const drivingRedFlashEnabled = requestedDrivingFlash === null
    ? getSetting('drivingRedFlashEnabled')
    : requestedDrivingFlash === 'true';

  const [phase, setPhase] = useState<Phase>('running');
  const [results, setResults] = useState<TrialData[]>([]);
  const jsPsychRef = useRef<JsPsych | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const userName = getActiveUser() || t('exp.unknownUser');

  const diffLabel: Record<string, string> = {
    beginner: t('home.diff.beginner'),
    intermediate: t('home.diff.intermediate'),
    advanced: t('home.diff.advanced'),
  };

  // ── Launch jsPsych immediately (no instructions phase) ──
  useEffect(() => {
    // Only init if not eyegame
    if (moduleId === 'eyegame') return;

    if (phase !== 'running') return;
    if (!containerRef.current) return;
    if (jsPsychRef.current) return; // already initialized

    const container = containerRef.current;

    const setupExperiment = async () => {
      let storyData: any = null;
      if (moduleId === 'reading-training') {
        storyData = getRandomStory(lang) || null;
      }

      const jsPsych = initJsPsych({
        display_element: container,
        extensions: enableWebGazer ? [{ type: WebGazerExtension }] : [],
        on_finish: () => {
          const data = jsPsych.data.get().values() as TrialData[];
          setResults(data);
          jsPsychRef.current = null;
          setPhase('results');
        },
      });

      jsPsychRef.current = jsPsych;

      const timeline = buildTimeline(moduleId, {
        difficulty,
        totalRounds,
        oculomotor: {
          mode: oculomotorMode,
          pattern: oculomotorPattern,
          durationSec: oculomotorDurationSec,
          speedDegPerSec: oculomotorSpeedDegPerSec,
          targetSizeMm: oculomotorTargetSizeMm,
          distractorCount: Number.isFinite(oculomotorDistractorCount)
            ? oculomotorDistractorCount
            : getSetting('oculomotorDistractorCount'),
          targetColor: oculomotorTargetColor,
          backgroundColor: oculomotorBackgroundColor,
          targetShape: oculomotorTargetShape,
          customTargetImage: oculomotorCustomTargetImage,
        },
        gabor: {
          durationSec: parseInt(searchParams.get('duration') || '', 10) || 60,
          maxSpots: parseInt(searchParams.get('maxSpots') || '', 10) || 10,
        },
        reading: {
          story: storyData,
          wps: getSetting('readingWPS'),
          crowding: getSetting('readingCrowding'),
          contrast: getSetting('readingContrast'),
        },
        driving: {
          durationSec: drivingDurationSec,
          redFlashEnabled: drivingRedFlashEnabled,
        },
      });
      jsPsych.run(timeline as any);
    };
    
    setupExperiment();

    // Cleanup on unmount
    return () => {
      if (jsPsychRef.current) {
        jsPsychRef.current = null;
      }
    };
  }, [
    phase,
    moduleId,
    difficulty,
    totalRounds,
    oculomotorMode,
    oculomotorPattern,
    oculomotorDurationSec,
    oculomotorSpeedDegPerSec,
    oculomotorTargetSizeMm,
    oculomotorDistractorCount,
    oculomotorTargetColor,
    oculomotorBackgroundColor,
    oculomotorTargetShape,
    oculomotorCustomTargetImage,
    drivingDurationSec,
    drivingRedFlashEnabled,
  ]);

  const downloadCSV = useCallback(() => {
    if (results.length === 0) return;

    const prefix = getSetting('downloadDirectory');
    const dateStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toLocaleTimeString('zh-TW', { hour12: false }).replace(/:/g, '');

    const isOculomotor = moduleId === 'oculomotor-training';
    const isGabor = moduleId === 'gabor-patch';
    const isReading = moduleId === 'reading-training';
    const isDriving = moduleId === 'driving-rehab';
    let headers: string[];
    if (isOculomotor) {
      headers = [t('exp.csv.user'), t('exp.csv.date'), t('exp.csv.time'), t('exp.csv.module'), t('exp.csv.mode'), t('exp.csv.path'), t('exp.csv.duration'), t('exp.csv.acquired'), t('exp.csv.fps'), t('exp.csv.aoi'), t('exp.csv.status')];
    } else if (isGabor) {
      headers = [t('exp.csv.user'), t('exp.csv.date'), t('exp.csv.time'), t('exp.csv.module'), t('exp.csv.duration'), t('exp.csv.score'), t('exp.csv.acquired')];
    } else if (isReading) {
      headers = [t('exp.csv.user'), t('exp.csv.date'), t('exp.csv.time'), t('exp.csv.module'), 'WPS', 'Crowding', t('exp.csv.target'), t('exp.csv.response'), t('exp.csv.correct'), t('exp.csv.rt')];
    } else if (isDriving) {
      headers = [t('exp.csv.user'), t('exp.csv.date'), t('exp.csv.time'), t('exp.csv.module'), t('exp.csv.event'), t('exp.csv.rt'), t('exp.csv.valid'), t('exp.csv.collision'), t('exp.csv.preBrake'), t('exp.csv.response'), t('exp.csv.laneDeviations'), t('exp.csv.fps')];
    } else {
      headers = [t('exp.csv.user'), t('exp.csv.date'), t('exp.csv.time'), t('exp.csv.module'), t('exp.csv.diff'), t('exp.csv.round'), t('exp.csv.target'), t('exp.csv.response'), t('exp.csv.correct'), t('exp.csv.rt')];
    }
    const rows: (string | number)[][] = isDriving
      ? ((results[0]?.driving_events ?? []).map((event) => [
        userName,
        dateStr,
        timeStr,
        moduleId,
        event.label,
        event.rt_ms ?? '',
        event.valid ? 'true' : 'false',
        event.collision ? 'true' : 'false',
        event.brake_preheld ? 'true' : 'false',
        event.response,
        results[0]?.lane_deviations ?? 0,
        results[0]?.average_fps ?? '',
      ]))
      : results.map((r, i) => {
      const baseRow = [userName, dateStr, timeStr, moduleId];
      if (isOculomotor) {
        return [...baseRow, t(`preset.mode.${r.mode || oculomotorMode}` as any), t(`preset.path.${r.pattern || oculomotorPattern}` as any), r.duration_ms ?? r.rt, r.acquired_targets ?? 0, r.average_fps ?? '', (r as any).aoi_score ?? '-', r.response];
      } else if (isGabor) {
        return [...baseRow, r.duration_ms ?? r.rt, r.score ?? 0, r.acquired_targets ?? 0];
      } else if (isReading) {
        if (r.trial_type === 'html-button-response') {
          return [...baseRow, getSetting('readingWPS'), getSetting('readingCrowding'), r.target, (r as any).response_text || r.response, r.correct ? '✓' : '✗', r.rt];
        }
        return [...baseRow, getSetting('readingWPS'), getSetting('readingCrowding'), 'Reading Phase', '-', '-', r.reading_time || 0];
      } else {
        return [...baseRow, difficulty, i + 1, r.target, r.response, r.correct ? '✓' : '✗', r.rt];
      }
    });

    if (!isOculomotor && !isGabor && !isDriving) {
      const avgRt = Math.round(results.reduce((sum, r) => sum + r.rt, 0) / results.length);
      const correctCount = results.filter((r) => r.correct).length;
      rows.push(['']);
      rows.push([t('exp.avgRt'), `${avgRt} ms`]);
      rows.push([t('exp.correctRate'), `${correctCount}/${results.length}`]);
    } else if (isDriving) {
      rows.push(['']);
      rows.push([t('exp.res.avgRt'), `${results[0]?.average_rt ?? 0} ms`]);
      rows.push([t('exp.res.collisions'), `${results[0]?.collisions ?? 0}`]);
    }

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prefix ? prefix + '_' : ''}${userName}_${moduleId}_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results, userName, moduleId, difficulty, oculomotorMode, oculomotorPattern]);

  const goHome = () => navigate('/');

  // ── Eyegame Module ──
  if (moduleId === 'eyegame') {
    return <EyegameSubPage />;
  }

  // ── Running Phase ──
  if (phase === 'running') {
    return (
      <div key="running" className="experiment-container">
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    );
  }

  // ── Results Phase ──
  const avgRt = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + r.rt, 0) / results.length)
    : 0;
  const correctCount = results.filter((r) => r.correct).length;
  const sortedRts = [...results].map((r) => r.rt).sort((a, b) => a - b);
  const medianRt = sortedRts.length > 0
    ? (sortedRts.length % 2
      ? sortedRts[Math.floor(sortedRts.length / 2)]
      : Math.round((sortedRts[Math.floor(sortedRts.length / 2) - 1] + sortedRts[Math.floor(sortedRts.length / 2)]) / 2))
    : 0;
  const isOculomotor = moduleId === 'oculomotor-training';
  const isReading = moduleId === 'reading-training';
  const isDriving = moduleId === 'driving-rehab';
  const oculomotorResult = results[0];
  const readingQuestions = results.filter((r: any) => r.trial_type === 'html-button-response');
  const readingCorrect = readingQuestions.filter(r => r.correct).length;
  const readingTime = results.find((r: any) => r.trial_type === 'pixi-reading-training')?.reading_time || 0;
  const drivingResult = results[0];
  const drivingEvents = drivingResult?.driving_events ?? [];

  return (
    <div key="results" className="experiment-container" style={{ overflowY: 'auto' }}>
      <div className="experiment-results">
        <h1 style={{ fontSize: 32 }}>{t('exp.done')}</h1>
        {isOculomotor ? (
          <>
            <div className="results-score">
              {Math.round((oculomotorResult?.duration_ms ?? 0) / 1000)}s
            </div>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 24,
              marginBottom: 16,
              fontSize: 14,
              color: 'var(--text-secondary)',
            }}>
              <span>{t('exp.res.mode')} <b style={{ color: 'var(--accent)' }}>{t(`preset.mode.${oculomotorResult?.mode || oculomotorMode}` as any)}</b></span>
              <span>{t('exp.res.path')} <b style={{ color: 'var(--accent)' }}>{t(`preset.path.${oculomotorResult?.pattern || oculomotorPattern}` as any)}</b></span>
              <span>{t('exp.res.acquired')} <b style={{ color: 'var(--accent)' }}>{oculomotorResult?.acquired_targets ?? 0}</b></span>
              <span>{t('exp.res.fps')} <b style={{ color: 'var(--accent)' }}>{oculomotorResult?.average_fps ?? '-'}</b></span>
              {(oculomotorResult as any)?.aoi_score !== undefined && (
                <span>{t('exp.res.aoi')} <b style={{ color: 'var(--accent)' }}>{(oculomotorResult as any).aoi_score}</b></span>
              )}
              <span>{t('exp.res.user')} <b>{userName}</b></span>
            </div>
          </>
        ) : moduleId === 'gabor-patch' ? (
          <>
            <div className="results-score" style={{ color: 'var(--accent)' }}>
              {t('exp.res.score')} {results[0]?.score ?? 0}
            </div>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 24,
              marginBottom: 16,
              fontSize: 14,
              color: 'var(--text-secondary)',
            }}>
              <span>{t('exp.res.acquired')} <b style={{ color: 'var(--accent)' }}>{results[0]?.acquired_targets ?? 0}</b></span>
              <span>{t('home.config.durationLabel')} <b style={{ color: 'var(--accent)' }}>{Math.round((results[0]?.duration_ms ?? 0) / 1000)}s</b></span>
              <span>{t('exp.res.user')} <b>{userName}</b></span>
            </div>
          </>
        ) : isDriving ? (
          <>
            <div className="results-score" style={{ color: 'var(--accent)' }}>
              {drivingResult?.average_rt ?? 0} ms
            </div>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 24,
              marginBottom: 16,
              fontSize: 14,
              color: 'var(--text-secondary)',
            }}>
              <span>{t('exp.res.validEvents')} <b style={{ color: 'var(--accent)' }}>{drivingResult?.valid_event_count ?? 0}</b></span>
              <span>{t('exp.res.collisions')} <b style={{ color: 'var(--accent)' }}>{drivingResult?.collisions ?? 0}</b></span>
              <span>{t('exp.res.laneDeviations')} <b style={{ color: 'var(--accent)' }}>{drivingResult?.lane_deviations ?? 0}</b></span>
              <span>{t('exp.res.fps')} <b style={{ color: 'var(--accent)' }}>{drivingResult?.average_fps ?? '-'}</b></span>
              <span>{t('exp.res.user')} <b>{userName}</b></span>
            </div>

            <table className="results-table" style={{ maxWidth: 920 }}>
              <thead>
                <tr>
                  <th>{t('exp.res.thEvent')}</th>
                  <th>{t('exp.res.thRt')}</th>
                  <th>{t('exp.res.thValid')}</th>
                  <th>{t('exp.res.thCollision')}</th>
                  <th>{t('exp.res.thResp')}</th>
                </tr>
              </thead>
              <tbody>
                {drivingEvents.map((event, i) => (
                  <tr key={`${event.event_id}-${i}`}>
                    <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{event.label}</td>
                    <td>{event.rt_ms ?? '-'}</td>
                    <td style={{ color: event.valid ? 'var(--success)' : 'var(--warning)' }}>
                      {event.valid ? '✓' : '排除'}
                    </td>
                    <td style={{ color: event.collision ? 'var(--error)' : 'var(--success)' }}>
                      {event.collision ? '是' : '否'}
                    </td>
                    <td>{event.response}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : isReading ? (
          <>
            <div className="results-score">{readingCorrect}/{readingQuestions.length}</div>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 24,
              marginBottom: 16,
              fontSize: 14,
              color: 'var(--text-secondary)',
            }}>
              <span>{t('exp.res.user')} <b>{userName}</b></span>
              <span>WPS: <b style={{ color: 'var(--accent)' }}>{getSetting('readingWPS')}</b></span>
              <span>Crowding: <b style={{ color: 'var(--accent)' }}>{getSetting('readingCrowding')}</b></span>
              <span>Total Time: <b style={{ color: 'var(--accent)' }}>{Math.round(readingTime / 100) / 10} s</b></span>
            </div>
            
            <table className="results-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('exp.res.thTarget')}</th>
                  <th>{t('exp.res.thResp')}</th>
                  <th>{t('exp.res.thCorrect')}</th>
                </tr>
              </thead>
              <tbody>
                {readingQuestions.map((r: any, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{r.target}</td>
                    <td>{r.response_text}</td>
                    <td style={{ color: r.correct ? 'var(--success)' : 'var(--error)' }}>
                      {r.correct ? '✓' : '✗'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <>
            <div className="results-score">{correctCount}/{results.length}</div>
            <div style={{
              display: 'flex',
              gap: 32,
              marginBottom: 16,
              fontSize: 14,
              color: 'var(--text-secondary)',
            }}>
              <span>{t('exp.res.avgRt')} <b style={{ color: 'var(--accent)' }}>{avgRt} ms</b></span>
              <span>{t('exp.res.medRt')} <b style={{ color: 'var(--accent)' }}>{medianRt} ms</b></span>
              <span>{t('exp.res.user')} <b>{userName}</b></span>
            </div>

            <table className="results-table">
              <thead>
                <tr>
                  <th>{t('exp.res.thRound')}</th>
                  <th>{t('exp.res.thTarget')}</th>
                  <th>{t('exp.res.thResp')}</th>
                  <th>{t('exp.res.thCorrect')}</th>
                  <th>{t('exp.res.thRt')}</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{r.target}</td>
                    <td>{r.response}</td>
                    <td style={{ color: r.correct ? 'var(--success)' : 'var(--error)' }}>
                      {r.correct ? '✓' : '✗'}
                    </td>
                    <td className={r.rt < avgRt ? 'rt-fast' : r.rt > avgRt * 1.5 ? 'rt-slow' : ''}>
                      {r.rt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="results-actions">
          <button className="btn btn-primary btn-lg" onClick={downloadCSV}>
            {t('exp.downloadCsv')}
          </button>
          <button className="btn btn-secondary btn-lg" onClick={goHome}>
            {t('exp.backHome')}
          </button>
        </div>
      </div>
    </div>
  );
}

function isOculomotorTargetShape(value: string): value is OculomotorTargetShape {
  return ['circle', 'star', 'square', 'cross', 'triangle', 'custom'].includes(value);
}

function EyegameSubPage() {
  const navigate = useNavigate();
  const { t } = useT();

  // Load eyegame assets on mount
  useEffect(() => {
    const baseUrl = import.meta.env.BASE_URL;
    const cssFiles = [
      `${baseUrl}eyegame/eyes/res/eyegame.css`,
      `${baseUrl}eyegame/eyes/res/chrome.css`,
    ];
    const links: HTMLLinkElement[] = [];
    cssFiles.forEach((href) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
      links.push(link);
    });

    const script = document.createElement('script');
    script.src = `${baseUrl}eyegame/eyes/res/eyegame.js`;
    script.async = true;
    document.body.appendChild(script);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        navigate('/');
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      links.forEach((l) => l.remove());
      script.remove();
    };
  }, []);

  return (
    <div className="eyegame-container" style={{ width: '100%', height: '100vh' }}>
      <div className="game-over">{t('eyegame.gameOver')}</div>
      <div className="start">{t('eyegame.clickToBegin')}</div>
      <div className="game-hud">
        <div className="timer">500</div>
        <div className="score">0</div>
      </div>
    </div>
  );
}
