import type { ExercisePitch, SupportedKey } from './musicXml';
import { createScoreFromExercise, toMusicXml } from './musicXml';

/** A shared download boundary for both free Studio and a locked course preset. */
export function downloadExerciseMusicXml(
  notes: readonly ExercisePitch[],
  tonality: SupportedKey,
  mode: string
): void {
  const score = createScoreFromExercise(notes, tonality, 'Nota-Re - ' + mode + ' exercise');
  const xml = toMusicXml(score, { includeFingering: mode === 'hanon' });
  const blob = new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = 'notare-' + mode + '.musicxml';
    document.body.appendChild(link);
    try { link.click(); } finally { link.remove(); }
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
