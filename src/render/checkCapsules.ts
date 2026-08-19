import { POWER_UP_GLYPHS, POWER_UPS } from "@core/config/powerUps";
import { dropGlyphFont, DROP_GLYPH_SPAN, SCALE } from "@render/CanvasRenderer";
import { canvasPalette } from "@render/palette";
import { capsuleLabel, ENTRY_BLURB_LINES, ENTRY_COLUMN_WIDTH, ENTRY_FONT } from "@ui/CapsuleCatalogue";

// The luminance at or above which a capsule body needs a dark letter. Today's
// roster splits cleanly either side of it; see the `darkLetter` note in the
// registry for what to do when one lands in the gap.
const DARK_LETTER_LUMINANCE = 0.28;
// WCAG's bar for graphical objects, the same one `check:backgrounds` holds the
// playfield themes to.
const MIN_LETTER_CONTRAST = 3;

/**
 * DEV-only legibility guard for the capsule roster: every glyph must be the
 * player's alone, fit the pill, and be readable on its body.
 *
 * Run once from `main.ts`, never from `drawDrop` — and only after
 * `document.fonts.ready`, because an unloaded Silkscreen falls back to a wider
 * `monospace` and would fail a glyph that fits perfectly well in the real font.
 *
 * Glyphs are derived from the names rather than authored, so this is the pass
 * that tells a new capsule's author, at load, that the name they picked reads
 * as somebody else's pill or no longer fits it. Dropped from production bundles
 * by the `import.meta.env.DEV` branch that calls it.
 */
export function checkCapsuleLegibility(): void {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) {
    console.error("[capsules] no 2D context: legibility unchecked");
    return;
  }

  const seen = new Map<string, string>();
  for (const definition of POWER_UPS) {
    const { id, color, dark } = definition;
    const glyph = POWER_UP_GLYPHS[id];

    // The one way the derivation can fail: a name that is a whole other name's
    // opening has no length that separates them, so both bottom out on the
    // shorter one and the player reads the same pill for two capsules.
    const twin = seen.get(glyph);
    if (twin !== undefined) {
      console.error(`[capsules] ${id}: glyph "${glyph}" is also ${twin}'s — one name is the opening of the other`);
    }
    seen.set(glyph, id);

    context.font = dropGlyphFont(glyph);
    const width = context.measureText(glyph).width;
    if (width > DROP_GLYPH_SPAN * SCALE) {
      console.error(
        `[capsules] ${id}: glyph "${glyph}" is ${(width / SCALE).toFixed(1)} game px, ` +
          `over the ${DROP_GLYPH_SPAN} px pill — it will touch the sheen`,
      );
    }

    const letter = dark ? canvasPalette.dropLetterDark : canvasPalette.dropLetterLight;
    const contrast = contrastRatio(color, letter);
    if (contrast < MIN_LETTER_CONTRAST) {
      console.error(
        `[capsules] ${id}: ${dark ? "dark" : "light"} letter on ${color} is only ` +
          `${contrast.toFixed(2)}:1, under ${MIN_LETTER_CONTRAST}:1`,
      );
    }

    // A warning, not a failure: `dark` is authored, and a body inside the gap
    // this threshold sits in may legitimately read better either way.
    const luminance = relativeLuminance(color);
    if (luminance >= DARK_LETTER_LUMINANCE !== dark) {
      console.warn(
        `[capsules] ${id}: ${color} has luminance ${luminance.toFixed(3)}, which usually wants dark: ${!dark}`,
      );
    }
  }
}

/**
 * DEV-only width guard for the CAPSULES screen's two text lines.
 *
 * A blurb is authored prose in a fixed 210 px column, which is the one thing on
 * that screen nothing else can catch: the glyphs are derived and measured
 * above, the tier and the duration come off the registry, and only the blurb is
 * typed by hand — a long one runs into the next column and nobody sees it until
 * a screenshot, by which time it has shipped.
 *
 * Same conditions as the pass above: after `document.fonts.ready`, because an
 * unloaded Silkscreen falls back to a wider `monospace` and would fail a line
 * that fits perfectly well in the real font. Dropped from production bundles by
 * the `import.meta.env.DEV` branch that calls it.
 */
export function checkCapsuleBlurbs(): void {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) {
    console.error("[capsules] no 2D context: blurb widths unchecked");
    return;
  }

  context.font = ENTRY_FONT;
  for (const definition of POWER_UPS) {
    // The label is one line and has to stay one: it is name, tier and duration,
    // and a wrapped one would push the blurb out of the entry.
    const label = capsuleLabel(definition);
    const labelWidth = context.measureText(label).width;
    if (labelWidth > ENTRY_COLUMN_WIDTH) {
      console.error(
        `[capsules] ${definition.id}: label "${label}" is ${labelWidth.toFixed(1)} px, ` +
          `over the ${ENTRY_COLUMN_WIDTH} px column — it will wrap and shove the blurb down`,
      );
    }

    const lines = wrappedLines(context, definition.blurb, ENTRY_COLUMN_WIDTH);
    if (lines > ENTRY_BLURB_LINES) {
      console.error(
        `[capsules] ${definition.id}: blurb "${definition.blurb}" needs ${lines} lines ` +
          `in the ${ENTRY_COLUMN_WIDTH} px column, and the entry has room for ${ENTRY_BLURB_LINES}`,
      );
    }
  }
}

// Greedy line breaking, which is what the browser does with a run of words: a
// word that will not fit the room left starts the next line. A word too wide for
// the column on its own is counted as its own line and named, since no break
// can rescue it.
function wrappedLines(context: CanvasRenderingContext2D, text: string, room: number): number {
  const space = context.measureText(" ").width;
  let lines = 1;
  let used = 0;
  for (const word of text.split(" ")) {
    const width = context.measureText(word).width;
    const extended = used === 0 ? width : used + space + width;
    if (extended <= room) {
      used = extended;
      continue;
    }
    lines++;
    used = width;
  }
  return lines;
}

function relativeLuminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const [red, green, blue] = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff].map((channel) => {
    const ratio = channel / 255;
    return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string): number {
  const [light, dark] = [relativeLuminance(first), relativeLuminance(second)].toSorted((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}
