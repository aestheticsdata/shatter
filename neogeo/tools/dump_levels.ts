// The web game's levels as JSON for tools/gen_assets.py: the cartridge bakes
// what levels.ts says, read by the game's own module rather than by regex.
import { LEVELS } from "../../src/core/levels/levels";

process.stdout.write(
  JSON.stringify(
    LEVELS.map((level) => ({
      name: level.name,
      background: level.background,
      rows: level.rows,
      eye: level.eye ?? null,
      creatures: level.creatures ?? [],
      observer: level.observer ? true : false,
    })),
  ),
);
