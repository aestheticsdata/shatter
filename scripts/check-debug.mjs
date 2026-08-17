// Refuses a build whose debug switches are still flipped.
//
// `src/core/config/DebugConfig.ts` is compiled into production too (that is the
// point — the deployed site has no ?droprate= to lean on), so a forgotten
// `dropRate: 1` would hand every player a capsule per brick. deploy.sh runs this
// right before the production build; run it by hand with `pnpm run check:debug`.
import { registerHooks } from "node:module";
import { URL } from "node:url";

const ALIASES = ["@audio", "@core", "@entities", "@input", "@interfaces", "@render", "@shared", "@state", "@ui", "@"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    const alias = ALIASES.find((name) => specifier === name || specifier.startsWith(`${name}/`));
    if (!alias) {
      return nextResolve(specifier, context);
    }
    const path = `../src/${alias === "@" ? "" : alias.slice(1)}${specifier.slice(alias.length)}`;
    return { url: new URL(path.endsWith(".ts") ? path : `${path}.ts`, import.meta.url).href, shortCircuit: true };
  },
});

const { debugConfig, SHIPPED_DEBUG_CONFIG } = await import("../src/core/config/DebugConfig.ts");

const failures = [];
const keys = new Set([...Object.keys(debugConfig), ...Object.keys(SHIPPED_DEBUG_CONFIG)]);

for (const key of keys) {
  if (!(key in SHIPPED_DEBUG_CONFIG)) {
    failures.push(`debugConfig.${key} has no entry in SHIPPED_DEBUG_CONFIG — add the value a public build must have`);
    continue;
  }
  if (!(key in debugConfig)) {
    failures.push(`SHIPPED_DEBUG_CONFIG.${key} has no matching switch in debugConfig — remove the stale entry`);
    continue;
  }
  const actual = debugConfig[key];
  const shipped = SHIPPED_DEBUG_CONFIG[key];
  const state = actual === shipped ? "shipped" : `FLIPPED (shipped: ${JSON.stringify(shipped)})`;
  console.log(`  ${key.padEnd(12)} ${JSON.stringify(actual).padEnd(8)} ${state}`);
  if (actual !== shipped) {
    failures.push(`debugConfig.${key} is ${JSON.stringify(actual)}, must be ${JSON.stringify(shipped)} to ship`);
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} debug switch problem(s) — this build must not reach players:`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  console.error("\nReset them in src/core/config/DebugConfig.ts, then run this again.");
  process.exit(1);
}

console.log("Debug switches are all at their shipped values.");
