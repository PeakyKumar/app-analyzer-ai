# Codebase Audit & Migration Plan

This document outlines the findings from the audit of the `app-analyzer-ai` codebase, detailing the components specific to Lovable.dev and bolt.new, and provides a step-by-step plan to migrate to a standard local development environment.

## 🔍 Codebase Overview

*   **Stack**: React 19, TailwindCSS 4, TanStack Router + React Start, Supabase (Auth, Postgres, Realtime, Storage, Functions), Vite, Bun.
*   **Folder Structure**:
    *   `/src`: Core application code.
    *   `/src/server.ts` & `/src/start.ts`: Server-side rendering entry point and TanStack Start instance configuration, respectively.
    *   `/src/components` & `/src/hooks`: UI components (Radix UI based) and custom React hooks.
    *   `/src/integrations/supabase`: Supabase clients and TypeScript types.
    *   `/src/lib`: Utility and server functions (e.g., `analyze-reviews.functions.ts`).
    *   `/src/routes`: File-based routes mapped by TanStack Router.
    *   `/supabase`: Configuration and migrations for the local/remote Supabase CLI.
    *   `/.lovable`: Platform-specific metadata folder (safe to remove).
*   **Architecture**: The application is built around TanStack Start for SSR and routing, connected to a Supabase backend for database, caching, and authentication.

## 🕵️ Assumptions Made During Audit

*   **Assumption 1**: The `@lovable.dev/vite-tanstack-config` wrapper strictly proxies standard Vite, React, Tailwind, and TanStack Start plugin configurations. Replacing it with standard official plugins will maintain feature parity without breaking internal SSR hooks.
*   **Assumption 2**: You are moving away from Lovable Cloud's managed environments completely and intend to either run Supabase locally or manage your own separate hosted Supabase project.
*   **Assumption 3**: The deployment target defaults back to standard Node or Vercel (or Cloudflare), as opposed to Lovable's hidden custom Nitro build setup. 

## 🚩 Risks & Flags

*   **Backend Lock-in (Supabase)**: The app currently expects `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to be injected by the Lovable environment. Data residing in Lovable's hosted database won't be available locally. You must run `supabase start` and migrate your schema, or link to a newly created independent Supabase project.
*   **TanStack Start Build (Nitro)**: Lovable's Vite config implicitly configured Nitro to build for a Cloudflare target by default. Moving to a standard setup means you'll need to explicitly define your deployment target in the new Vite/Start configuration when you're ready to deploy.
*   **Vite Configuration Complexity**: `@lovable.dev/vite-tanstack-config` hides a lot of boilerplate. Manually reconstructing the plugins for `@vitejs/plugin-react`, `vite-tsconfig-paths`, `@tailwindcss/vite`, `@tanstack/router-plugin`, and `@tanstack/start-vite-plugin` might require some debugging if exact versions conflict.
*   **AI Gateway & Rate Limits**: We have migrated from Lovable's AI Gateway to direct Google Gemini API (`gemini-3.1-flash-lite`). Be aware of the free-tier rate limits for a standard AI Studio key: **15 Requests Per Minute (RPM) / 500 Requests Per Day (RPD)**. Budget monitoring and backoff strategies should be considered if usage scales.

## 📋 Step-by-Step Migration Plan

Follow these steps in order to remove all Lovable/bolt.new dependencies and restore a standard local development environment.

### Step 1: Clean Up Lovable Artifacts
1. Delete the `.lovable` directory at the project root.
2. Open `AGENTS.md` and remove the `<!-- LOVABLE:BEGIN -->` block that instructs AI not to rewrite git history.
3. Open `bunfig.toml` and remove the `minimumReleaseAgeExcludes` array which currently bypasses security checks for `@lovable.dev` packages.

### Step 2: Uninstall Lovable Dependencies
Run the following command to remove Lovable packages from the lockfile and `package.json`:
```bash
bun remove -D @lovable.dev/vite-tanstack-config
```

### Step 3: Reconfigure Build Tooling (`vite.config.ts`)
The current `vite.config.ts` imports from Lovable. Rewrite `vite.config.ts` to use explicit standard plugins. You will need to install the missing explicit plugins:
```bash
bun add -D @tanstack/start-vite-plugin @vitejs/plugin-react vite-tsconfig-paths
```
Then update `vite.config.ts` to look something like:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
// import { StartVite } from "@tanstack/start-vite-plugin"; // Ensure compatible import

export default defineConfig({
  plugins: [
    tailwindcss(),
    tsconfigPaths(),
    TanStackRouterVite(),
    react(),
    // StartVite(),
  ],
});
```

### Step 4: Environment Variables Setup
1. Create a `.env.example` and a local `.env` file at the root.
2. Add the following required keys:
```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=your-local-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-local-service-role-key
```
3. Update `src/integrations/supabase/client.ts` and `src/integrations/supabase/client.server.ts` to remove the console logs saying `"Connect Supabase in Lovable Cloud"`. Replace them with standard error messages asking to verify the `.env` file.

### Step 5: Local Database Initialization
Spin up your local Supabase instance to replace the Lovable-hosted one:
```bash
supabase start
```
This will apply the migrations currently in the `/supabase/migrations` directory to your local database. Copy the generated API keys to your `.env` file.

### Step 6: Verify Development Environment
1. Ensure your local Supabase instance is running.
2. Install all dependencies and start the dev server:
```bash
bun install
bun run dev
```
3. Navigate to `http://localhost:5173` (or the port Vite provides) and verify that the application boots, routing works, and no Lovable import errors are thrown.
