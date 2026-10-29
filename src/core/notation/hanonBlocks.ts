/** Hanon grouping for teaching overlays; engraving stays OSMD's responsibility. */
export interface HanonBlockNote {
  readonly group4?: number;
}

export interface HanonBlock {
  readonly firstIndex: number;
  readonly lastIndex: number;
  readonly number: number;
}

/**
 * Prefer the generator's explicit four-note group label. Missing or malformed
 * labels fall back to the original four-note grouping so old exercises work.
 * Never join disjoint runs just because their group numbers match.
 */
export function getHanonBlocks(notes: readonly HanonBlockNote[]): HanonBlock[] {
  const blocks: HanonBlock[] = [];
  notes.forEach((note, index) => {
    const number = note.group4 !== undefined &&
      Number.isSafeInteger(note.group4) && note.group4 > 0
      ? note.group4 : Math.floor(index / 4) + 1;
    const last = blocks[blocks.length - 1];
    if (last && last.number === number && last.lastIndex === index - 1) {
      blocks[blocks.length - 1] = { ...last, lastIndex: index };
    } else {
      blocks.push({ number, firstIndex: index, lastIndex: index });
    }
  });
  return blocks;
}
