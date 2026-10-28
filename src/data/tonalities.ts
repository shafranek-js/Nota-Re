import { TonalityConfig, TonalityKey } from '../types/music';

export const TONALITY_CONFIG: Record<TonalityKey, TonalityConfig> = {
  'C': { 
    name: 'C-dur / a-moll', 
    signs: [], 
    scaleNotes: ['C','D','E','F','G','A','B'] 
  },
  'G': { 
    name: 'G-dur / e-moll (1♯)', 
    signs: [{ type: '♯', trebleY: 45, bassY: 193 }], 
    scaleNotes: ['C','D','E','F#','G','A','B'] 
  },
  'F': { 
    name: 'F-dur / d-moll (1♭)', 
    signs: [{ type: '♭', trebleY: 80, bassY: 228 }], 
    scaleNotes: ['C','D','E','F','G','A','A#'] 
  },
  'D': { 
    name: 'D-dur / h-moll (2♯)', 
    signs: [
      { type: '♯', trebleY: 45, bassY: 193 }, 
      { type: '♯', trebleY: 71, bassY: 219 }
    ], 
    scaleNotes: ['C#','D','E','F#','G','A','B'] 
  }
};
