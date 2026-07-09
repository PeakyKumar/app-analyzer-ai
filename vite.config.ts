import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    tsconfigPaths(),
    tanstackStart({
      server: {
        entry: "server"
      }
    }),
    nitro({
      preset: "vercel"
    }),
    react(),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
});