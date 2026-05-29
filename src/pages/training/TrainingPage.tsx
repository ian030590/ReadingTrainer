import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { initJsPsych } from 'jspsych';
import type { JsPsych } from 'jspsych';
import WebGazerExtension from '@jspsych/extension-webgazer';
import { useT } from '../../i18n';
import { buildTimeline } from '../../experiment/timeline';
import PixiMovingCardPlugin from '../../experiment/plugins/pixi-moving-card';
import PixiOculomotorTrainingPlugin from '../../experiment/plugins/pixi-oculomotor-training';
import ThreeDrivingRehabPlugin from '../../experiment/plugins/three-driving-rehab';
import { getActiveUser, getSetting } from '../../utils/settings';
import { downloadTrainingCsv } from './exportCsv';
import {
  isOculomotorMode,
  isOculomotorPattern,
} from './oculomotor/presets';
import type { OculomotorTargetShape } from './oculomotor/types';
import { getRandomStory } from './reading/stories';
import { TrainingResults } from './results/TrainingResults';
import type { TrialData } from './types';

void PixiMovingCardPlugin;
void PixiOculomotorTrainingPlugin;
void ThreeDrivingRehabPlugin;

type Phase = 'running' | 'results';

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
  const drivingDifficulty = (searchParams.get('drivingDifficulty') as any) || getSetting('drivingDifficulty');
  const gaborDurationSec = parseInt(searchParams.get('duration') || '', 10) || 60;
  const gaborMaxSpots = parseInt(searchParams.get('maxSpots') || '', 10) || 10;

  const [phase, setPhase] = useState<Phase>('running');
  const [results, setResults] = useState<TrialData[]>([]);
  const jsPsychRef = useRef<JsPsych | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userName = getActiveUser() || t('exp.unknownUser');

  useEffect(() => {
    if (phase !== 'running') return;
    if (!containerRef.current) return;
    if (jsPsychRef.current) return;

    const container = containerRef.current;

    const setupExperiment = async () => {
      const storyData = moduleId === 'reading-training'
        ? getRandomStory(lang) || undefined
        : undefined;

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
      jsPsych.run(buildTimeline(moduleId, {
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
          durationSec: gaborDurationSec,
          maxSpots: gaborMaxSpots,
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
          difficulty: drivingDifficulty,
        },
      }) as any);
    };

    setupExperiment();

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
    enableWebGazer,
    gaborDurationSec,
    gaborMaxSpots,
    drivingDurationSec,
    drivingRedFlashEnabled,
    drivingDifficulty,
    lang,
  ]);

  const downloadCSV = useCallback(() => {
    downloadTrainingCsv({
      results,
      userName,
      moduleId,
      difficulty,
      oculomotorMode,
      oculomotorPattern,
      t,
    });
  }, [results, userName, moduleId, difficulty, oculomotorMode, oculomotorPattern, t]);

  if (phase === 'running') {
    return (
      <div key="running" className="experiment-container">
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    );
  }

  return (
    <TrainingResults
      moduleId={moduleId}
      results={results}
      userName={userName}
      t={t}
      oculomotorMode={oculomotorMode}
      oculomotorPattern={oculomotorPattern}
      onDownloadCsv={downloadCSV}
      onBackHome={() => navigate('/')}
    />
  );
}

function isOculomotorTargetShape(value: string): value is OculomotorTargetShape {
  return ['circle', 'star', 'square', 'cross', 'triangle', 'custom'].includes(value);
}
