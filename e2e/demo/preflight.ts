/**
 * Refusing to shoot before there is anything to shoot.
 *
 * Without this the first thing that happens is the storyboard reporting
 * `net::ERR_CONNECTION_REFUSED` with a stack pointing into a file about a title
 * screen — which says nothing about the actual problem. The demo has one
 * precondition, and it is not the script's to fix: the dev server is yours to
 * run. So it names it instead.
 */

/**
 * `localhost`, never `127.0.0.1`: Vite binds `[::1]` only, so the IPv4 name is
 * refused whether the server is up or not. 5174 is the port `vite.config.ts`
 * pins, strictly, for exactly this harness's sake.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5174";

/**
 * The score service is NOT a precondition. Nothing on camera reads it but the
 * title's `TOP SCORE` line, and that line has an answer either way: the classic
 * board from a cold browser while the service is down, the top row of
 * `server/data/shatter.db` while it is up. Which of the two the film shows is
 * worth knowing before the take, so it is reported rather than required.
 */
const API_URL = process.env.DEMO_API_URL ?? "http://127.0.0.1:7000";

async function reachable(url: string): Promise<boolean> {
  try {
    // Any answer at all is enough — a redirect still proves something is
    // listening, which is the whole question here.
    await fetch(url, { signal: AbortSignal.timeout(3000), redirect: "manual" });
    return true;
  } catch {
    return false;
  }
}

/**
 * What answers, or null when nothing does. Read as text rather than merely
 * reached: Vite takes the next port up when 5173 is busy, so "something answers
 * on 5173" has already once meant another project's dev server — a take would
 * have filmed a login form.
 */
async function pageAt(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: "manual" });
    return await response.text();
  } catch {
    return null;
  }
}

export default async function preflight(): Promise<void> {
  const page = await pageAt(`${BASE_URL}/`);
  const problem =
    page === null
      ? `Nothing is listening on ${BASE_URL}.`
      : page.includes("<title>SHATTER</title>")
        ? null
        : `${BASE_URL} answers, but it is not Shatter (no <title>SHATTER</title> in the page).\n` +
          "    Another dev server has the port. Shatter's own refuses to start on a taken port\n" +
          "    (strictPort in vite.config.ts), so free it, or point E2E_BASE_URL elsewhere.";
  if (problem !== null) {
    throw new Error(
      "\n\n  The demo cannot record yet:\n\n" +
        `  - ${problem}\n` +
        "    The demo films the app; it does not start it. In a shell of your own:\n" +
        "      pnpm dev\n" +
        "    The dev server on purpose: the take drives the game through the dev-only\n" +
        "    handle (`window.__shatter.demo`), which a production build does not carry.\n",
    );
  }

  const api = await reachable(`${API_URL}/api/health`);
  console.log(
    api
      ? `  demo: the score service answers on ${API_URL} — TOP SCORE on the title is the top row of its database`
      : `  demo: no score service on ${API_URL} — TOP SCORE on the title is the classic board (012500 · AMI)`,
  );
}
