import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  // ffmpeg.wasm creates its worker with a relative URL. Vite's dependency
  // pre-bundler can otherwise rewrite that URL to a non-existent worker.js
  // and leave ffmpeg.load() pending without a visible console error.
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
  },
  build: {
    target: "es2022",
    sourcemap: false,
  },
});
