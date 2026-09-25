import { wrappedLines } from "@render/checkCapsules";
import { BESTIARY_ROSTER, creatureBlurb, creatureLabel } from "@ui/Bestiary";
import { ENTRY_BLURB_LINES, ENTRY_FONT, ENTRY_TEXT_ROOM } from "@ui/CapsuleCatalogue";

/**
 * DEV-only width pass for the BESTIARY page (SHA-253): `checkCapsuleBlurbs`,
 * for the creatures.
 *
 * The page sets its two lines in the CAPSULES page's column and type, and
 * measures them against what that column really shows: `ENTRY_TEXT_ROOM`, the
 * third column's room before the stage edge, not the track's 148. The label is
 * derived and one line; the blurb is typed by hand into each species and is the
 * one that runs long. Both are measured in pixels — Silkscreen is
 * proportional, and a character count says nothing about where it wraps.
 *
 * Called after `document.fonts.ready`, for the reason the capsule pass gives,
 * and dropped from production bundles by the `import.meta.env.DEV` branch that
 * calls it.
 */
export function checkBestiaryBlurbs(): void {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) {
    console.error("[bestiary] no 2D context: blurb widths unchecked");
    return;
  }

  context.font = ENTRY_FONT;
  for (const entry of BESTIARY_ROSTER) {
    const label = creatureLabel(entry);
    const labelWidth = context.measureText(label).width;
    if (labelWidth > ENTRY_TEXT_ROOM) {
      console.error(
        `[bestiary] ${entry.kind}: label "${label}" is ${labelWidth.toFixed(1)} px, ` +
          `past the ${ENTRY_TEXT_ROOM} px the third column shows — the stage edge will cut it`,
      );
    }

    const blurb = creatureBlurb(entry);
    const lines = wrappedLines(context, blurb, ENTRY_TEXT_ROOM);
    if (lines > ENTRY_BLURB_LINES) {
      console.error(
        `[bestiary] ${entry.kind}: blurb "${blurb}" needs ${lines} lines ` +
          `in the ${ENTRY_TEXT_ROOM} px the third column shows, and the entry has room for ${ENTRY_BLURB_LINES}`,
      );
    }
  }
}
