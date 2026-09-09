import { fileURLToPath, URL } from "node:url";

import { Features } from "lightningcss";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // 5174, pinned: 5173 is Vite's default for every project on this machine,
    // and a second dev server there sends this one drifting to the next free
    // port — which is how a demo take once found another app's login form at
    // the address it was told. The demo harness (e2e/demo) assumes this port;
    // strictPort makes the assumption hold or fail loudly, never drift.
    port: 5174,
    strictPort: true,
    // Same-origin /api in dev, like nginx provides in production. Start the score
    // service with `pnpm run api`; without it the game falls back to localStorage.
    proxy: {
      "/api": "http://127.0.0.1:7000",
    },
  },
  css: {
    transformer: "lightningcss",
    lightningcss: {
      include: Features.Nesting,
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@audio": fileURLToPath(new URL("./src/audio", import.meta.url)),
      "@core": fileURLToPath(new URL("./src/core", import.meta.url)),
      "@entities": fileURLToPath(new URL("./src/entities", import.meta.url)),
      "@input": fileURLToPath(new URL("./src/input", import.meta.url)),
      "@interfaces": fileURLToPath(new URL("./src/interfaces", import.meta.url)),
      "@render": fileURLToPath(new URL("./src/render", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      "@state": fileURLToPath(new URL("./src/state", import.meta.url)),
      "@ui": fileURLToPath(new URL("./src/ui", import.meta.url)),
    },
  },
});
