import { wrappedLines } from "@render/checkCapsules";
import {
  BESTIARY_ROSTER,
  creatureLore,
  creatureName,
  creatureStats,
  creatureTip,
  LORE_LINES,
  NAME_FONT,
  SHEET_FONT,
  SHEET_WIDTH,
  STATS_GAP,
} from "@ui/Bestiary";

/**
 * DEV-only width pass for the BESTIARY's pages (SHA-255): `checkCapsuleBlurbs`,
 * for the book of creatures.
 *
 * Everything on a page's text column is measured in pixels against that
 * column — Silkscreen is proportional, and a character count says nothing
 * about where a line breaks. The name has to hold one line in the display face,
 * each stat value one line beside the widest label, the lore its line budget
 * and the tip one line. The lore and the tip are typed by hand into each
 * species, and they are the ones that run long.
 *
 * Called after `document.fonts.ready`, for the reason the capsule pass gives,
 * and dropped from production bundles by the `import.meta.env.DEV` branch that
 * calls it.
 */
export function checkBestiaryText(): void {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) {
    console.error("[bestiary] no 2D context: page widths unchecked");
    return;
  }

  for (const entry of BESTIARY_ROSTER) {
    context.font = NAME_FONT;
    const name = creatureName(entry);
    const nameWidth = context.measureText(name).width;
    if (nameWidth > SHEET_WIDTH) {
      console.error(
        `[bestiary] ${entry.kind}: name "${name}" is ${nameWidth.toFixed(1)} px, over the ${SHEET_WIDTH} px column`,
      );
    }

    context.font = SHEET_FONT;
    const stats = creatureStats(entry);
    const labels = Math.max(...stats.map(([label]) => context.measureText(label).width));
    const room = SHEET_WIDTH - labels - STATS_GAP;
    for (const [label, value] of stats) {
      const width = context.measureText(value).width;
      if (width > room) {
        console.error(
          `[bestiary] ${entry.kind}: ${label} "${value}" is ${width.toFixed(1)} px, over the ${room.toFixed(1)} px beside the labels`,
        );
      }
    }

    const lore = creatureLore(entry);
    const lines = wrappedLines(context, lore, SHEET_WIDTH);
    if (lines > LORE_LINES) {
      console.error(
        `[bestiary] ${entry.kind}: lore needs ${lines} lines in the ${SHEET_WIDTH} px column, and the page has room for ${LORE_LINES}`,
      );
    }

    const tip = creatureTip(entry);
    const tipWidth = context.measureText(tip).width;
    if (tipWidth > SHEET_WIDTH) {
      console.error(
        `[bestiary] ${entry.kind}: tip "${tip}" is ${tipWidth.toFixed(1)} px, over the ${SHEET_WIDTH} px column`,
      );
    }
  }
}
