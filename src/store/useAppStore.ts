import { create } from 'zustand';
import { AppMode, ExerciseNote, FilterType, HanonType, SpeechType, TonalityKey } from '../types/music';
import { COURSE_CURRICULUM } from '../data/curriculum';
import { audioEngine } from '../core/audio/AudioEngine';
import { MIDI_NOTE_MAP } from '../data/notes';
import { noteDurationMs, startsMeasure, evaluateLessonCredit } from '../core/training/flowTiming';
import { midiManager } from '../core/midi/MidiManager';
import { generateExerciseNotes } from '../core/generator/ExerciseGenerator';
import { 
  loadCourseProgressFromStorage, 
  saveCourseProgressToStorage, 
  clearCourseProgressFromStorage 
} from '../core/storage/progressStorage';

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
  toggleBassLandmarks: () => void;
  toggleScaleHighlight: () => void;
  setPhotoExposure: (ms: number) => void;
  triggerPhotoFlash: () => void;
  toggleAudioMaster: () => void;
  resetSessionStats: () => void;
  regenerateExercise: () => void;
  handleUserTriggerNote: (noteName: string, fromMidi?: boolean) => void;
  advanceAssistedStep: () => void;
  advanceFlowStep: () => void;
}

let photoTimerId: number | null = null;
let flowTimeoutId: number | null = null;
let flowEpoch = 0;

function stopFlowClock(): void {
  ++flowEpoch;
  if (flowTimeoutId !== null) window.clearTimeout(flowTimeoutId);
  flowTimeoutId = null;
}

function armFlowClock(get: () => AppState): void {
  stopFlowClock();
  const state = get();
  if (!state.isContinuousFlow || state.currentWorkspace !== 'trainer') return;
  const note = state.activeExerciseNotes[state.activeNoteIndex];
  if (!note) return;
  const epoch = flowEpoch;
  flowTimeoutId = window.setTimeout(() => {
    if (flowEpoch !== epoch) return;
    flowTimeoutId = null;
    get().advanceFlowStep();
  }, noteDurationMs(note, state.bpm));
}

export const useAppStore = create<AppState>((set, get) => ({
  currentWorkspace: 'course',
  isSettingsOpen: false,

  selectedLessonId: 1,
  completedLessons: [],
  activeLessonId: null,

  currentAppMode: 'reflex',
  currentFilter: 'treble',
  currentTonality: 'C',
  currentHanonType: 'hanon1',
  speechSuppressor: 'count',
  scoreNoteCount: 16,
  bpm: 60,
  isContinuousFlow: false,
  isBlindfolded: false,
  isTabletopMode: false,
  showBassLandmarks: false,
  showScaleHighlight: false,
  photoExposureMs: 1800,
  isPhotoMasked: false,

  audioEnabled: true,
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

  initApp: () => {
    const saved = loadCourseProgressFromStorage();
    set({ completedLessons: saved });

    const unlistenPorts = midiManager.onPortsChange(count => set({ midiInputsCount: count }));
    const unlistenEvents = midiManager.onMidiEvent(event => {
      switch (event.type) {
        case 'note-on': {
          // Physical keys sound until actual Note Off. Only Note On affects
          // sight-reading scoring; no second fixed-duration preview sound.
          audioEngine.midiNoteOn(event.channel, event.note, event.velocity);
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

    get().regenerateExercise();
    return () => {
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
      isContinuousFlow: tab === 'trainer' ? state.isContinuousFlow : false
    }));
  },

  toggleSettingsDrawer: () => {
    set((state) => ({ isSettingsOpen: !state.isSettingsOpen }));
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
    set({ currentAppMode: mode, activeLessonId: null });
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
    set({ bpm, activeLessonId: null });
    if (get().isContinuousFlow) armFlowClock(get);
  },

  toggleContinuousFlow: () => {
    const enabled = !get().isContinuousFlow;
    set({ isContinuousFlow: enabled, activeLessonId: null });
    if (enabled) armFlowClock(get);
    else stopFlowClock();
  },

  advanceFlowStep: () => {
    const state = get();
    if (!state.isContinuousFlow || state.currentWorkspace !== 'trainer') return;
    const { activeNoteIndex, activeExerciseNotes } = state;
    const target = activeExerciseNotes[activeNoteIndex];
    if (!target) return;
    stopFlowClock();
    audioEngine.playMetronomeClick(startsMeasure(activeExerciseNotes, activeNoteIndex));

    // A deadline with no keypress is one real missed answer. It resets the
    // consecutive-repetition count; the clock must not grant a pass for silence.
    const nextNotes = activeExerciseNotes.map((note, index) =>
      index === activeNoteIndex ? { ...note, status: 'missed' as const }
        : index === activeNoteIndex + 1 ? { ...note, status: 'current' as const }
        : note
    );
    set({
      activeExerciseNotes: nextNotes,
      totalAttempts: state.totalAttempts + 1,
      currentStreak: 0,
      completedExercisesCount: 0,
      isExerciseFlawless: false,
      lastKeyResult: null
    });

    const nextIndex = activeNoteIndex + 1;
    if (nextIndex >= activeExerciseNotes.length) {
      get().regenerateExercise();
      return;
    }
    set({ activeNoteIndex: nextIndex, noteShownTimestamp: performance.now() });
    if (get().currentAppMode === 'photo' &&
        Math.floor(activeExerciseNotes.slice(0, nextIndex).reduce((sum,n) => sum+n.durMultiplier,0) / 4) !==
        Math.floor(activeExerciseNotes.slice(0, activeNoteIndex).reduce((sum,n) => sum+n.durMultiplier,0) / 4)) {
      get().triggerPhotoFlash();
    }
    armFlowClock(get);
  },

  toggleBlindfoldKeys: () => {
    set((s) => ({ isBlindfolded: !s.isBlindfolded, activeLessonId: null }));
  },

  toggleTabletopMode: () => {
    set((s) => ({ isTabletopMode: !s.isTabletopMode, activeLessonId: null }));
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

  resetSessionStats: () => {
    set({
      totalAttempts: 0,
      correctHits: 0,
      currentStreak: 0,
      completedExercisesCount: 0,
      reactionTimes: [],
      lastTriggeredNote: null,
      lastKeyResult: null
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
      isExerciseFlawless: true
    });
    armFlowClock(get);

    if (currentAppMode === 'photo') {
      get().triggerPhotoFlash();
    }
  },

  // Tabletop/imagined play is pedagogical practice, not a scored answer.
  advanceAssistedStep: () => {
    const { activeExerciseNotes, activeNoteIndex } = get();
    const target = activeExerciseNotes[activeNoteIndex];
    if (!target) return;
    audioEngine.playPianoTone(target.freq, 0.25, target.articulation === 'staccato');
    target.status = 'done';
    const nextIndex = activeNoteIndex + 1;
    if (nextIndex >= activeExerciseNotes.length) {
      set({ isExerciseAssisted: true, isExerciseFlawless: false, completedExercisesCount: 0 });
      window.setTimeout(() => get().regenerateExercise(), 160);
      return;
    }
    activeExerciseNotes[nextIndex].status = 'current';
    set({
      activeNoteIndex: nextIndex,
      noteShownTimestamp: performance.now(),
      isExerciseAssisted: true,
      isExerciseFlawless: false,
      completedExercisesCount: 0
    });
    if (get().isContinuousFlow) armFlowClock(get);
    if (get().currentAppMode === 'photo' &&
        Math.floor(nextIndex / 4) !== Math.floor(activeNoteIndex / 4)) {
      get().triggerPhotoFlash();
    }
  },

  handleUserTriggerNote: (noteName, fromMidi = false) => {
    const { 
      activeExerciseNotes, 
      activeNoteIndex, 
      noteShownTimestamp, 
      selectedLessonId,
      completedLessons,
      isContinuousFlow
    } = get();

    const target = activeExerciseNotes[activeNoteIndex];
    if (!target) return;

    // Звук того, что действительно сыграл пользователь, а не целевой ноты.
    // При ошибке слуховая обратная связь должна соответствовать вводу.
    const played = MIDI_NOTE_MAP[noteName];
    if (played && !fromMidi) audioEngine.playPianoTone(played.freq, 0.5, target.articulation === 'staccato');

    const isCorrect = noteName === target.noteName;
    const rt = Math.round(performance.now() - noteShownTimestamp);

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
        isExerciseFlawless: s.isExerciseFlawless && isCorrect,
        completedExercisesCount: !isCorrect ? 0 : s.completedExercisesCount
      };
    });

    // Очистка индикатора через 150мс
    window.setTimeout(() => {
      set({ lastKeyResult: null });
    }, 150);

    if (isCorrect) {
      target.status = 'done';
      const prevBar = Math.floor(activeNoteIndex / 4);
      const nextIdx = activeNoteIndex + 1;
      const newBar = Math.floor(nextIdx / 4);

      if (nextIdx >= activeExerciseNotes.length) {
        const lesson = COURSE_CURRICULUM.find(l => l.id === get().activeLessonId);
        const result = evaluateLessonCredit({
          clean: get().isExerciseFlawless,
          assisted: get().isExerciseAssisted,
          completedBefore: get().completedExercisesCount,
          targetRepetitions: lesson?.normReps ?? Infinity,
          totalAttempts: get().totalAttempts,
          correctHits: get().correctHits,
          reactionTimes: get().reactionTimes,
          requiredAccuracy: lesson?.normAcc ?? 100,
          maximumReactionMs: lesson?.normSpeed ?? 0,
          lessonActive: Boolean(lesson && lesson.id === selectedLessonId)
        });
        set({ completedExercisesCount: result.creditedRepetitions });

        if (lesson && result.passed && !completedLessons.includes(lesson.id)) {
          const updated = [...completedLessons, lesson.id];
          saveCourseProgressToStorage(updated);
          set({ completedLessons: updated });
        }

        stopFlowClock();
        // The next sequence should not overwrite a newly selected exercise
        // from an obsolete completion callback.
        get().regenerateExercise();
      } else {
        activeExerciseNotes[nextIdx].status = 'current';
        set({
          activeNoteIndex: nextIdx,
          noteShownTimestamp: performance.now()
        });
        if (isContinuousFlow) armFlowClock(get);

        if (get().currentAppMode === 'photo' && newBar !== prevBar) {
          get().triggerPhotoFlash();
        }
      }
    } else {
      if (isContinuousFlow) {
        stopFlowClock();
        const nextIdx = activeNoteIndex + 1;
        const updatedNotes = activeExerciseNotes.map((note, index) =>
          index === activeNoteIndex ? { ...note, status: 'missed' as const }
            : index === nextIdx ? { ...note, status: 'current' as const }
            : note
        );
        set({ activeExerciseNotes: updatedNotes });
        if (nextIdx >= activeExerciseNotes.length) {
          get().regenerateExercise();
        } else {
          set({ activeNoteIndex: nextIdx, noteShownTimestamp: performance.now() });
          armFlowClock(get);
        }
      }
    }
  }
}));
