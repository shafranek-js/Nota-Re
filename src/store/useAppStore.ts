import { create } from 'zustand';
import { AppMode, ExerciseNote, FilterType, HanonType, SpeechType, TonalityKey } from '../types/music';
import { COURSE_CURRICULUM } from '../data/curriculum';
import { MODULE_V_TRIADS_ID, type ModuleVLessonId } from '../data/moduleVCurriculum';
import { audioEngine } from '../core/audio/AudioEngine';
import { MIDI_NOTE_MAP } from '../data/notes';
import {
  noteDurationMs, metronomeBeatsInNote, evaluateLessonCredit,
  nextAudioDeadline, remainingAudioMs, EMPTY_LESSON_EVIDENCE
} from '../core/training/flowTiming';
import type { LessonEvidence } from '../core/training/flowTiming';
import { midiManager } from '../core/midi/MidiManager';
import { advanceExerciseNoteStatuses } from '../core/training/assistedStep';
import { getTwoHandCourseTrialPreset } from '../core/training/twoHandCourseTrial';
import { invalidateInterruptedTimedLesson } from '../core/training/flowInterruption';
import { judgeExerciseNote } from '../core/training/noteJudgment';
import { isLessonThreeLateOnset } from '../core/training/lessonThreeRhythm';
import { createAttemptSnapshot } from '../core/training/exerciseAttempt';
import type { AttemptEvent, AttemptSnapshot } from '../core/training/exerciseAttempt';
import { resetNotesForRetry } from '../core/training/trainerSession';
import type { KeyboardLabelMode } from '../core/storage/trainerPreferences';
import { COUNT_IN_BEATS, countInBeatDurationMs, countInFinished, countInIndex } from '../core/training/countInTiming';
import type { TrainerPhase } from '../core/training/trainerSession';
import { generateExerciseNotes } from '../core/generator/ExerciseGenerator';
import { generateAdaptiveReflexExercise, type AdaptiveTrace } from '../core/generator/adaptiveReflex';
import { addSelfPacedReflexAttempt, emptyPracticeStats, type PracticeStats } from '../core/training/practiceStatistics';
import { loadPracticeStats, savePracticeStats, clearPracticeStats } from '../core/storage/practiceStatsStorage';
import { assessmentModeForLesson, canCreditLessonMode } from '../core/training/lessonStages';
import { allowsAutomaticLessonCredit, isTwoHandCourseLesson, requiresSpeedForLessonCredit } from '../core/training/courseAssessmentPolicy';
import { 
  loadCourseProgressFromStorage, 
  saveCourseProgressToStorage, 
  clearCourseProgressFromStorage 
} from '../core/storage/progressStorage';
import {
  loadCourseSeriesFromStorage, saveCourseSeriesToStorage, clearCourseSeriesFromStorage
} from '../core/storage/courseSeriesStorage';
import type { CourseSeries } from '../core/storage/courseSeriesStorage';
import { appendCourseWindow, evaluateCourseWindow, gradedScoreFromEvents, lessonTenLookaheadCount,
  qualifiesLegacyLessonOne } from '../core/training/recentCourseWindow';
import type { RecentCourseWindows } from '../core/training/recentCourseWindow';
import { loadRecentCourseWindows, saveRecentCourseWindows, clearRecentCourseWindows } from '../core/storage/recentCourseStorage';
import { clearAllTwoHandShadowSeries } from '../core/storage/twoHandShadowStorage';
import {
  DEFAULT_TRAINER_PREFERENCES, loadTrainerPreferences,
  saveTrainerPreferences, selectTrainerPreferences
} from '../core/storage/trainerPreferences';

/** Three primary destinations, with contextual tools inside Studio. */
export type WorkspaceTab = 'course' | 'trainer' | 'theory';
export type StudioSection = 'practice' | 'precheck' | 'lab';

const MIDI_PITCH_NAMES = new Map(Object.entries(MIDI_NOTE_MAP).map(([name, note]) => [note.midi, name]));

export interface AppState {
  // Навигация и модалки
  currentWorkspace: WorkspaceTab;
  studioSection: StudioSection;
  isSettingsOpen: boolean;
  /** Settings deep link for the header MIDI hardware diagnostic shortcut. Session-only. */
  settingsPanel: 'general' | 'midi';

  // Курс
  selectedLessonId: number;
  completedLessons: number[];
  /** Graded, fully completed exercises survive reload; live timing never does. */
  courseSeries: CourseSeries;
  /** Exact individual graded scores since v2; never synthesize them from v1 totals. */
  courseWindows: RecentCourseWindows;
  activeLessonId: number | null;
  /** Optional, session-only ungraded speed trial; never stored as course credit. */
  speedChallengeTargetMs: number | null;

  // Настройки тренажёра
  currentAppMode: AppMode;
  currentFilter: FilterType;
  currentTonality: TonalityKey;
  currentHanonType: HanonType;
  speechSuppressor: SpeechType;
  scoreNoteCount: number;
  bpm: number;
  isContinuousFlow: boolean;
  isBlindfolded: boolean;
  isTabletopMode: boolean;
  /** Dedicated, ungraded physical-MIDI polyphonic practice. */
  isTwoHandPracticeOpen: boolean;
  /** Session-only entry choice for ungraded MIDI practice. */
  twoHandPracticeFocus: 'hands' | 'chords' | 'accompaniment';
  /** Independent module V route, preserved on returning from Studio. */
  moduleVRouteOpen: boolean;
  /** Active ungraded Module V guided score (never a numeric grade ID). */
  moduleVLessonId: ModuleVLessonId | null;
  /** Session-only: imported score is visible; never grade it as generated exercise. */
  isRepertoirePreviewOpen: boolean;
  /** Explicit session-only opt-in; never enabled inside certified lessons. */
  adaptiveReflexEnabled: boolean;
  adaptiveStats: PracticeStats;
  adaptiveTrace: AdaptiveTrace | null;
  /** Session-only course trial; never accepted as formal lesson completion. */
  twoHandTrialLessonId: number | null;
  showBassLandmarks: boolean;
  showScaleHighlight: boolean;
  showVirtualKeyboard: boolean;
  zenModeEnabled: boolean;
  /** Ephemeral per-attempt focus gates; never persisted. */
  zenSessionStarted: boolean;
  zenDismissedForSession: boolean;
  keyboardLabelMode: KeyboardLabelMode;
  photoExposureMs: number;
  isPhotoMasked: boolean;

  // Аудио и MIDI
  audioEnabled: boolean;
  /** Opt-in pulse setting loaded from versioned trainer preferences. */
  metronomeEnabled: boolean;
  midiInputsCount: number;

  // Телеметрия
  totalAttempts: number;
  correctHits: number;
  currentStreak: number;
  bestStreak: number;
  completedExercisesCount: number;
  /** Session-only independent evidence for course certification. */
  courseEvidence: LessonEvidence;
  reactionTimes: number[];
  lastTriggeredNote: string | null;
  lastKeyResult: { noteName: string; isCorrect: boolean } | null;

  // Партитура
  activeExerciseNotes: ExerciseNote[];
  activeNoteIndex: number;
  noteShownTimestamp: number;
  // Assisted/imagined steps cannot be used as evidence for course certification.
  isExerciseAssisted: boolean;
  isExerciseFlawless: boolean;
  /** Physical MIDI/PC judgments, rhythmic misses and assisted actions for this exercise only. */
  attemptEvents: AttemptEvent[];
  /** Immutable outcome of the most recently finished exercise (not the session totals). */
  lastAttemptResult: AttemptSnapshot | null;
  /** Explicit practice lifecycle, independent of rhythmic flow. */
  trainerPhase: TrainerPhase;
  countInBeat: number;

  // Методы управления
  initApp: () => () => void;
  switchWorkspace: (tab: WorkspaceTab) => void;
  switchStudioSection: (section: StudioSection) => void;
  toggleSettingsDrawer: () => void;
  openMidiDiagnostics: () => void;
  selectCourseLesson: (id: number) => void;
  selectPrevCourseLesson: () => void;
  selectNextCourseLesson: () => void;
  toggleLessonCompleted: (id: number) => void;
  resetCourseProgress: () => void;
  restartSelectedLessonWindow: () => void;
  startActiveLessonInTrainer: () => void;
  beginSpeedChallenge: () => void;
  exitSpeedChallenge: () => void;
  startTwoHandCourseTrial: (lessonId: number) => void;
  prepareSelectedLessonInTrainer: () => void;
  openTrainerPrecheck: () => void;
  completeTrainerPrecheck: () => void;
  cancelTrainerCountIn: () => void;
  /** Starts four audible preparatory beats only after visible engraving is ready. */
  beginVisibleCountIn: () => void;
  goToNextLessonAndStart: () => void;

  setAppMode: (mode: AppMode) => void;
  setClefFilter: (filter: FilterType) => void;
  changeTonality: (tonality: TonalityKey) => void;
  setHanonType: (type: HanonType) => void;
  setSpeechSuppressor: (speech: SpeechType) => void;
  cycleSpeechSuppressor: () => void;
  toggleScoreDensity: () => void;
  setBpm: (bpm: number) => void;
  toggleContinuousFlow: () => void;
  toggleBlindfoldKeys: () => void;
  toggleTabletopMode: () => void;
  toggleAdaptiveReflex: () => void;
  clearAdaptiveStats: () => void;
  toggleTwoHandPractice: () => void;
  openChordPractice: () => void;
  setModuleVRouteOpen: (open: boolean) => void;
  startModuleVLesson: (id: ModuleVLessonId) => void;
  openAccompanimentPractice: () => void;
  setRepertoirePreviewOpen: (open: boolean) => void;
  toggleBassLandmarks: () => void;
  toggleScaleHighlight: () => void;
  toggleVirtualKeyboard: () => void;
  setAutoZenEnabled: (enabled: boolean) => void;
  dismissZenForSession: () => void;
  setKeyboardLabelMode: (mode: KeyboardLabelMode) => void;
  stopTrainerExercise: () => void;
  setPhotoExposure: (ms: number) => void;
  triggerPhotoFlash: () => void;
  toggleAudioMaster: () => void;
  toggleMetronome: () => void;
  resetSessionStats: () => void;
  clearLastAttemptResult: () => void;
  retryExercise: () => void;
  returnToTrainerSetup: () => void;
  startTrainerExercise: () => void;
  resetTrainerPreferences: () => void;
  regenerateExercise: () => void;
  handleUserTriggerNote: (noteName: string, fromMidi?: boolean) => void;
  advanceAssistedStep: () => void;
  advanceFlowStep: () => void;
}

let photoTimerId: number | null = null;
let countInTimeoutId: number | null = null;
let countInEpoch = 0;
let countInClickCancels: Array<() => void> = [];
// The first playing downbeat must be scheduled before count-in JS wakes up.
let countInDownbeatCancel: (() => void) | null = null;

function stopCountIn(transferDownbeat = false): (() => void) | null {
  ++countInEpoch;
  if (countInTimeoutId !== null) window.clearTimeout(countInTimeoutId);
  countInTimeoutId = null;
  countInClickCancels.forEach(cancel => cancel());
  countInClickCancels = [];
  const downbeat = countInDownbeatCancel;
  countInDownbeatCancel = null;
  if (!transferDownbeat) downbeat?.();
  return transferDownbeat ? downbeat : null;
}

let flowTimeoutId: number | null = null;
let flowEpoch = 0;
let flowOnsetAudioTime: number | null = null;
let flowDeadlineAudioTime: number | null = null;
let flowClickCancels: Array<() => void> = [];
// Untimed optional sound-only pulse; it never advances a score or changes a grade.
let practicePulseTimer: number | null = null;
let practicePulseCancels: Array<{ at: number; cancel: () => void }> = [];
let practicePulseNextTime = 0;
let practicePulseNextBeat = 0;
let practicePulseBpm = 0;

function stopPracticePulse(): void {
  if (practicePulseTimer !== null) window.clearInterval(practicePulseTimer);
  practicePulseTimer = null;
  practicePulseCancels.forEach(item => item.cancel());
  practicePulseCancels = [];
  practicePulseNextBeat = 0;
  practicePulseBpm = 0;
}

function syncPracticePulse(state: AppState): void {
  const active = state.metronomeEnabled && state.audioEnabled &&
    state.currentWorkspace === 'trainer' && state.studioSection === 'practice' &&
    state.trainerPhase === 'playing' && !state.isContinuousFlow &&
    !state.isTwoHandPracticeOpen && !state.isSettingsOpen &&
    !state.isRepertoirePreviewOpen && !document.hidden;
  if (!active) { if (practicePulseTimer !== null) stopPracticePulse(); return; }
  if (practicePulseTimer !== null && practicePulseBpm === state.bpm) return;
  stopPracticePulse();
  const context = audioEngine.ensureAudioContext();
  if (!context) return;
  practicePulseBpm = state.bpm;
  practicePulseNextTime = context.currentTime + 0.06;
  const schedule = () => {
    if (context.state !== 'running' || document.hidden) return;
    const now = context.currentTime;
    const interval = 60 / practicePulseBpm;
    practicePulseCancels = practicePulseCancels.filter(item => item.at > now - 0.1);
    if (practicePulseNextTime < now - 0.1) {
      const skipped = Math.ceil((now - practicePulseNextTime) / interval);
      practicePulseNextTime += skipped * interval;
      practicePulseNextBeat += skipped;
    }
    while (practicePulseNextTime < now + 0.16) {
      practicePulseCancels.push({
        at: practicePulseNextTime,
        cancel: audioEngine.scheduleMetronomeClick(practicePulseNextBeat % 4 === 0, practicePulseNextTime)
      });
      practicePulseNextBeat++;
      practicePulseNextTime += interval;
    }
  };
  schedule();
  practicePulseTimer = window.setInterval(schedule, 45);
}

function syncFlowMetronome(state: AppState, skipQueuedDownbeat = false): void {
  flowClickCancels.forEach(cancel => cancel());
  flowClickCancels = [];
  if (!state.metronomeEnabled || !state.audioEnabled || flowOnsetAudioTime === null) return;
  const now = audioEngine.currentAudioTime();
  for (const beat of metronomeBeatsInNote(state.activeExerciseNotes, state.activeNoteIndex)) {
    if (skipQueuedDownbeat && beat.strong && beat.offsetQuarters === 0) continue;
    const at = flowOnsetAudioTime + beat.offsetQuarters * 60 / state.bpm;
    if (now !== null && at < now + 0.008) continue;
    flowClickCancels.push(audioEngine.scheduleMetronomeClick(beat.strong, at));
  }
}

function stopFlowClock(): void {
  ++flowEpoch;
  if (flowTimeoutId !== null) window.clearTimeout(flowTimeoutId);
  flowTimeoutId = null;
  flowClickCancels.forEach(cancel => cancel());
  flowClickCancels = [];
  flowOnsetAudioTime = null;
  flowDeadlineAudioTime = null;
}

function armFlowClock(
  get: () => AppState, nextOnsetAudioTime?: number | null,
  queuedDownbeat?: (() => void) | null
): void {
  stopFlowClock();
  const state = get();
  if (!state.isContinuousFlow || state.currentWorkspace !== 'trainer' || state.trainerPhase !== 'playing') {
    queuedDownbeat?.();
    return;
  }
  const note = state.activeExerciseNotes[state.activeNoteIndex];
  if (!note) { queuedDownbeat?.(); return; }
  const epoch = flowEpoch;
  const audioTime = audioEngine.ensureAudioContext()?.currentTime ?? null;
  // The new slot begins at the preceding *planned* boundary, never at
  // a delayed JavaScript callback. Fresh sessions have a 40 ms lead-in.
  const onset = audioTime === null ? null :
    (nextOnsetAudioTime ?? (audioTime + 0.04));
  flowOnsetAudioTime = onset;
  flowDeadlineAudioTime = onset === null ? null : nextAudioDeadline(onset, note, state.bpm);
  // Keep the beat already queued during count-in. Scheduling it only after
  // the count-in timeout would miss the downbeat when JS wakes up late.
  syncFlowMetronome(state, !!queuedDownbeat);
  if (queuedDownbeat) flowClickCancels.push(queuedDownbeat);
  const fallbackEnd = performance.now() + noteDurationMs(note, state.bpm);

  const wake = () => {
    if (flowEpoch !== epoch) return;
    const now = audioEngine.currentAudioTime();
    const remaining = now !== null && flowDeadlineAudioTime !== null
      ? remainingAudioMs(now, flowDeadlineAudioTime)
      : Math.max(0, Math.round(fallbackEnd - performance.now()));
    if (remaining > 2) {
      // These JS callbacks drive only the visible cursor; oscillator and
      // SoundFont attacks were already queued against the audio clock.
      flowTimeoutId = window.setTimeout(wake, Math.min(remaining, 250));
      return;
    }
    flowTimeoutId = null;

    // Never penalize a learner for a suspended/hidden tab or a main-thread
    // freeze. Pause rather than run an entire unseen exercise at once.
    const lateBy = now !== null && flowDeadlineAudioTime !== null
      ? (now - flowDeadlineAudioTime) * 1000
      : performance.now() - fallbackEnd;
    if (document.hidden || lateBy > 350) {
      stopFlowClock();
      useAppStore.setState(invalidateInterruptedTimedLesson());
      return;
    }
    get().advanceFlowStep();
  };
  flowTimeoutId = window.setTimeout(wake, Math.min(noteDurationMs(note, state.bpm), 250));
}

/**
 * Count-in is separate from flow deadlines: grading is forbidden until all
 * four preparatory clicks have elapsed. Use the audio clock for scheduling
 * and discard a delayed/suspended or backgrounded transition.
 */
function beginTrainerCountIn(get: () => AppState, set: (patch: Partial<AppState>) => void): void {
  stopCountIn();
  stopFlowClock();
  const state = get();
  if (state.currentWorkspace !== 'trainer' || !state.isContinuousFlow) return;
  const beatSeconds = countInBeatDurationMs(state.bpm) / 1000;
  const audioStart = audioEngine.ensureAudioContext()?.currentTime ?? null;
  const firstClickAudio = audioStart === null ? null : audioStart + 0.07;
  const fallbackStartMs = performance.now() + 70;
  const epoch = countInEpoch;
  if (state.metronomeEnabled && state.audioEnabled && firstClickAudio !== null) {
    for (let i = 0; i < COUNT_IN_BEATS; i += 1) {
      countInClickCancels.push(audioEngine.scheduleMetronomeClick(i === 0,
        firstClickAudio + i * beatSeconds));
    }
    // Queue the very first exercise beat while the audio clock is still ahead.
    // On cancel this is silenced; on success ownership moves to the flow clock.
    countInDownbeatCancel = audioEngine.scheduleMetronomeClick(true,
      firstClickAudio + COUNT_IN_BEATS * beatSeconds);
  }
  set({ trainerPhase: 'countIn', countInBeat: 1 });
  const wake = () => {
    if (epoch !== countInEpoch || get().trainerPhase !== 'countIn') return;
    const audioNow = audioEngine.currentAudioTime();
    const elapsed = firstClickAudio !== null && audioNow !== null
      ? (audioNow - firstClickAudio) * 1000
      : performance.now() - fallbackStartMs;
    const lateBy = elapsed - COUNT_IN_BEATS * countInBeatDurationMs(state.bpm);
    if (document.hidden || get().isSettingsOpen || get().currentWorkspace !== 'trainer' || lateBy > 350) {
      stopCountIn();
      set({ trainerPhase: 'setup', countInBeat: 0 });
      return;
    }
    if (countInFinished(elapsed, state.bpm)) {
      const queuedDownbeat = stopCountIn(true);
      set({ trainerPhase: 'playing', countInBeat: 0, noteShownTimestamp: performance.now() });
      armFlowClock(get,
        firstClickAudio === null ? undefined : firstClickAudio + COUNT_IN_BEATS * beatSeconds,
        queuedDownbeat);
      if (get().currentAppMode === 'photo') get().triggerPhotoFlash();
      return;
    }
    const beat = countInIndex(elapsed, state.bpm);
    if (beat !== get().countInBeat) set({ countInBeat: beat });
    countInTimeoutId = window.setTimeout(wake, 45);
  };
  countInTimeoutId = window.setTimeout(wake, 45);
}

/** Confirm meaningful graded interruption; already completed exercises stay saved. */
function confirmAssessmentExit(get: () => AppState): boolean {
  const state = get();
  if (state.activeLessonId === null || state.trainerPhase === 'results' ||
      (state.courseEvidence.completedExercises === 0 && state.attemptEvents.length === 0)) return true;
  const approved = window.confirm(
    `Прервать зачёт урока ${state.activeLessonId}? Завершённые упражнения (${state.courseEvidence.completedExercises}) сохранены, а текущий незаконченный номер не засчитается. ОК — выйти, Отмена — остаться.`
  );
  if (!approved && state.isContinuousFlow && state.trainerPhase === 'playing') {
    // Native dialogs suspend JS while the audio clock continues. On cancel,
    // restart the current score with a fresh count-in, not unseen deadlines.
    get().retryExercise();
  }
  return approved;
}

function finishExercise(
  get: () => AppState,
  set: (patch: Partial<AppState>) => void
): void {
  const state = get();
  const lesson = COURSE_CURRICULUM.find(item => item.id === state.activeLessonId);
  const existingWindow = lesson ? (state.courseWindows[lesson.id] ?? []) : [];
  const stageCount = lesson?.id === 10 ? lessonTenLookaheadCount(existingWindow) :
    state.courseEvidence.completedExercises;
  const result = evaluateLessonCredit({
    previous: state.courseEvidence,
    noteCount: state.activeExerciseNotes.length,
    events: state.attemptEvents,
    assisted: state.isExerciseAssisted,
    targetRepetitions: lesson?.normReps ?? Infinity,
    requiredAccuracy: lesson?.normAcc ?? 100,
    maximumReactionMs: lesson?.normSpeed ?? 0,
    requireSpeed: requiresSpeedForLessonCredit(lesson?.id ?? null),
    lessonActive: Boolean(lesson && lesson.id === state.selectedLessonId &&
      allowsAutomaticLessonCredit(lesson.id) &&
      canCreditLessonMode(lesson.id, stageCount, state.currentAppMode))
  });

  const currentScore = gradedScoreFromEvents(state.currentAppMode, state.attemptEvents);
  const updatedWindow = lesson && result.credited
    ? appendCourseWindow(existingWindow, currentScore, lesson.id, lesson.normReps)
    : existingWindow;
  const windowResult = lesson ? evaluateCourseWindow(updatedWindow, lesson.id,
    lesson.normReps, lesson.normAcc) : null;
  const legacyOne = lesson?.id === 1 && result.credited &&
    qualifiesLegacyLessonOne(existingWindow, state.courseEvidence, lesson.normReps, lesson.normAcc, currentScore);
  const certified = result.credited && Boolean(windowResult?.passed || legacyOne);

  // Snapshot the completed score before regenerating its notes.
  const lastAttemptResult = createAttemptSnapshot({
    mode: state.currentAppMode,
    tonality: state.currentTonality,
    bpm: state.bpm,
    lessonId: lesson?.id === state.selectedLessonId ? lesson.id : null,
    noteCount: state.activeExerciseNotes.length,
    events: state.attemptEvents,
    clean: state.isExerciseFlawless,
    assisted: state.isExerciseAssisted,
    lessonPassed: certified
  });
  // Optional adaptive evidence is *only* from fully completed self-paced
  // standalone Reflex exercises. This is a separate privacy-local dataset.
  // Graded lessons, assisted, rhythm/flow and imported scores never feed it.
  if (state.adaptiveReflexEnabled && state.currentAppMode === 'reflex' &&
      state.activeLessonId === null &&
      !state.isContinuousFlow && !state.isExerciseAssisted &&
      !state.isRepertoirePreviewOpen && !state.isTwoHandPracticeOpen) {
    const observations = addSelfPacedReflexAttempt(
      state.adaptiveStats, state.attemptEvents,
      state.activeExerciseNotes.map(note => ({ noteName: note.noteName, clef: note.clef })),
      Date.now()
    );
    if (observations !== state.adaptiveStats) {
      savePracticeStats(observations);
      set({ adaptiveStats: observations });
    }
  }
  set({ courseEvidence: result.evidence, completedExercisesCount: result.creditedRepetitions,
    lastAttemptResult, trainerPhase: 'results' });
  if (lesson && result.credited) {
    const courseSeries = { ...get().courseSeries, [lesson.id]: result.evidence };
    const courseWindows = { ...get().courseWindows, [lesson.id]: updatedWindow };
    set({ courseSeries, courseWindows });
    saveCourseSeriesToStorage(courseSeries);
    saveRecentCourseWindows(courseWindows);
  }
  if (lesson && certified && !state.completedLessons.includes(lesson.id)) {
    const completedLessons = [...state.completedLessons, lesson.id];
    saveCourseProgressToStorage(completedLessons);
    set({ completedLessons });
  }

  stopFlowClock();
  if (photoTimerId !== null) window.clearTimeout(photoTimerId);
  photoTimerId = null;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentWorkspace: 'course',
  studioSection: 'practice',
  isSettingsOpen: false,
  settingsPanel: 'general',

  // All user preference keys live in the versioned, validated snapshot.
  ...loadTrainerPreferences(),

  // Runtime focus state, never persisted.
  zenSessionStarted: false,
  zenDismissedForSession: false,

  // Session-only state: never resume graded flow or restore fake results.
  completedLessons: [],
  courseSeries: {},
  courseWindows: {},
  activeLessonId: null,
  speedChallengeTargetMs: null,
  isContinuousFlow: false,
  isTwoHandPracticeOpen: false,
  twoHandPracticeFocus: 'hands',
  moduleVRouteOpen: false,
  moduleVLessonId: null,
  isRepertoirePreviewOpen: false,
  adaptiveReflexEnabled: false,
  adaptiveStats: loadPracticeStats(),
  adaptiveTrace: null,
  twoHandTrialLessonId: null,
  isPhotoMasked: false,
  midiInputsCount: 0,

  totalAttempts: 0,
  correctHits: 0,
  currentStreak: 0,
  bestStreak: 0,
  completedExercisesCount: 0,
  courseEvidence: EMPTY_LESSON_EVIDENCE,
  reactionTimes: [],
  lastTriggeredNote: null,
  lastKeyResult: null,

  activeExerciseNotes: [],
  activeNoteIndex: 0,
  noteShownTimestamp: performance.now(),
  isExerciseAssisted: false,
  isExerciseFlawless: true,
  attemptEvents: [],
  lastAttemptResult: null,
  trainerPhase: 'playing',
  countInBeat: 0,

  initApp: () => {
    const saved = loadCourseProgressFromStorage();
    const courseSeries = loadCourseSeriesFromStorage();
    const courseWindows = loadRecentCourseWindows();
    set({ completedLessons: saved, courseSeries, courseWindows });
    audioEngine.setAudioEnabled(get().audioEnabled);

    // Save preference changes only, not thousands of note/status updates.
    // Explicit course presets update the user's most recently chosen setup.
    let previousPrefs = JSON.stringify(selectTrainerPreferences(get()));
    const unlistenPrefs = useAppStore.subscribe(state => {
      const next = JSON.stringify(selectTrainerPreferences(state));
      if (next === previousPrefs) return;
      previousPrefs = next;
      saveTrainerPreferences(state);
    });

    const unlistenMetronome = useAppStore.subscribe(state => syncPracticePulse(state));
    syncPracticePulse(get());
    const unlistenPorts = midiManager.onPortsChange(count => set({ midiInputsCount: count }));
    const unlistenEvents = midiManager.onMidiEvent(event => {
      switch (event.type) {
        case 'note-on': {
          // Physical keys sound until actual Note Off. Only Note On affects
          // sight-reading scoring; no second fixed-duration preview sound.
          audioEngine.midiNoteOn(event.channel, event.note, event.velocity, event.receivedAtMs, event.systemReceivedAtMs);
          const noteName = MIDI_PITCH_NAMES.get(event.note);
          if (noteName) get().handleUserTriggerNote(noteName, true);
          break;
        }
        case 'note-off':
          audioEngine.midiNoteOff(event.channel, event.note);
          break;
        case 'sustain':
          audioEngine.midiSustain(event.channel, event.value);
          break;
        case 'all-notes-off':
          audioEngine.midiAllNotesOff(event.channel);
          break;
        case 'panic':
          audioEngine.stopMidiVoices();
          break;
      }
    });
    void midiManager.init();

    const pauseWhenHidden = () => {
      if (document.hidden) stopPracticePulse();
      else syncPracticePulse(get());
      if (document.hidden && get().trainerPhase === 'countIn') {
        get().cancelTrainerCountIn();
        return;
      }
      if (document.hidden && get().isContinuousFlow) {
        stopFlowClock();
        set(invalidateInterruptedTimedLesson());
      }
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);

    get().regenerateExercise();
    return () => {
      document.removeEventListener('visibilitychange', pauseWhenHidden);
      stopCountIn();
      stopFlowClock();
      stopPracticePulse();
      unlistenMetronome();
      if (photoTimerId !== null) window.clearTimeout(photoTimerId);
      photoTimerId = null;
      unlistenPrefs();
      unlistenEvents();
      unlistenPorts();
      midiManager.dispose();
      audioEngine.stopMidiVoices();
    };
  },

  setRepertoirePreviewOpen: (open) => {
    if (open) stopFlowClock();
    // Recalibrate latency on return; browsing time must not be recorded as
    // a slow performance response.
    set({ isRepertoirePreviewOpen: open, noteShownTimestamp: performance.now() });
    if (!open) armFlowClock(get);
  },

  switchWorkspace: (tab) => {
    if (tab !== 'trainer' && get().currentWorkspace === 'trainer' &&
        !confirmAssessmentExit(get)) return;
    // Navigation is not a silent pause/resume: cancel any running graded
    // clock when leaving Studio; existing per-attempt results remain intact.
    if (tab !== 'trainer') {
      stopFlowClock();
      stopCountIn();
    }
    set(state => ({
      currentWorkspace: tab,
      speedChallengeTargetMs: tab === 'trainer' ? state.speedChallengeTargetMs : null,
      zenSessionStarted: tab === 'trainer' && state.currentWorkspace === 'trainer' ? state.zenSessionStarted : false,
      zenDismissedForSession: tab === 'trainer' && state.currentWorkspace === 'trainer' ? state.zenDismissedForSession : false,
      studioSection: tab === 'trainer' ? 'practice' : state.studioSection,
      isTwoHandPracticeOpen: tab === 'trainer' ? state.isTwoHandPracticeOpen : false,
      twoHandTrialLessonId: tab === 'trainer' ? state.twoHandTrialLessonId : null,
      moduleVLessonId: tab === 'trainer' ? state.moduleVLessonId : null,
      isContinuousFlow: tab === 'trainer' ? state.isContinuousFlow : false,
      activeLessonId: tab === 'trainer' ? state.activeLessonId : null,
      trainerPhase: tab === 'trainer' ? state.trainerPhase : state.trainerPhase === 'countIn' ? 'setup' : state.trainerPhase,
      countInBeat: tab === 'trainer' ? state.countInBeat : 0
    }));
  },

  switchStudioSection: (studioSection) => {
    if (studioSection !== 'practice' && get().currentWorkspace === 'trainer' &&
        !confirmAssessmentExit(get)) return;
    // The five-step theory and the Hanon/Rhythm catalogs are *inside* Studio,
    // but must never allow a hidden course flow to grade missed notes.
    if (studioSection !== 'practice') {
      stopFlowClock();
      stopCountIn();
      if (photoTimerId !== null) window.clearTimeout(photoTimerId);
      photoTimerId = null;
    }
    set(state => ({
      currentWorkspace: 'trainer',
      studioSection,
      ...(studioSection !== 'practice' ? {
        speedChallengeTargetMs: null,
        zenSessionStarted: false,
        zenDismissedForSession: false,
        isContinuousFlow: false,
        activeLessonId: null,
        completedExercisesCount: 0,
        isTwoHandPracticeOpen: false,
        twoHandTrialLessonId: null,
        isPhotoMasked: false,
        trainerPhase: state.trainerPhase === 'results' ? 'results' as const : 'setup' as const,
        countInBeat: 0
      } : {})
    }));
  },

  openMidiDiagnostics: () => {
    // Reuse the regular modal opening path: rhythmic clocks and course
    // eligibility must be invalidated exactly as for the Settings button.
    if (!get().isSettingsOpen) get().toggleSettingsDrawer();
    set({ settingsPanel: 'midi' });
  },

  toggleSettingsDrawer: () => {
    const opening = !get().isSettingsOpen;
    if (opening && !confirmAssessmentExit(get)) return;
    // Opening a modal must not silently grade missed notes while the player
    // is checking their MIDI hardware or audio settings.
    if (opening) {
      stopFlowClock();
      stopCountIn();
    }
    // Opening Settings disables flow even during preparation, so the course
    // may not remain certified against an untimed altered preset.
    const interruptedFlow = opening && get().activeLessonId !== null;
    set({
      isSettingsOpen: opening,
      settingsPanel: 'general',
      trainerPhase: opening && get().trainerPhase === 'countIn' ? 'setup' : get().trainerPhase,
      countInBeat: opening ? 0 : get().countInBeat,
      isContinuousFlow: opening ? false : get().isContinuousFlow,
      // A flow lesson interrupted by Settings cannot silently continue as
      // an untimed certified run. Relaunch the course preset to qualify.
      activeLessonId: interruptedFlow ? null : get().activeLessonId,
      completedExercisesCount: interruptedFlow ? 0 : get().completedExercisesCount,
      isExerciseFlawless: interruptedFlow ? false : get().isExerciseFlawless
    });
  },

  selectCourseLesson: (id) => {
    set({ selectedLessonId: id });
  },

  selectPrevCourseLesson: () => {
    const { selectedLessonId } = get();
    if (selectedLessonId > 1) {
      set({ selectedLessonId: selectedLessonId - 1 });
    }
  },

  selectNextCourseLesson: () => {
    const { selectedLessonId } = get();
    if (selectedLessonId < COURSE_CURRICULUM.length) {
      set({ selectedLessonId: selectedLessonId + 1 });
    }
  },

  toggleLessonCompleted: (id) => {
    const { completedLessons } = get();
    const updated = completedLessons.includes(id)
      ? completedLessons.filter(l => l !== id)
      : [...completedLessons, id];
    saveCourseProgressToStorage(updated);
    set({ completedLessons: updated });
  },

  resetCourseProgress: () => {
    clearCourseProgressFromStorage();
    clearCourseSeriesFromStorage();
    clearRecentCourseWindows();
    clearAllTwoHandShadowSeries();
    set({ completedLessons: [], courseSeries: {}, courseWindows: {},
      courseEvidence: EMPTY_LESSON_EVIDENCE, completedExercisesCount: 0 });
  },

  restartSelectedLessonWindow: () => {
    const state = get();
    const id = state.selectedLessonId;
    if (state.currentWorkspace !== 'course' || !allowsAutomaticLessonCredit(id) ||
        !(state.courseWindows[id]?.length)) return;
    if (!window.confirm(`Начать новую зачётную серию урока ${id}? Результаты текущего окна будут очищены. Общая история и уже полученный зачёт сохранятся.`)) return;
    const courseWindows = { ...state.courseWindows };
    delete courseWindows[id];
    set({ courseWindows });
    saveRecentCourseWindows(courseWindows);
  },

  startActiveLessonInTrainer: () => {
    set({ speedChallengeTargetMs: null });
    stopCountIn();
    stopFlowClock();
    const { selectedLessonId } = get();
    const lesson = COURSE_CURRICULUM.find(l => l.id === selectedLessonId) || COURSE_CURRICULUM[0];
    // Polyphonic practicum, not a false single-pitch course certificate.
    if (isTwoHandCourseLesson(lesson.id)) {
      get().startTwoHandCourseTrial(lesson.id);
      return;
    }

    const resumedEvidence = get().courseSeries[lesson.id] ?? EMPTY_LESSON_EVIDENCE;
    get().resetSessionStats();

    set({
      courseEvidence: resumedEvidence,
      completedExercisesCount: resumedEvidence.completedExercises,
      currentTonality: lesson.preset.tonality,
      currentFilter: lesson.preset.filter,
      bpm: lesson.preset.bpm,
      speechSuppressor: lesson.preset.speech,
      isBlindfolded: lesson.preset.blind,
      showBassLandmarks: lesson.preset.bassLandmarks,
      isContinuousFlow: lesson.preset.flow,
      currentAppMode: lesson.preset.mode,
      currentWorkspace: 'trainer',
      studioSection: 'practice',
      activeLessonId: lesson.id,
      trainerPhase: 'playing',
      zenSessionStarted: true,
      zenDismissedForSession: false,
      countInBeat: 0,
      isTwoHandPracticeOpen: false,
      twoHandTrialLessonId: null,
      isTabletopMode: false
    });

    // Regeneration now enters score-first count-in for graded FLOW lessons.
    // No missed note or grading clock may start before the pupil has seen
    // the rendered notation and heard all four preparatory beats.
    get().regenerateExercise();
  },

  beginSpeedChallenge: () => {
    const current = get();
    // All automatically scored course lessons offer an independent speed drill.
    if (current.trainerPhase !== 'results' ||
        !allowsAutomaticLessonCredit(current.lastAttemptResult?.lessonId ?? null)) return;
    const lesson = COURSE_CURRICULUM.find(item => item.id === current.lastAttemptResult?.lessonId);
    if (!lesson) return;
    stopCountIn();
    stopFlowClock();
    set({
      activeLessonId: null,
      speedChallengeTargetMs: lesson.normSpeed,
      isContinuousFlow: false,
      isTabletopMode: false,
      isExerciseAssisted: false,
      isTwoHandPracticeOpen: false
    });
    // Retry the same actual notes. This session is *not* course-eligible.
    get().retryExercise();
  },

  exitSpeedChallenge: () => {
    if (get().speedChallengeTargetMs === null) return;
    get().switchWorkspace('course');
  },

  prepareSelectedLessonInTrainer: () => {
    // Existing direct-start button remains unchanged for previously issued
    // course presets and their browser regression contract.
    get().startActiveLessonInTrainer();
    if (!isTwoHandCourseLesson(get().selectedLessonId)) get().openTrainerPrecheck();
  },

  openTrainerPrecheck: () => {
    const state = get();
    const interruptingCourse = state.activeLessonId !== null &&
      (state.activeNoteIndex > 0 || state.attemptEvents.length > 0);
    if (interruptingCourse && !confirmAssessmentExit(get)) return;
    stopFlowClock();
    stopCountIn();
    if (photoTimerId !== null) window.clearTimeout(photoTimerId);
    photoTimerId = null;
    set({
      trainerPhase: 'precheck',
      zenSessionStarted: false,
      zenDismissedForSession: false,
      countInBeat: 0,
      activeExerciseNotes: resetNotesForRetry(state.activeExerciseNotes),
      activeNoteIndex: 0,
      attemptEvents: [],
      isExerciseAssisted: false,
      isExerciseFlawless: true,
      lastKeyResult: null,
      lastAttemptResult: null,
      isPhotoMasked: false,
      isTwoHandPracticeOpen: false,
      ...(interruptingCourse ? { activeLessonId: null, completedExercisesCount: 0 } : {})
    });
  },

  completeTrainerPrecheck: () => {
    if (get().trainerPhase !== 'precheck') return;
    get().startTrainerExercise();
  },

  beginVisibleCountIn: () => {
    const state = get();
    if (state.trainerPhase !== 'countIn' || state.countInBeat !== 0 ||
        !state.isContinuousFlow || state.currentWorkspace !== 'trainer') return;
    beginTrainerCountIn(get, patch => set(patch));
  },
  cancelTrainerCountIn: () => {
    if (get().trainerPhase !== 'countIn') return;
    stopCountIn();
    stopFlowClock();
    set({ trainerPhase: 'setup', zenSessionStarted: false, zenDismissedForSession: false, countInBeat: 0 });
  },

  startTwoHandCourseTrial: (lessonId) => {
    // Lesson-linked exercises are training demonstrations, not certification.
    if (!getTwoHandCourseTrialPreset(lessonId)) return;
    stopCountIn();
    stopFlowClock();
    if (photoTimerId !== null) window.clearTimeout(photoTimerId);
    photoTimerId = null;
    set({
      currentWorkspace: 'trainer',
      studioSection: 'practice',
      selectedLessonId: lessonId,
      isTwoHandPracticeOpen: true,
      twoHandTrialLessonId: lessonId,
      moduleVLessonId: null,
      activeLessonId: null,
      speedChallengeTargetMs: null,
      isContinuousFlow: false,
      isTabletopMode: false,
      trainerPhase: 'playing',
      zenSessionStarted: false,
      zenDismissedForSession: false,
      countInBeat: 0,
      completedExercisesCount: 0,
      isExerciseFlawless: false,
      lastAttemptResult: null
    });
  },

  goToNextLessonAndStart: () => {
    const { selectedLessonId } = get();
    if (selectedLessonId < COURSE_CURRICULUM.length) {
      set({ selectedLessonId: selectedLessonId + 1 });
      get().startActiveLessonInTrainer();
    } else {
      set({ currentWorkspace: 'course' });
    }
  },

  setAppMode: (mode) => {
    set({ currentAppMode: mode, activeLessonId: null, isTwoHandPracticeOpen: false, twoHandTrialLessonId: null,
      ...(mode !== 'reflex' ? { adaptiveReflexEnabled: false, adaptiveTrace: null } : {}) });
    get().regenerateExercise();
  },

  setClefFilter: (filter) => {
    set({ currentFilter: filter, activeLessonId: null,
      ...(filter === 'both' ? { adaptiveReflexEnabled: false, adaptiveTrace: null } : {}) });
    get().regenerateExercise();
  },

  changeTonality: (tonality) => {
    set({ currentTonality: tonality, activeLessonId: null });
    get().regenerateExercise();
  },

  setHanonType: (type) => {
    set({ currentHanonType: type, activeLessonId: null });
    get().regenerateExercise();
  },

  setSpeechSuppressor: (speech) => {
    set({ speechSuppressor: speech, activeLessonId: null });
  },

  cycleSpeechSuppressor: () => {
    const modes: SpeechType[] = ['count', 'tata', 'syllables', 'solfege'];
    const { speechSuppressor } = get();
    const nextIdx = (modes.indexOf(speechSuppressor) + 1) % modes.length;
    set({ speechSuppressor: modes[nextIdx], activeLessonId: null });
  },

  toggleScoreDensity: () => {
    const nextCount = get().scoreNoteCount === 16 ? 8 : 16;
    set({ scoreNoteCount: nextCount, activeLessonId: null });
    get().regenerateExercise();
  },

  setBpm: (bpm) => {
    if (get().trainerPhase === 'countIn') get().cancelTrainerCountIn();
    set({ bpm, activeLessonId: null, noteShownTimestamp: performance.now() });
    if (get().isContinuousFlow) armFlowClock(get);
  },

  toggleContinuousFlow: () => {
    if (!confirmAssessmentExit(get)) return;
    if (get().trainerPhase === 'countIn') get().cancelTrainerCountIn();
    const enabled = !get().isContinuousFlow;
    set({
      isContinuousFlow: enabled,
      activeLessonId: null,
      ...(enabled ? { adaptiveReflexEnabled: false, adaptiveTrace: null } : {}),
      noteShownTimestamp: performance.now()
    });
    if (enabled) armFlowClock(get);
    else stopFlowClock();
  },

  advanceFlowStep: () => {
    const state = get();
    if (!state.isContinuousFlow || state.currentWorkspace !== 'trainer' || state.trainerPhase !== 'playing') return;
    const { activeNoteIndex, activeExerciseNotes } = state;
    const target = activeExerciseNotes[activeNoteIndex];
    if (!target) return;
    const nextPlannedOnset = flowDeadlineAudioTime;
    stopFlowClock();

    // A note advances when its *musical duration* ends. Correct/wrong input
    // marks the current slot but cannot accelerate the rhythmic grid.
    const unanswered = target.status !== 'done' && target.status !== 'missed';
    const nextIndex = activeNoteIndex + 1;
    const nextNotes = activeExerciseNotes.map((note, index) =>
      index === activeNoteIndex && unanswered ? { ...note, status: 'missed' as const }
        : index === nextIndex ? { ...note, status: 'current' as const }
        : note
    );
    set({
      activeExerciseNotes: nextNotes,
      totalAttempts: state.totalAttempts + (unanswered ? 1 : 0),
      attemptEvents: unanswered ? [...state.attemptEvents, {
        noteIndex: activeNoteIndex,
        expectedNote: target.noteName,
        playedNote: null,
        outcome: 'missed' as const,
        reactionMs: null
      }] : state.attemptEvents,
      currentStreak: unanswered ? 0 : state.currentStreak,
      // A rhythmic miss lowers accuracy, not the completed-exercise count.
      completedExercisesCount: state.completedExercisesCount,
      isExerciseFlawless: state.isExerciseFlawless && !unanswered,
      lastKeyResult: null
    });

    if (nextIndex >= activeExerciseNotes.length) {
      finishExercise(get, patch => set(patch));
      return;
    }
    set({ activeNoteIndex: nextIndex, noteShownTimestamp: performance.now() });
    if (get().currentAppMode === 'photo' &&
        Math.floor(activeExerciseNotes.slice(0, nextIndex).reduce((sum,n) => sum+n.durMultiplier,0) / 4) !==
        Math.floor(activeExerciseNotes.slice(0, activeNoteIndex).reduce((sum,n) => sum+n.durMultiplier,0) / 4)) {
      get().triggerPhotoFlash();
    }
    armFlowClock(get, nextPlannedOnset);
  },

  toggleBlindfoldKeys: () => {
    set((s) => ({ isBlindfolded: !s.isBlindfolded, activeLessonId: null }));
  },

  toggleTabletopMode: () => {
    const entering = !get().isTabletopMode;
    if (entering) stopFlowClock();
    set({
      isTabletopMode: entering,
      ...(entering ? invalidateInterruptedTimedLesson() : {}),
      activeLessonId: null
    });
  },

  toggleAdaptiveReflex: () => {
    const state = get();
    // Never replace a certified or running timed lesson with adaptive material.
    if (state.activeLessonId !== null || state.isContinuousFlow ||
        state.currentAppMode !== 'reflex' || state.currentFilter === 'both' ||
        state.trainerPhase === 'countIn' || state.trainerPhase === 'playing' &&
        state.attemptEvents.length > 0) return;
    set({ adaptiveReflexEnabled: !state.adaptiveReflexEnabled, adaptiveTrace: null });
    get().regenerateExercise();
  },

  clearAdaptiveStats: () => {
    clearPracticeStats();
    set({ adaptiveStats: emptyPracticeStats(), adaptiveTrace: null });
  },

  toggleTwoHandPractice: () => {
    const opening = !get().isTwoHandPracticeOpen;
    if (opening && !confirmAssessmentExit(get)) return;
    if (get().trainerPhase === 'countIn') get().cancelTrainerCountIn();
    // Never continue a timed course or credit an imagined MIDI trial.
    stopFlowClock();
    set({
      isTwoHandPracticeOpen: opening,
      twoHandPracticeFocus: 'hands',
      twoHandTrialLessonId: null,
      moduleVLessonId: null,
      isContinuousFlow: false,
      activeLessonId: null,
      completedExercisesCount: 0,
      isExerciseFlawless: false
    });
  },

  setModuleVRouteOpen: (open) => set({ moduleVRouteOpen: open }),

  startModuleVLesson: (id) => {
    if (id !== MODULE_V_TRIADS_ID || !confirmAssessmentExit(get)) return;
    if (get().trainerPhase === 'countIn') get().cancelTrainerCountIn();
    stopFlowClock();
    stopCountIn();
    set({
      moduleVRouteOpen: true,
      moduleVLessonId: id,
      currentWorkspace: 'trainer',
      studioSection: 'practice',
      isTwoHandPracticeOpen: true,
      twoHandPracticeFocus: 'chords',
      twoHandTrialLessonId: null,
      speedChallengeTargetMs: null,
      activeLessonId: null,
      isContinuousFlow: false,
      isTabletopMode: false,
      trainerPhase: 'playing',
      zenSessionStarted: false,
      zenDismissedForSession: false,
      countInBeat: 0,
      completedExercisesCount: 0,
      isExerciseFlawless: false,
      adaptiveReflexEnabled: false,
      adaptiveTrace: null
    });
  },

  openChordPractice: () => {
    if (!confirmAssessmentExit(get)) return;
    if (get().trainerPhase === 'countIn') get().cancelTrainerCountIn();
    stopFlowClock();
    set({
      isTwoHandPracticeOpen: true,
      twoHandPracticeFocus: 'chords',
      twoHandTrialLessonId: null,
      moduleVLessonId: null,
      isContinuousFlow: false,
      activeLessonId: null,
      completedExercisesCount: 0,
      isExerciseFlawless: false,
      adaptiveReflexEnabled: false,
      adaptiveTrace: null
    });
  },

  openAccompanimentPractice: () => {
    if (!confirmAssessmentExit(get)) return;
    if (get().trainerPhase === 'countIn') get().cancelTrainerCountIn();
    stopFlowClock();
    set({
      isTwoHandPracticeOpen: true,
      twoHandPracticeFocus: 'accompaniment',
      twoHandTrialLessonId: null,
      moduleVLessonId: null,
      isContinuousFlow: false,
      activeLessonId: null,
      completedExercisesCount: 0,
      isExerciseFlawless: false,
      adaptiveReflexEnabled: false,
      adaptiveTrace: null
    });
  },

  toggleBassLandmarks: () => {
    set((s) => ({ showBassLandmarks: !s.showBassLandmarks, activeLessonId: null }));
  },

  toggleScaleHighlight: () => {
    set((s) => ({ showScaleHighlight: !s.showScaleHighlight }));
  },

  toggleVirtualKeyboard: () => set((s) => ({
    showVirtualKeyboard: !s.showVirtualKeyboard
  })),

  // Persistent preference; no changes to audio/MIDI/grading on view toggles.
  setAutoZenEnabled: (zenModeEnabled) => set(state => ({
    zenModeEnabled,
    // Changing the future-start preference must not hide Studio mid-exercise.
    zenDismissedForSession: state.zenSessionStarted ? true : state.zenDismissedForSession
  })),
  // Escape only changes this attempt's presentation. Next explicit Start resets it.
  dismissZenForSession: () => set({ zenDismissedForSession: true }),

  setKeyboardLabelMode: (keyboardLabelMode) => set({ keyboardLabelMode }),

  stopTrainerExercise: () => {
    if (!confirmAssessmentExit(get)) return;
    const current = get();
    if (current.trainerPhase === 'countIn') current.cancelTrainerCountIn();
    stopFlowClock();
    if (photoTimerId !== null) window.clearTimeout(photoTimerId);
    photoTimerId = null;
    set({
      trainerPhase: 'setup',
      zenSessionStarted: false,
      zenDismissedForSession: false,
      activeLessonId: null,
      speedChallengeTargetMs: null,
      completedExercisesCount: 0,
      courseEvidence: EMPTY_LESSON_EVIDENCE,
      isExerciseFlawless: false,
      isPhotoMasked: false,
      lastKeyResult: null
    });
  },

  setPhotoExposure: (ms) => {
    set({ photoExposureMs: ms });
    if (get().currentAppMode === 'photo') {
      get().triggerPhotoFlash();
    }
  },

  triggerPhotoFlash: () => {
    if (photoTimerId) clearTimeout(photoTimerId);
    set({ isPhotoMasked: false });

    photoTimerId = window.setTimeout(() => {
      if (get().currentAppMode === 'photo') {
        set({ isPhotoMasked: true });
      }
    }, get().photoExposureMs);
  },

  toggleAudioMaster: () => {
    const next = !get().audioEnabled;
    audioEngine.setAudioEnabled(next);
    set({ audioEnabled: next });
    if (get().isContinuousFlow) syncFlowMetronome(get());
  },

  toggleMetronome: () => {
    // A sound preference: preserve note index, MIDI events and grading deadline.
    set({ metronomeEnabled: !get().metronomeEnabled });
    if (get().isContinuousFlow) syncFlowMetronome(get());
  },

  resetTrainerPreferences: () => {
    stopCountIn();
    stopFlowClock();
    audioEngine.clearPreviewTimeouts();
    audioEngine.setAudioEnabled(DEFAULT_TRAINER_PREFERENCES.audioEnabled);
    stopPracticePulse();
    set({
      ...DEFAULT_TRAINER_PREFERENCES,
      isContinuousFlow: false,
      isTwoHandPracticeOpen: false,
      twoHandTrialLessonId: null,
      activeLessonId: null,
      speedChallengeTargetMs: null,
      completedExercisesCount: 0,
      courseEvidence: EMPTY_LESSON_EVIDENCE,
      isExerciseAssisted: false,
      isExerciseFlawless: true,
      attemptEvents: [],
      lastAttemptResult: null,
      trainerPhase: 'playing',
      zenSessionStarted: false,
      zenDismissedForSession: false,
      countInBeat: 0
    });
    get().regenerateExercise();
    if (get().isContinuousFlow) syncFlowMetronome(get());
  },

  clearLastAttemptResult: () => set({ lastAttemptResult: null }),

  retryExercise: () => {
    stopCountIn();
    stopFlowClock();
    if (photoTimerId !== null) window.clearTimeout(photoTimerId);
    photoTimerId = null;
    const notes = resetNotesForRetry(get().activeExerciseNotes);
    if (!notes.length) {
      set({ trainerPhase: 'playing', zenSessionStarted: true, zenDismissedForSession: false });
      get().regenerateExercise();
      return;
    }
    set({
      activeExerciseNotes: notes,
      activeNoteIndex: 0,
      noteShownTimestamp: performance.now(),
      lastTriggeredNote: null,
      lastKeyResult: null,
      isPhotoMasked: get().isContinuousFlow && get().currentAppMode === 'photo',
      isExerciseAssisted: false,
      isExerciseFlawless: true,
      attemptEvents: [],
      lastAttemptResult: null,
      // Photo-memory must not gain four extra seconds of visual exposure:
      // the current bar stays masked until the normal flash at the downbeat.
      trainerPhase: get().isContinuousFlow ? 'countIn' : 'playing',
      zenSessionStarted: true,
      zenDismissedForSession: false,
      countInBeat: 0
    });
    // The score is mounted during count-in. The OSMD renderer (or classic
    // SVG) starts the four beats only after the notes have become visible,
    // otherwise slow first-load engraving steals the entire preparation.
    if (get().currentAppMode === 'photo' && !get().isContinuousFlow) get().triggerPhotoFlash();
  },

  returnToTrainerSetup: () => {
    stopCountIn();
    stopFlowClock();
    if (photoTimerId !== null) window.clearTimeout(photoTimerId);
    photoTimerId = null;
    set({ trainerPhase: 'setup', zenSessionStarted: false, zenDismissedForSession: false, countInBeat: 0, lastAttemptResult: null, isPhotoMasked: false });
  },

  startTrainerExercise: () => get().retryExercise(),

  resetSessionStats: () => {
    set({
      totalAttempts: 0,
      correctHits: 0,
      currentStreak: 0,
      completedExercisesCount: 0,
      courseEvidence: EMPTY_LESSON_EVIDENCE,
      reactionTimes: [],
      lastTriggeredNote: null,
      lastKeyResult: null,
      attemptEvents: [],
      lastAttemptResult: null
    });
  },

  regenerateExercise: () => {
    if (get().trainerPhase === 'countIn') get().cancelTrainerCountIn();
    audioEngine.clearPreviewTimeouts();
    const { currentAppMode, currentFilter, currentTonality, scoreNoteCount, currentHanonType,
      activeLessonId, courseEvidence, courseWindows } = get();
    const assessmentCount = activeLessonId === 10
      ? lessonTenLookaheadCount(courseWindows[10] ?? [])
      : courseEvidence.completedExercises;
    const exerciseMode = assessmentModeForLesson(activeLessonId,
      assessmentCount, currentAppMode);

    const options = { mode: exerciseMode, filter: currentFilter, tonality: currentTonality,
      scoreNoteCount, hanonType: currentHanonType };
    const adaptiveActive = get().adaptiveReflexEnabled && activeLessonId === null &&
      exerciseMode === 'reflex' && currentFilter !== 'both' && !get().isContinuousFlow;
    const adaptive = adaptiveActive
      ? generateAdaptiveReflexExercise(options, get().adaptiveStats,
        get().midiInputsCount > 0 ? 'midi' : 'pc',
        Math.floor(Math.random() * 0x7fffffff))
      : null;
    const notes = adaptive?.notes ?? generateExerciseNotes(options);

    // The course Start path used to jump directly to 'playing', unlike
    // Retry, silently skipping the score-first count-in for flow lessons.
    // Preserve untimed lessons and the existing free-practice setup path.
    const phase = get().trainerPhase;
    const gradedFlowCountIn = activeLessonId !== null &&
      get().isContinuousFlow && get().currentWorkspace === 'trainer' &&
      phase !== 'setup' && phase !== 'precheck';
    set({
      currentAppMode: exerciseMode,
      activeExerciseNotes: notes,
      activeNoteIndex: 0,
      adaptiveTrace: adaptive?.trace ?? null,
      adaptiveReflexEnabled: adaptiveActive,
      noteShownTimestamp: performance.now(),
      isPhotoMasked: gradedFlowCountIn && exerciseMode === 'photo',
      isExerciseAssisted: false,
      isExerciseFlawless: true,
      attemptEvents: [],
      lastAttemptResult: null,
      trainerPhase: phase === 'setup' || phase === 'precheck' ? phase :
        gradedFlowCountIn ? 'countIn' : 'playing',
      countInBeat: 0
    });
    // armFlowClock already refuses non-playing states. It is intentionally
    // not called until beginVisibleCountIn finishes the four quarter-beats.
    if (!gradedFlowCountIn) armFlowClock(get);

    if (exerciseMode === 'photo' && get().trainerPhase === 'playing') {
      get().triggerPhotoFlash();
    }
  },

  // Tabletop/imagined play is pedagogical practice, not a scored answer.
  advanceAssistedStep: () => {
    if (get().currentWorkspace !== 'trainer' || get().isSettingsOpen || get().isTwoHandPracticeOpen || get().trainerPhase !== 'playing') return;
    const { activeExerciseNotes, activeNoteIndex } = get();
    const target = activeExerciseNotes[activeNoteIndex];
    const transition = advanceExerciseNoteStatuses(activeExerciseNotes, activeNoteIndex);
    if (!target || !transition) return;
    audioEngine.playPianoTone(target.freq, 0.25, target.articulation === 'staccato');
    const { notes, nextIndex, finished } = transition;
    const attemptEvents: AttemptEvent[] = [...get().attemptEvents, {
      noteIndex: activeNoteIndex,
      expectedNote: target.noteName,
      playedNote: null,
      outcome: 'assisted',
      reactionMs: null
    }];
    if (finished) {
      const state = get();
      const lastAttemptResult = createAttemptSnapshot({
        mode: state.currentAppMode,
        tonality: state.currentTonality,
        bpm: state.bpm,
        lessonId: null,
        noteCount: notes.length,
        events: attemptEvents,
        clean: false,
        assisted: true,
        lessonPassed: false
      });
      set({
        activeExerciseNotes: notes,
        isExerciseAssisted: true,
        isExerciseFlawless: false,
        completedExercisesCount: get().completedExercisesCount,
        attemptEvents,
        lastAttemptResult
      });
      stopFlowClock();
      if (photoTimerId !== null) window.clearTimeout(photoTimerId);
      photoTimerId = null;
      set({ trainerPhase: 'results' });
      return;
    }
    set({
      activeExerciseNotes: notes,
      activeNoteIndex: nextIndex,
      noteShownTimestamp: performance.now(),
      isExerciseAssisted: true,
      isExerciseFlawless: false,
      completedExercisesCount: get().completedExercisesCount,
      attemptEvents
    });
    if (get().isContinuousFlow) armFlowClock(get);
    if (get().currentAppMode === 'photo' &&
        Math.floor(nextIndex / 4) !== Math.floor(activeNoteIndex / 4)) {
      get().triggerPhotoFlash();
    }
  },

  handleUserTriggerNote: (noteName, fromMidi = false) => {
    // The hardware must remain audible during diagnostics, but neither
    // background MIDI nor keyboard shortcuts may inflate a course result.
    if (get().currentWorkspace !== 'trainer' || get().isSettingsOpen || get().isTwoHandPracticeOpen || get().isRepertoirePreviewOpen) return;
    if (get().trainerPhase === 'setup') {
      // Setup may preview virtual notes, but no practice attempts are judged.
      const preview = MIDI_NOTE_MAP[noteName];
      if (preview && !fromMidi) audioEngine.playPianoTone(preview.freq, 0.35);
      return;
    }
    if (get().trainerPhase !== 'playing') return;
    const { 
      activeExerciseNotes, 
      activeNoteIndex, 
      noteShownTimestamp, 
      isContinuousFlow
    } = get();

    const target = activeExerciseNotes[activeNoteIndex];
    if (!target) return;

    // Звук того, что действительно сыграл пользователь, а не целевой ноты.
    // При ошибке слуховая обратная связь должна соответствовать вводу.
    const played = MIDI_NOTE_MAP[noteName];
    if (played && !fromMidi) audioEngine.playPianoTone(played.freq, 0.5, target.articulation === 'staccato');

    // The first strike consumes the current rhythmic slot. Repeated strikes
    // are audible but may not generate extra attempts or move the cursor.
    if (isContinuousFlow && target.status !== 'current') return;

    const audioNow = audioEngine.currentAudioTime();
    // The first graded slot is queued against the AudioContext clock. Input
    // during the small lead-in *before* its real onset must not count as an
    // on-time hit (including when the countdown UI has just disappeared).
    if (isContinuousFlow && get().activeLessonId === 3 &&
        flowOnsetAudioTime !== null && audioNow !== null &&
        audioNow < flowOnsetAudioTime) return;
    const rt = isContinuousFlow && flowOnsetAudioTime !== null && audioNow !== null
      ? Math.max(0, Math.round((audioNow - flowOnsetAudioTime) * 1000))
      : Math.round(performance.now() - noteShownTimestamp);
    // Late judgments use the same monotonic AudioContext clock as the
    // deadline / click scheduling, not an unrelated setTimeout wakeup.
    const isLate = isContinuousFlow && (
      (flowDeadlineAudioTime !== null && audioNow !== null
        ? audioNow >= flowDeadlineAudioTime
        : rt >= noteDurationMs(target, get().bpm)) ||
      // Lesson 3 is explicitly about *rhythmic* reading. The prior logic
      // marked an almost-next-beat strike as "correct"; grade the onset
      // within a duration-sensitive novice window instead. Other modes and
      // ungraded free practice retain their existing timing policy.
      (get().activeLessonId === 3 && isLessonThreeLateOnset(target, get().bpm, rt))
    );
    const outcome = judgeExerciseNote(target.midi, noteName, isLate);
    const isCorrect = outcome === 'correct';

    set((s) => {
      const newTotal = s.totalAttempts + 1;
      const newCorrect = isCorrect ? s.correctHits + 1 : s.correctHits;
      const newStreak = isCorrect ? s.currentStreak + 1 : 0;
      const newBestStreak = Math.max(s.bestStreak, newStreak);
      const newReactionTimes = (isCorrect && Number.isFinite(rt) && rt >= 0) 
        ? [...s.reactionTimes, rt] 
        : s.reactionTimes;

      return {
        totalAttempts: newTotal,
        correctHits: newCorrect,
        currentStreak: newStreak,
        bestStreak: newBestStreak,
        reactionTimes: newReactionTimes,
        lastTriggeredNote: noteName,
        lastKeyResult: { noteName, isCorrect },
        attemptEvents: [...s.attemptEvents, {
          noteIndex: activeNoteIndex,
          expectedNote: target.noteName,
          playedNote: noteName,
          source: fromMidi ? 'midi' : 'pc',
          outcome,
          reactionMs: Number.isFinite(rt) && rt >= 0 ? rt : null
        }],
        isExerciseFlawless: s.isExerciseFlawless && isCorrect,
        completedExercisesCount: s.completedExercisesCount
      };
    });

    // Очистка индикатора через 150мс
    window.setTimeout(() => {
      set({ lastKeyResult: null });
    }, 150);

    if (isContinuousFlow) {
      const status = isCorrect ? 'done' as const : 'missed' as const;
      set({
        activeExerciseNotes: activeExerciseNotes.map((note, index) =>
          index === activeNoteIndex ? { ...note, status } : note)
      });
      // The existing deadline stays armed until the actual note boundary.
      return;
    }

    if (isCorrect) {
      const transition = advanceExerciseNoteStatuses(activeExerciseNotes, activeNoteIndex);
      if (!transition) return;
      const { notes, nextIndex, finished } = transition;
      const prevBar = Math.floor(activeNoteIndex / 4);
      const newBar = Math.floor(nextIndex / 4);

      // The final note must be committed before finishExercise() recomputes
      // lesson credit and generates a new score.
      set({ activeExerciseNotes: notes });
      if (finished) {
        finishExercise(get, patch => set(patch));
      } else {
        set({
          activeNoteIndex: nextIndex,
          noteShownTimestamp: performance.now()
        });
        if (get().currentAppMode === 'photo' && newBar !== prevBar) {
          get().triggerPhotoFlash();
        }
      }
    }
  }
}));
