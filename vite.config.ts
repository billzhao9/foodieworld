import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig({
  plugins: [
    vue(),
    {
      name: "reactor-wasm-assets",
      enforce: "pre",
      transform(code, id) {
        // The SDK's ignored relative import otherwise points into Vite's
        // optimized cache (or the output bundle) instead of its WASM assets.
        if (id.includes("@reactor-team/js-sdk/dist/index.js"))
          return code.replace("/* @vite-ignore */", "");
      },
    },
  ],
  optimizeDeps: {
    exclude: ["@reactor-team/js-sdk"],
    include: [
      "@reactor-team/js-sdk > awaitqueue",
      "@reactor-team/js-sdk > react",
      "@reactor-team/js-sdk > react/jsx-runtime",
    ],
  },
  server: {
    port: 5174,
    strictPort: true,
    fs: {
      deny: [
        "**/.env*",
        "**/*.{crt,pem}",
        "**/.git/**",
        "**/.data/**",
        "**/.codex/**",
        "**/.agents/**",
      ],
    },
    proxy: { "/api": "http://127.0.0.1:4174" },
  },
  build: { chunkSizeWarningLimit: 900 },
});
