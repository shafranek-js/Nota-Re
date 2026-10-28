import type {
  AppMode, FilterType, HanonType, SpeechType, TonalityKey
} from '../../types/music';

export const TRAINER_PREFERENCES_KEY = 'notare-trainer-preferences-v1';
const SCHEMA_VERSION = 1;

export interface TrainerPreferences {
  selectedLessonId: number;
  currentAppMode: AppMode;
  currentFilter: FilterType;
  currentTonality: TonalityKey;
  currentHanonType: HanonType;
  speechSuppressor: SpeechType;
  scoreNoteCount: number;
  bpm: number;
  isBlindfolded: boolean;
  isTabletopMode: boolean;
  showBassLandmarks: boolean;
  showScaleHighlight: boolean;
  photoExposureMs: number;
  audioEnabled: boolean;
}

export const DEFAULT_TRAINER_PREFERENCES: TrainerPreferences = {
  selectedLessonId: 1,
  currentAppMode: 'reflex',
  currentFilter: 'treble',
  currentTonality: 'C',
  currentHanonType: 'hanon1',
  speechSuppressor: 'count',
  scoreNoteCount: 16,
  bpm: 60,
  isBlindfolded: false,
  isTabletopMode: false,
  showBassLandmarks: false,
  showScaleHighlight: false,
  photoExposureMs: 1800,
  audioEnabled: true
};

const MODES: readonly AppMode[] = [
  'reflex', 'rhythm', 'lookahead', 'photo', 'intervals', 'gpattern', 'blind', 'hanon'
];
const FILTERS: readonly FilterType[] = ['treble', 'treble_oct2', 'bass', 'both'];
const TONALITIES: readonly TonalityKey[] = ['C', 'G', 'F', 'D'];
const HANON: readonly HanonType[] = ['hanon1', 'hanon2', 'groups4', 'coord'];
const SPEECH: readonly SpeechType[] = ['count', 'tata', 'syllables', 'solfege'];

function oneOf<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === 'string' && choices.includes(value as T) ? value as T : fallback;
}
function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** Never trust a value from localStorage: reject invalid fields independently. */
export function validateTrainerPreferences(input: unknown): TrainerPreferences {
  const data = objectOrNull(input) ?? {};
  const defaults = DEFAULT_TRAINER_PREFERENCES;
  const selectedLessonId = Number.isInteger(data.selectedLessonId) &&
    (data.selectedLessonId as number) >= 1 && (data.selectedLessonId as number) <= 12
      ? data.selectedLessonId as number : defaults.selectedLessonId;
  const bpm = Number.isInteger(data.bpm) && (data.bpm as number) >= 40 &&
    (data.bpm as number) <= 130 ? data.bpm as number : defaults.bpm;
  return {
    selectedLessonId,
    currentAppMode: oneOf(data.currentAppMode, MODES, defaults.currentAppMode),
    currentFilter: oneOf(data.currentFilter, FILTERS, defaults.currentFilter),
    currentTonality: oneOf(data.currentTonality, TONALITIES, defaults.currentTonality),
    currentHanonType: oneOf(data.currentHanonType, HANON, defaults.currentHanonType),
    speechSuppressor: oneOf(data.speechSuppressor, SPEECH, defaults.speechSuppressor),
    scoreNoteCount: data.scoreNoteCount === 8 || data.scoreNoteCount === 16
      ? data.scoreNoteCount : defaults.scoreNoteCount,
    bpm,
    isBlindfolded: booleanOr(data.isBlindfolded, defaults.isBlindfolded),
    isTabletopMode: booleanOr(data.isTabletopMode, defaults.isTabletopMode),
    showBassLandmarks: booleanOr(data.showBassLandmarks, defaults.showBassLandmarks),
    showScaleHighlight: booleanOr(data.showScaleHighlight, defaults.showScaleHighlight),
    photoExposureMs: data.photoExposureMs === 1100 ||
      data.photoExposureMs === 1800 || data.photoExposureMs === 2400
      ? data.photoExposureMs : defaults.photoExposureMs,
    audioEnabled: booleanOr(data.audioEnabled, defaults.audioEnabled)
  };
}

export function selectTrainerPreferences(state: TrainerPreferences): TrainerPreferences {
  return {
    selectedLessonId: state.selectedLessonId,
    currentAppMode: state.currentAppMode,
    currentFilter: state.currentFilter,
    currentTonality: state.currentTonality,
    currentHanonType: state.currentHanonType,
    speechSuppressor: state.speechSuppressor,
    scoreNoteCount: state.scoreNoteCount,
    bpm: state.bpm,
    isBlindfolded: state.isBlindfolded,
    isTabletopMode: state.isTabletopMode,
    showBassLandmarks: state.showBassLandmarks,
    showScaleHighlight: state.showScaleHighlight,
    photoExposureMs: state.photoExposureMs,
    audioEnabled: state.audioEnabled
  };
}

/**
 * Only the explicitly versioned preferences object is restored.
 * Running flow, active course exam, last pitch and session statistics are
 * intentionally never serialized; refreshing cannot create a free pass.
 */
export function loadTrainerPreferences(): TrainerPreferences {
  try {
    const raw = localStorage.getItem(TRAINER_PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_TRAINER_PREFERENCES };
    const envelope = objectOrNull(JSON.parse(raw));
    if (envelope?.version !== SCHEMA_VERSION) return { ...DEFAULT_TRAINER_PREFERENCES };
    return validateTrainerPreferences(envelope.preferences);
  } catch {
    return { ...DEFAULT_TRAINER_PREFERENCES };
  }
}

export function saveTrainerPreferences(state: TrainerPreferences): void {
  try {
    localStorage.setItem(TRAINER_PREFERENCES_KEY, JSON.stringify({
      version: SCHEMA_VERSION, preferences: validateTrainerPreferences(selectTrainerPreferences(state))
    }));
  } catch {
    // Storage may be blocked or full; the live trainer still works.
  }
}

export function clearTrainerPreferences(): void {
  try { localStorage.removeItem(TRAINER_PREFERENCES_KEY); }
  catch { /* private browsing or blocked storage */ }
}
