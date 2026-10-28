import { create } from 'zustand';
import { AppMode, ExerciseNote, FilterType, HanonType, SpeechType, TonalityKey } from '../types/music';
import { COURSE_CURRICULUM } from '../data/curriculum';
import { audioEngine } from '../core/audio/AudioEngine';
import { MIDI_NOTE_MAP } from '../data/notes';
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
  advanceFlowStep: () => void;
}

let photoTimerId: number | null = null;
let flowIntervalId: number | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  currentWorkspace: 'course',
  isSettingsOpen: false,

  selectedLessonId: 1,
  completedLessons: [],

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
    set({ currentWorkspace: tab });
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
      currentWorkspace: 'trainer'
    });

    get().regenerateExercise();

    if (lesson.preset.flow) {
      get().toggleContinuousFlow();
    }
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
    set({ currentAppMode: mode });
    get().regenerateExercise();
  },

  setClefFilter: (filter) => {
    set({ currentFilter: filter });
    get().regenerateExercise();
  },

  changeTonality: (tonality) => {
    set({ currentTonality: tonality });
    get().regenerateExercise();
  },

  setHanonType: (type) => {
    set({ currentHanonType: type });
    get().regenerateExercise();
  },

  setSpeechSuppressor: (speech) => {
    set({ speechSuppressor: speech });
  },

  cycleSpeechSuppressor: () => {
    const modes: SpeechType[] = ['count', 'tata', 'syllables', 'solfege'];
    const { speechSuppressor } = get();
    const nextIdx = (modes.indexOf(speechSuppressor) + 1) % modes.length;
    set({ speechSuppressor: modes[nextIdx] });
  },

  toggleScoreDensity: () => {
    const nextCount = get().scoreNoteCount === 16 ? 8 : 16;
    set({ scoreNoteCount: nextCount });
    get().regenerateExercise();
  },

  setBpm: (bpm) => {
    set({ bpm });
    if (get().isContinuousFlow) {
      if (flowIntervalId) clearInterval(flowIntervalId);
      const intervalMs = (60 / bpm) * 1000;
      flowIntervalId = window.setInterval(() => {
        get().advanceFlowStep();
      }, intervalMs);
    }
  },

  toggleContinuousFlow: () => {
    const nextState = !get().isContinuousFlow;
    set({ isContinuousFlow: nextState });

    if (flowIntervalId) {
      clearInterval(flowIntervalId);
      flowIntervalId = null;
    }

    if (nextState) {
      const { bpm } = get();
      const intervalMs = (60 / bpm) * 1000;
      flowIntervalId = window.setInterval(() => {
        get().advanceFlowStep();
      }, intervalMs);
    }
  },

  advanceFlowStep: () => {
    const { activeNoteIndex, activeExerciseNotes, bpm } = get();
    const isStrongBeat = activeNoteIndex % 4 === 0;
    audioEngine.playMetronomeClick(isStrongBeat);

    const target = activeExerciseNotes[activeNoteIndex];
    if (target) {
      target.status = 'missed';
    }

    const nextIdx = activeNoteIndex + 1;
    if (nextIdx >= activeExerciseNotes.length) {
      set((s) => ({
        completedExercisesCount: s.completedExercisesCount + 1,
        activeNoteIndex: 0
      }));
      get().regenerateExercise();
    } else {
      activeExerciseNotes[nextIdx].status = 'current';
      set({ 
        activeNoteIndex: nextIdx,
        noteShownTimestamp: performance.now()
      });
      if (get().currentAppMode === 'photo') {
        const prevBar = Math.floor(activeNoteIndex / 4);
        const newBar = Math.floor(nextIdx / 4);
        if (newBar !== prevBar) {
          get().triggerPhotoFlash();
        }
      }
    }
  },

  toggleBlindfoldKeys: () => {
    set((s) => ({ isBlindfolded: !s.isBlindfolded }));
  },

  toggleTabletopMode: () => {
    set((s) => ({ isTabletopMode: !s.isTabletopMode }));
  },

  toggleBassLandmarks: () => {
    set((s) => ({ showBassLandmarks: !s.showBassLandmarks }));
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
      isPhotoMasked: false
    });

    if (currentAppMode === 'photo') {
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
      const newReactionTimes = (isCorrect && rt > 40 && rt < 6000) 
        ? [...s.reactionTimes, rt] 
        : s.reactionTimes;

      return {
        totalAttempts: newTotal,
        correctHits: newCorrect,
        currentStreak: newStreak,
        bestStreak: newBestStreak,
        reactionTimes: newReactionTimes,
        lastTriggeredNote: noteName,
        lastKeyResult: { noteName, isCorrect }
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
        const nextCompletedEx = get().completedExercisesCount + 1;
        set({ completedExercisesCount: nextCompletedEx });

        // Проверка сдачи норматива урока курса
        const lesson = COURSE_CURRICULUM.find(l => l.id === selectedLessonId);
        if (lesson) {
          const { totalAttempts, correctHits, reactionTimes } = get();
          const acc = totalAttempts > 0 ? Math.round((correctHits / totalAttempts) * 100) : 100;
          const avgSpeed = reactionTimes.length > 0
            ? Math.round(reactionTimes.slice(-15).reduce((a, b) => a + b, 0) / Math.min(15, reactionTimes.length))
            : 500;

          if (nextCompletedEx >= lesson.normReps && acc >= lesson.normAcc && avgSpeed <= lesson.normSpeed) {
            if (!completedLessons.includes(lesson.id)) {
              const updated = [...completedLessons, lesson.id];
              saveCourseProgressToStorage(updated);
              set({ completedLessons: updated });
            }
          }
        }

        window.setTimeout(() => get().regenerateExercise(), 160);
      } else {
        activeExerciseNotes[nextIdx].status = 'current';
        set({
          activeNoteIndex: nextIdx,
          noteShownTimestamp: performance.now()
        });

        if (get().currentAppMode === 'photo' && newBar !== prevBar) {
          get().triggerPhotoFlash();
        }
      }
    } else {
      if (isContinuousFlow) {
        target.status = 'missed';
        const nextIdx = activeNoteIndex + 1;
        if (nextIdx >= activeExerciseNotes.length) {
          set((s) => ({ completedExercisesCount: s.completedExercisesCount + 1 }));
          window.setTimeout(() => get().regenerateExercise(), 160);
        } else {
          activeExerciseNotes[nextIdx].status = 'current';
          set({
            activeNoteIndex: nextIdx,
            noteShownTimestamp: performance.now()
          });
        }
      }
    }
  }
}));
