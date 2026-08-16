import { fileURLToPath, URL } from "node:url";

import { Features } from "lightningcss";
import { defineConfig } from "vite";

export default defineConfig({
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
