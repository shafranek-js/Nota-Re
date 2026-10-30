import { create } from 'zustand';
import { AppMode, ExerciseNote, FilterType, HanonType, SpeechType, TonalityKey } from '../types/music';
import { COURSE_CURRICULUM } from '../data/curriculum';
import { audioEngine } from '../core/audio/AudioEngine';
import { MIDI_NOTE_MAP } from '../data/notes';
import {
  noteDurationMs, startsMeasure, evaluateLessonCredit,
  nextAudioDeadline, remainingAudioMs, EMPTY_LESSON_EVIDENCE
} from '../core/training/flowTiming';
import type { LessonEvidence } from '../core/training/flowTiming';
import { midiManager } from '../core/midi/MidiManager';
import { advanceExerciseNoteStatuses } from '../core/training/assistedStep';
import { getTwoHandCourseTrialPreset } from '../core/training/twoHandCourseTrial';
import { invalidateInterruptedTimedLesson } from '../core/training/flowInterruption';
import { judgeExerciseNote } from '../core/training/noteJudgment';
import { createAttemptSnapshot } from '../core/training/exerciseAttempt';
import type { AttemptEvent, AttemptSnapshot } from '../core/training/exerciseAttempt';
import { resetNotesForRetry } from '../core/training/trainerSession';
import type { KeyboardLabelMode } from '../core/storage/trainerPreferences';
import { COUNT_IN_BEATS, countInBeatDurationMs, countInFinished, countInIndex } from '../core/training/countInTiming';
import type { TrainerPhase } from '../core/training/trainerSession';
import { generateExerciseNotes } from '../core/generator/ExerciseGenerator';
import { assessmentModeForLesson, canCreditLessonMode } from '../core/training/lessonStages';
import { allowsAutomaticLessonCredit, isTwoHandCourseLesson } from '../core/training/courseAssessmentPolicy';
import { 
  loadCourseProgressFromStorage, 
  saveCourseProgressToStorage, 
  clearCourseProgressFromStorage 
} from '../core/storage/progressStorage';
import {
  loadCourseSeriesFromStorage, saveCourseSeriesToStorage, clearCourseSeriesFromStorage
} from '../core/storage/courseSeriesStorage';
import type { CourseSeries } from '../core/storage/courseSeriesStorage';
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
  activeLessonId: number | null;

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
  /** Session-only: imported score is visible; never grade it as generated exercise. */
  isRepertoirePreviewOpen: boolean;
  /** Session-only course trial; never accepted as formal lesson completion. */
  twoHandTrialLessonId: number | null;
  showBassLandmarks: boolean;
  showScaleHighlight: boolean;
  showVirtualKeyboard: boolean;
  zenModeEnabled: boolean;
  keyboardLabelMode: KeyboardLabelMode;
  photoExposureMs: number;
  isPhotoMasked: boolean;

  // Аудио и MIDI
  audioEnabled: boolean;
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
  startActiveLessonInTrainer: () => void;
  startTwoHandCourseTrial: (lessonId: number) => void;
  prepareSelectedLessonInTrainer: () => void;
  openTrainerPrecheck: () => void;
  completeTrainerPrecheck: () => void;
  cancelTrainerCountIn: () => void;
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
  toggleTwoHandPractice: () => void;
  setRepertoirePreviewOpen: (open: boolean) => void;
  toggleBassLandmarks: () => void;
  toggleScaleHighlight: () => void;
  toggleVirtualKeyboard: () => void;
  toggleZenMode: () => void;
  setKeyboardLabelMode: (mode: KeyboardLabelMode) => void;
  stopTrainerExercise: () => void;
  setPhotoExposure: (ms: number) => void;
  triggerPhotoFlash: () => void;
  toggleAudioMaster: () => void;
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

function stopCountIn(): void {
  ++countInEpoch;
  if (countInTimeoutId !== null) window.clearTimeout(countInTimeoutId);
  countInTimeoutId = null;
  countInClickCancels.forEach(cancel => cancel());
  countInClickCancels = [];
}

let flowTimeoutId: number | null = null;
let flowEpoch = 0;
let flowOnsetAudioTime: number | null = null;
let flowDeadlineAudioTime: number | null = null;
let flowClickCancel: (() => void) | null = null;

function stopFlowClock(): void {
  ++flowEpoch;
  if (flowTimeoutId !== null) window.clearTimeout(flowTimeoutId);
  flowTimeoutId = null;
  flowClickCancel?.();
  flowClickCancel = null;
  flowOnsetAudioTime = null;
  flowDeadlineAudioTime = null;
}

function armFlowClock(get: () => AppState, nextOnsetAudioTime?: number | null): void {
  stopFlowClock();
  const state = get();
  if (!state.isContinuousFlow || state.currentWorkspace !== 'trainer' || state.trainerPhase !== 'playing') return;
  const note = state.activeExerciseNotes[state.activeNoteIndex];
  if (!note) return;
  const epoch = flowEpoch;
  const audioTime = audioEngine.ensureAudioContext()?.currentTime ?? null;
  // The new slot begins at the preceding *planned* boundary, never at
  // a delayed JavaScript callback. Fresh sessions have a 40 ms lead-in.
  const onset = audioTime === null ? null :
    (nextOnsetAudioTime ?? (audioTime + 0.04));
  flowOnsetAudioTime = onset;
  flowDeadlineAudioTime = onset === null ? null : nextAudioDeadline(onset, note, state.bpm);
  flowClickCancel = audioEngine.scheduleMetronomeClick(
    startsMeasure(state.activeExerciseNotes, state.activeNoteIndex),
    onset ?? undefined
  );
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
  for (let i = 0; i < COUNT_IN_BEATS; i += 1) {
    countInClickCancels.push(audioEngine.scheduleMetronomeClick(i === 0,
      firstClickAudio === null ? undefined : firstClickAudio + i * beatSeconds));
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
      stopCountIn();
      set({ trainerPhase: 'playing', countInBeat: 0, noteShownTimestamp: performance.now() });
      armFlowClock(get, firstClickAudio === null ? undefined : firstClickAudio + COUNT_IN_BEATS * beatSeconds);
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
  const result = evaluateLessonCredit({
    previous: state.courseEvidence,
    noteCount: state.activeExerciseNotes.length,
    events: state.attemptEvents,
    assisted: state.isExerciseAssisted,
    targetRepetitions: lesson?.normReps ?? Infinity,
    requiredAccuracy: lesson?.normAcc ?? 100,
    maximumReactionMs: lesson?.normSpeed ?? 0,
    lessonActive: Boolean(lesson && lesson.id === state.selectedLessonId &&
      allowsAutomaticLessonCredit(lesson.id) &&
      canCreditLessonMode(lesson.id, state.courseEvidence.completedExercises, state.currentAppMode))
  });

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
    lessonPassed: result.passed
  });
  set({ courseEvidence: result.evidence, completedExercisesCount: result.creditedRepetitions,
    lastAttemptResult, trainerPhase: 'results' });
  if (lesson && result.credited) {
    const courseSeries = { ...get().courseSeries, [lesson.id]: result.evidence };
    set({ courseSeries });
    saveCourseSeriesToStorage(courseSeries);
  }
  if (lesson && result.passed && !state.completedLessons.includes(lesson.id)) {
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

  // Session-only state: never resume graded flow or restore fake results.
  completedLessons: [],
  courseSeries: {},
  activeLessonId: null,
  isContinuousFlow: false,
  isTwoHandPracticeOpen: false,
  isRepertoirePreviewOpen: false,
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
    set({ completedLessons: saved, courseSeries });
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
      studioSection: tab === 'trainer' ? 'practice' : state.studioSection,
      isTwoHandPracticeOpen: tab === 'trainer' ? state.isTwoHandPracticeOpen : false,
      twoHandTrialLessonId: tab === 'trainer' ? state.twoHandTrialLessonId : null,
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
    clearAllTwoHandShadowSeries();
    set({ completedLessons: [], courseSeries: {},
      courseEvidence: EMPTY_LESSON_EVIDENCE, completedExercisesCount: 0 });
  },

  startActiveLessonInTrainer: () => {
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
      countInBeat: 0,
      isTwoHandPracticeOpen: false,
      twoHandTrialLessonId: null,
      isTabletopMode: false
    });

    // regenerateExercise arms one deadline when the preset requests flow;
    // never flip an already explicitly assigned boolean.
    get().regenerateExercise();
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

  cancelTrainerCountIn: () => {
    if (get().trainerPhase !== 'countIn') return;
    stopCountIn();
    stopFlowClock();
    set({ trainerPhase: 'setup', countInBeat: 0 });
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
      activeLessonId: null,
      isContinuousFlow: false,
      isTabletopMode: false,
      trainerPhase: 'playing',
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
    set({ currentAppMode: mode, activeLessonId: null, isTwoHandPracticeOpen: false, twoHandTrialLessonId: null });
    get().regenerateExercise();
  },

  setClefFilter: (filter) => {
    set({ currentFilter: filter, activeLessonId: null });
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

  toggleTwoHandPractice: () => {
    const opening = !get().isTwoHandPracticeOpen;
    if (opening && !confirmAssessmentExit(get)) return;
    if (get().trainerPhase === 'countIn') get().cancelTrainerCountIn();
    // Never continue a timed course or credit an imagined MIDI trial.
    stopFlowClock();
    set({
      isTwoHandPracticeOpen: opening,
      twoHandTrialLessonId: null,
      isContinuousFlow: false,
      activeLessonId: null,
      completedExercisesCount: 0,
      isExerciseFlawless: false
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

  // Presentation-only: do not stop or restart the audio clock, MIDI or scoring.
  toggleZenMode: () => set((s) => ({ zenModeEnabled: !s.zenModeEnabled })),

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
      activeLessonId: null,
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
  },

  resetTrainerPreferences: () => {
    stopCountIn();
    stopFlowClock();
    audioEngine.clearPreviewTimeouts();
    audioEngine.setAudioEnabled(DEFAULT_TRAINER_PREFERENCES.audioEnabled);
    set({
      ...DEFAULT_TRAINER_PREFERENCES,
      isContinuousFlow: false,
      isTwoHandPracticeOpen: false,
      twoHandTrialLessonId: null,
      activeLessonId: null,
      completedExercisesCount: 0,
      courseEvidence: EMPTY_LESSON_EVIDENCE,
      isExerciseAssisted: false,
      isExerciseFlawless: true,
      attemptEvents: [],
      lastAttemptResult: null,
      trainerPhase: 'playing',
      countInBeat: 0
    });
    get().regenerateExercise();
  },

  clearLastAttemptResult: () => set({ lastAttemptResult: null }),

  retryExercise: () => {
    stopCountIn();
    stopFlowClock();
    if (photoTimerId !== null) window.clearTimeout(photoTimerId);
    photoTimerId = null;
    const notes = resetNotesForRetry(get().activeExerciseNotes);
    if (!notes.length) {
      set({ trainerPhase: 'playing' });
      get().regenerateExercise();
      return;
    }
    set({
      activeExerciseNotes: notes,
      activeNoteIndex: 0,
      noteShownTimestamp: performance.now(),
      lastTriggeredNote: null,
      lastKeyResult: null,
      isPhotoMasked: false,
      isExerciseAssisted: false,
      isExerciseFlawless: true,
      attemptEvents: [],
      lastAttemptResult: null,
      trainerPhase: get().isContinuousFlow ? 'countIn' : 'playing',
      countInBeat: 0
    });
    if (get().isContinuousFlow) beginTrainerCountIn(get, patch => set(patch));
    else if (get().currentAppMode === 'photo') get().triggerPhotoFlash();
  },

  returnToTrainerSetup: () => {
    stopCountIn();
    stopFlowClock();
    if (photoTimerId !== null) window.clearTimeout(photoTimerId);
    photoTimerId = null;
    set({ trainerPhase: 'setup', countInBeat: 0, lastAttemptResult: null, isPhotoMasked: false });
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
      activeLessonId, courseEvidence } = get();
    const exerciseMode = assessmentModeForLesson(activeLessonId,
      courseEvidence.completedExercises, currentAppMode);

    const notes = generateExerciseNotes({
      mode: exerciseMode,
      filter: currentFilter,
      tonality: currentTonality,
      scoreNoteCount,
      hanonType: currentHanonType
    });

    set({
      currentAppMode: exerciseMode,
      activeExerciseNotes: notes,
      activeNoteIndex: 0,
      noteShownTimestamp: performance.now(),
      isPhotoMasked: false,
      isExerciseAssisted: false,
      isExerciseFlawless: true,
      attemptEvents: [],
      lastAttemptResult: null,
      trainerPhase: get().trainerPhase === 'setup' || get().trainerPhase === 'precheck' ? get().trainerPhase : 'playing',
      countInBeat: 0
    });
    armFlowClock(get);

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
    const rt = isContinuousFlow && flowOnsetAudioTime !== null && audioNow !== null
      ? Math.max(0, Math.round((audioNow - flowOnsetAudioTime) * 1000))
      : Math.round(performance.now() - noteShownTimestamp);
    // Late judgments use the same monotonic AudioContext clock as the
    // deadline / click scheduling, not an unrelated setTimeout wakeup.
    const isLate = isContinuousFlow && (
      flowDeadlineAudioTime !== null && audioNow !== null
        ? audioNow >= flowDeadlineAudioTime
        : rt >= noteDurationMs(target, get().bpm)
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
