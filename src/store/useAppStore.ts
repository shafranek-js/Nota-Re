import { create } from 'zustand';
import { AppMode, ExerciseNote, FilterType, HanonType, SpeechType, TonalityKey } from '../types/music';
import { COURSE_CURRICULUM } from '../data/curriculum';
import { audioEngine } from '../core/audio/AudioEngine';
import { MIDI_NOTE_MAP } from '../data/notes';
import {
  noteDurationMs, startsMeasure, evaluateLessonCredit,
  nextAudioDeadline, remainingAudioMs
} from '../core/training/flowTiming';
import { midiManager } from '../core/midi/MidiManager';
import { advanceExerciseNoteStatuses } from '../core/training/assistedStep';
import { invalidateInterruptedTimedLesson } from '../core/training/flowInterruption';
import { createAttemptSnapshot } from '../core/training/exerciseAttempt';
import type { AttemptEvent, AttemptSnapshot } from '../core/training/exerciseAttempt';
import { generateExerciseNotes } from '../core/generator/ExerciseGenerator';
import { 
  loadCourseProgressFromStorage, 
  saveCourseProgressToStorage, 
  clearCourseProgressFromStorage 
} from '../core/storage/progressStorage';
import {
  DEFAULT_TRAINER_PREFERENCES, loadTrainerPreferences,
  saveTrainerPreferences, selectTrainerPreferences
} from '../core/storage/trainerPreferences';

export type WorkspaceTab = 'course' | 'trainer' | 'precheck' | 'lab' | 'theory';

const MIDI_PITCH_NAMES = new Map(Object.entries(MIDI_NOTE_MAP).map(([name, note]) => [note.midi, name]));

export interface AppState {
  // Навигация и модалки
  currentWorkspace: WorkspaceTab;
  isSettingsOpen: boolean;

  // Курс
  selectedLessonId: number;
  completedLessons: number[];
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
  showBassLandmarks: boolean;
  showScaleHighlight: boolean;
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

  // Методы управления
  initApp: () => () => void;
  switchWorkspace: (tab: WorkspaceTab) => void;
  toggleSettingsDrawer: () => void;
  selectCourseLesson: (id: number) => void;
  selectPrevCourseLesson: () => void;
  selectNextCourseLesson: () => void;
  toggleLessonCompleted: (id: number) => void;
  resetCourseProgress: () => void;
  startActiveLessonInTrainer: () => void;
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
  toggleBassLandmarks: () => void;
  toggleScaleHighlight: () => void;
  setPhotoExposure: (ms: number) => void;
  triggerPhotoFlash: () => void;
  toggleAudioMaster: () => void;
  resetSessionStats: () => void;
  clearLastAttemptResult: () => void;
  resetTrainerPreferences: () => void;
  regenerateExercise: () => void;
  handleUserTriggerNote: (noteName: string, fromMidi?: boolean) => void;
  advanceAssistedStep: () => void;
  advanceFlowStep: () => void;
}

let photoTimerId: number | null = null;
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
  if (!state.isContinuousFlow || state.currentWorkspace !== 'trainer') return;
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

function finishExercise(
  get: () => AppState,
  set: (patch: Partial<AppState>) => void
): void {
  const state = get();
  const lesson = COURSE_CURRICULUM.find(item => item.id === state.activeLessonId);
  const result = evaluateLessonCredit({
    clean: state.isExerciseFlawless,
    assisted: state.isExerciseAssisted,
    completedBefore: state.completedExercisesCount,
    targetRepetitions: lesson?.normReps ?? Infinity,
    totalAttempts: state.totalAttempts,
    correctHits: state.correctHits,
    reactionTimes: state.reactionTimes,
    requiredAccuracy: lesson?.normAcc ?? 100,
    maximumReactionMs: lesson?.normSpeed ?? 0,
    lessonActive: Boolean(lesson && lesson.id === state.selectedLessonId)
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
  set({ completedExercisesCount: result.creditedRepetitions, lastAttemptResult });
  if (lesson && result.passed && !state.completedLessons.includes(lesson.id)) {
    const completedLessons = [...state.completedLessons, lesson.id];
    saveCourseProgressToStorage(completedLessons);
    set({ completedLessons });
  }

  stopFlowClock();
  get().regenerateExercise();
}

export const useAppStore = create<AppState>((set, get) => ({
  currentWorkspace: 'course',
  isSettingsOpen: false,

  // All user preference keys live in the versioned, validated snapshot.
  ...loadTrainerPreferences(),

  // Session-only state: never resume graded flow or restore fake results.
  completedLessons: [],
  activeLessonId: null,
  isContinuousFlow: false,
  isTwoHandPracticeOpen: false,
  isPhotoMasked: false,
  midiInputsCount: 0,

  totalAttempts: 0,
  correctHits: 0,
  currentStreak: 0,
  bestStreak: 0,
  completedExercisesCount: 0,
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

  initApp: () => {
    const saved = loadCourseProgressFromStorage();
    set({ completedLessons: saved });
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
          audioEngine.midiNoteOn(event.channel, event.note, event.velocity, event.receivedAtMs);
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
      if (document.hidden && get().isContinuousFlow) {
        stopFlowClock();
        set(invalidateInterruptedTimedLesson());
      }
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);

    get().regenerateExercise();
    return () => {
      document.removeEventListener('visibilitychange', pauseWhenHidden);
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

  switchWorkspace: (tab) => {
    // No hidden metronome deadlines or missed answers while reading the course.
    if (tab !== 'trainer') stopFlowClock();
    set(state => ({
      currentWorkspace: tab,
      isTwoHandPracticeOpen: tab === 'trainer' ? state.isTwoHandPracticeOpen : false,
      isContinuousFlow: tab === 'trainer' ? state.isContinuousFlow : false,
      activeLessonId: tab === 'trainer' ? state.activeLessonId : null
    }));
  },

  toggleSettingsDrawer: () => {
    const opening = !get().isSettingsOpen;
    // Opening a modal must not silently grade missed notes while the player
    // is checking their MIDI hardware or audio settings.
    if (opening) stopFlowClock();
    const interruptedFlow = opening && get().isContinuousFlow;
    set({
      isSettingsOpen: opening,
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
    set({ completedLessons: [] });
  },

  startActiveLessonInTrainer: () => {
    stopFlowClock();
    const { selectedLessonId } = get();
    const lesson = COURSE_CURRICULUM.find(l => l.id === selectedLessonId) || COURSE_CURRICULUM[0];
    
    get().resetSessionStats();

    set({
      currentTonality: lesson.preset.tonality,
      currentFilter: lesson.preset.filter,
      bpm: lesson.preset.bpm,
      speechSuppressor: lesson.preset.speech,
      isBlindfolded: lesson.preset.blind,
      showBassLandmarks: lesson.preset.bassLandmarks,
      isContinuousFlow: lesson.preset.flow,
      currentAppMode: lesson.preset.mode,
      currentWorkspace: 'trainer',
      activeLessonId: lesson.id,
      isTwoHandPracticeOpen: false,
      isTabletopMode: false
    });

    // regenerateExercise arms one deadline when the preset requests flow;
    // never flip an already explicitly assigned boolean.
    get().regenerateExercise();
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
    set({ currentAppMode: mode, activeLessonId: null, isTwoHandPracticeOpen: false });
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
    set({ bpm, activeLessonId: null, noteShownTimestamp: performance.now() });
    if (get().isContinuousFlow) armFlowClock(get);
  },

  toggleContinuousFlow: () => {
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
    if (!state.isContinuousFlow || state.currentWorkspace !== 'trainer') return;
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
      completedExercisesCount: unanswered ? 0 : state.completedExercisesCount,
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
    set(state => ({
      isTabletopMode: entering,
      ...(entering ? invalidateInterruptedTimedLesson() : {}),
      activeLessonId: null
    }));
  },

  toggleTwoHandPractice: () => {
    const opening = !get().isTwoHandPracticeOpen;
    // Never continue a timed course or credit an imagined MIDI trial.
    stopFlowClock();
    set({
      isTwoHandPracticeOpen: opening,
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
    stopFlowClock();
    audioEngine.clearPreviewTimeouts();
    audioEngine.setAudioEnabled(DEFAULT_TRAINER_PREFERENCES.audioEnabled);
    set({
      ...DEFAULT_TRAINER_PREFERENCES,
      isContinuousFlow: false,
      isTwoHandPracticeOpen: false,
      activeLessonId: null,
      completedExercisesCount: 0,
      isExerciseAssisted: false,
      isExerciseFlawless: true,
      attemptEvents: [],
      lastAttemptResult: null
    });
    get().regenerateExercise();
  },

  clearLastAttemptResult: () => set({ lastAttemptResult: null }),

  resetSessionStats: () => {
    set({
      totalAttempts: 0,
      correctHits: 0,
      currentStreak: 0,
      completedExercisesCount: 0,
      reactionTimes: [],
      lastTriggeredNote: null,
      lastKeyResult: null,
      attemptEvents: [],
      lastAttemptResult: null
    });
  },

  regenerateExercise: () => {
    audioEngine.clearPreviewTimeouts();
    const { currentAppMode, currentFilter, currentTonality, scoreNoteCount, currentHanonType } = get();

    const notes = generateExerciseNotes({
      mode: currentAppMode,
      filter: currentFilter,
      tonality: currentTonality,
      scoreNoteCount,
      hanonType: currentHanonType
    });

    set({
      activeExerciseNotes: notes,
      activeNoteIndex: 0,
      noteShownTimestamp: performance.now(),
      isPhotoMasked: false,
      isExerciseAssisted: false,
      isExerciseFlawless: true,
      attemptEvents: []
    });
    armFlowClock(get);

    if (currentAppMode === 'photo') {
      get().triggerPhotoFlash();
    }
  },

  // Tabletop/imagined play is pedagogical practice, not a scored answer.
  advanceAssistedStep: () => {
    if (get().currentWorkspace !== 'trainer' || get().isSettingsOpen || get().isTwoHandPracticeOpen) return;
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
        completedExercisesCount: 0,
        attemptEvents,
        lastAttemptResult
      });
      window.setTimeout(() => {
        if (get().activeExerciseNotes === notes) get().regenerateExercise();
      }, 160);
      return;
    }
    set({
      activeExerciseNotes: notes,
      activeNoteIndex: nextIndex,
      noteShownTimestamp: performance.now(),
      isExerciseAssisted: true,
      isExerciseFlawless: false,
      completedExercisesCount: 0,
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
    if (get().currentWorkspace !== 'trainer' || get().isSettingsOpen || get().isTwoHandPracticeOpen) return;
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
    const isCorrect = noteName === target.noteName && !isLate;

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
          outcome: isCorrect ? 'correct' as const
            : isLate && noteName === target.noteName ? 'late' as const
              : 'wrong-pitch' as const,
          reactionMs: Number.isFinite(rt) && rt >= 0 ? rt : null
        }],
        isExerciseFlawless: s.isExerciseFlawless && isCorrect,
        completedExercisesCount: !isCorrect ? 0 : s.completedExercisesCount
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
