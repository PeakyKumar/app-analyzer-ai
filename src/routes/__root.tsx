import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import "@fontsource/archivo-black";
import "@fontsource/space-mono";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="max-w-md text-center border-2 border-ink bg-bg p-8">
        <h1 className="font-display text-7xl uppercase text-ink">404</h1>
        <h2 className="mt-4 font-mono text-xl font-bold uppercase text-ink">Page not found</h2>
        <p className="mt-2 font-mono text-sm text-ink font-medium uppercase">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-8">
          <Link
            to="/"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-none border-2 border-ink bg-ink px-6 text-sm font-mono font-bold uppercase text-bg transition-all duration-200 ease-out hover:bg-bg hover:text-ink"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="max-w-md text-center border-2 border-ink bg-bg p-8">
        <h1 className="font-display text-2xl uppercase tracking-[0.02em] text-ink">
          This page didn't load
        </h1>
        <p className="mt-2 font-mono text-sm text-ink font-medium uppercase">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-none border-2 border-ink bg-ink px-6 text-sm font-mono font-bold uppercase text-bg transition-all duration-200 ease-out hover:bg-bg hover:text-ink"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-none border-2 border-ink bg-bg px-6 text-sm font-mono font-bold uppercase text-ink transition-all duration-200 ease-out hover:bg-ink hover:text-bg"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Review Pain-Point Copilot" },
      {
        name: "description",
        content:
          "Paste a Google Play Store link and get a ranked, evidence-backed breakdown of user pain points from real reviews.",
      },
      { name: "author", content: "Review Pain-Point Copilot" },
      { property: "og:title", content: "Review Pain-Point Copilot" },
      {
        property: "og:description",
        content: "Find the top pain points in any Google Play app from real user reviews.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
