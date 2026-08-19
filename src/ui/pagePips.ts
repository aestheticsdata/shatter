export interface PageIndicatorElements {
  pages: HTMLElement;
  arrows: HTMLElement;
  count: HTMLElement;
}

/**
 * The page indicator the paged menu screens share: a row of pips, `PAGE 3/6`
 * with the page you are on lit, and the keys that turn them — in that order and
 * set tight, so the three read as one object rather than three.
 *
 * Three things rather than one because they answer different questions at
 * different speeds. The pips say *where in the run of pages you are* without
 * being read — colour alone, every pip the same size, so the row keeps an even
 * rhythm. The count says exactly which page and how many there are, which pips
 * stop being able to do past a handful. The arrows say the pips are yours to
 * move. Written as one line of prose (`PAGE 3/6 · ← →`) all three would read as
 * part of whatever sentence sits beside them.
 */
export function renderPageIndicator(elements: PageIndicatorElements, page: number, pageCount: number): void {
  const pips = Array.from({ length: pageCount }, (_unused, index) => {
    const pip = document.createElement("span");
    pip.className = index === page ? "page-pip page-pip--current" : "page-pip";
    return pip;
  });
  elements.pages.replaceChildren(...pips);

  // Nothing to turn on a single page, so the keys are not advertised there.
  elements.arrows.hidden = pageCount < 2;

  const current = document.createElement("span");
  current.className = "screen-count-current";
  current.textContent = String(page + 1);
  elements.count.replaceChildren("PAGE ", current, `/${pageCount}`);
}
