import { POWER_UPS } from "@core/config/powerUps";
import { dropGlyphFont, DROP_GLYPH_SPAN, SCALE } from "@render/CanvasRenderer";
import { canvasPalette } from "@render/palette";

// The luminance at or above which a capsule body needs a dark letter. Today's
// roster splits cleanly either side of it; see the `darkLetter` note in the
// registry for what to do when one lands in the gap.
const DARK_LETTER_LUMINANCE = 0.28;
// WCAG's bar for graphical objects, the same one `check:backgrounds` holds the
// playfield themes to.
const MIN_LETTER_CONTRAST = 3;

/**
 * DEV-only legibility guard for the capsule roster: every glyph must fit the
 * pill and every letter must be readable on its body.
 *
 * Run once from `main.ts`, never from `drawDrop` — and only after
 * `document.fonts.ready`, because an unloaded Silkscreen falls back to a wider
 * `monospace` and would fail a glyph that fits perfectly well in the real font.
 *
 * The 19 capsules coming after this registry all pick their own body colour and
 * a two-character glyph; this is what tells their author, at load, that the pill
 * cannot hold what they wrote. Dropped from production bundles by the
 * `import.meta.env.DEV` branch that calls it.
 */
export function checkCapsuleLegibility(): void {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) {
    console.error("[capsules] no 2D context: legibility unchecked");
    return;
  }

  for (const definition of POWER_UPS) {
    const { id, glyph, color, dark } = definition;

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
