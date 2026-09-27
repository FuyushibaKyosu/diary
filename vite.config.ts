import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (/(@tiptap|prosemirror)/.test(id)) return "editor";
            if (/react/.test(id) && !id.includes("lucide")) return "react";
          }
        },
      },
    },
  },
});
