import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@gnee/api-client": path.resolve(__dirname, "../../../packages/api-client/src"),
    },
  },
  server: {
    port: 5173,
  },
});
