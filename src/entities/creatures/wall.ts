import { gameConfig } from "@core/config/GameConfig";

import type { CreatureSight } from "@entities/creatures/Creature";

/**
 * The wall, as the species that live on it need to read it (SHA-240).
 *
 * Two of them work the same surface — BAT sleeps under the wall's exposed
 * underside and WOODPECKER clings to it to peck upward — and a third,
 * WOODPECKER's own target picking, needs the same arithmetic backwards. It was
 * written once for the bat and is shared from here rather than copied, because
 * the two would drift the first time the fence or a laid brick changed what
 * "nothing below" means.
 *
 * A species still never touches the grid: everything here reads `sight`.
 */
export interface Cell {
  column: number;
  row: number;
}

/**
 * Every cell with a brick in it and open air underneath — the face of the wall
 * a creature can hang from or hammer at. A brick with another brick under it is
 * inside the wall, and a creature pinned to it would be drawn behind the one
 * below and be unhittable.
 */
export function undersideCells(sight: CreatureSight): Cell[] {
  const cells: Cell[] = [];
  for (let row = 0; row < sight.wallRows; row += 1) {
    for (let column = 0; column < gameConfig.grid.columns; column += 1) {
      if (sight.standing(column, row) && !sight.standing(column, row + 1)) {
        cells.push({ column, row });
      }
    }
  }
  return cells;
}

/**
 * One of them, at random, never the one it is leaving. Null when the wall has
 * no underside left, which is the caller's problem to answer — there is no
 * sensible default for "nowhere to go" and a silent fallback would strand a
 * creature inside the wall.
 *
 * `Math.random()` and not a clock: this is a discrete pick among valid cells,
 * which is what FROG's `pickBrick` does for the same reason (`frog.ts:75`).
 */
export function pickCell(cells: readonly Cell[], avoid: Cell | null): Cell | null {
  const open = avoid === null ? cells : cells.filter((cell) => cell.column !== avoid.column || cell.row !== avoid.row);
  const from = open.length > 0 ? open : cells;
  return from.length === 0 ? null : from[Math.floor(Math.random() * from.length)];
}

/**
 * One of the `spread` nearest cells to a point, at random, never `avoid`.
 *
 * A creature that picks off the whole wall crosses the field for no reason and
 * — worse, with two of them on a level — lands on the brick the other one is
 * already working, because neither can see the other: `CreatureSight` has no
 * list of creatures in it and should not grow one for this. Nearest-first
 * settles it without the framework moving: two birds pinned at opposite ends
 * work opposite ends and stay there, which is what territory looks like.
 * `spread` is what keeps that from being a fixed march down the wall.
 */
export function pickNearest(
  cells: readonly Cell[],
  from: { x: number; y: number },
  spread: number,
  avoid: Cell | null,
): Cell | null {
  const open = avoid === null ? cells : cells.filter((cell) => cell.column !== avoid.column || cell.row !== avoid.row);
  const usable = open.length > 0 ? open : cells;
  if (usable.length === 0) {
    return null;
  }
  const { left, top, brickWidth, brickHeight } = gameConfig.grid;
  const near = usable.toSorted((a, b) => {
    const da = (left + a.column * brickWidth - from.x) ** 2 + (top + a.row * brickHeight - from.y) ** 2;
    const db = (left + b.column * brickWidth - from.x) ** 2 + (top + b.row * brickHeight - from.y) ** 2;
    return da - db;
  });
  return near[Math.floor(Math.random() * Math.min(spread, near.length))];
}

/** A sprite of this width hanging under that cell: centred on it, top edge to the brick's underside. */
export function underCell(column: number, row: number, width: number): { x: number; y: number } {
  const { left, top, brickWidth, brickHeight } = gameConfig.grid;
  return { x: left + column * brickWidth + (brickWidth - width) / 2, y: top + (row + 1) * brickHeight };
}

/** Which cell a sprite of this width is hanging under: `underCell` read backwards. */
export function cellUnder(at: { x: number; y: number }, width: number): Cell {
  const { left, top, brickWidth, brickHeight } = gameConfig.grid;
  return {
    column: Math.round((at.x - left - (brickWidth - width) / 2) / brickWidth),
    row: Math.round((at.y - top) / brickHeight) - 1,
  };
}
