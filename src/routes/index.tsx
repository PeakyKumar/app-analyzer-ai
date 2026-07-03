import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AlertCircle, Loader2, Search, Sparkles, Quote, Clock } from "lucide-react";

import { analyzeReviews, type AnalysisResult } from "@/lib/analyze-reviews.functions";

export const Route = createFileRoute("/")({
  component: Index,
});

const PLAY_STORE_RE = /^https?:\/\/play\.google\.com\/store\/apps\/details\?[^ ]*id=[a-zA-Z][\w.]+/;
const PACKAGE_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

function isValidInput(v: string): boolean {
  const t = v.trim();
  if (!t) return false;
  return PLAY_STORE_RE.test(t) || PACKAGE_RE.test(t);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ConfidenceBadge({ level }: { level: "high" | "medium" | "low" }) {
  const styles = {
    high: "bg-success/10 text-success border-success/20",
    medium: "bg-warning/15 text-warning-foreground border-warning/30",
    low: "bg-muted text-muted-foreground border-border",
  }[level];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${styles}`}
    >
      {level} confidence
    </span>
  );
}

function Index() {
  const analyze = useServerFn(analyzeReviews);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const valid = useMemo(() => isValidInput(url), [url]);
  const touched = url.length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await analyze({ data: { url: url.trim() } });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-3xl px-6 pt-16 pb-24 sm:pt-24">
        <header className="mb-10">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Powered by real user reviews
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Review Pain-Point Copilot
          </h1>
          <p className="mt-3 max-w-xl text-base text-muted-foreground">
            Paste any Google Play Store link. Get a ranked, evidence-backed breakdown of the app's
            weaknesses in seconds.
          </p>
        </header>

        <form onSubmit={onSubmit} className="mb-4">
          <label htmlFor="playstore-url" className="sr-only">
            Play Store URL
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="playstore-url"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://play.google.com/store/apps/details?id=com.spotify.music"
                className="h-12 w-full rounded-lg border border-input bg-card pr-4 pl-10 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={!valid || loading}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Analyzing…
                </>
              ) : (
                "Analyze reviews"
              )}
            </button>
          </div>
          {touched && !valid && (
            <p className="mt-2 text-xs text-destructive">
              Enter a valid Play Store URL (or package ID like <code>com.example.app</code>).
            </p>
          )}
        </form>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {loading && (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" />
            Fetching reviews and clustering pain points…
            <div className="mt-1 text-xs">This usually takes 10–20 seconds.</div>
          </div>
        )}

        {result && !loading && (
          <section aria-live="polite">
            <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-4">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  {result.appTitle ?? result.packageId}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {result.painPoints.length} pain points from {result.reviewsCount} recent reviews
                </p>
              </div>
              {result.cached && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
                  <Clock className="h-3 w-3" />
                  Cached · {timeAgo(result.cachedAt)}
                </span>
              )}
            </div>

            <ol className="space-y-4">
              {result.painPoints.map((p, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-border bg-card p-5 shadow-sm transition hover:border-primary/30"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {i + 1}
                      </span>
                      <div>
                        <h3 className="text-base font-semibold text-foreground">{p.theme}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{p.summary}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-lg font-semibold tabular-nums text-foreground">
                        {p.mentions}
                      </div>
                      <div className="text-xs text-muted-foreground">mentions</div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <ConfidenceBadge level={p.confidence} />
                  </div>

                  {p.quotes.length > 0 && (
                    <ul className="mt-4 space-y-2 border-t border-border pt-4">
                      {p.quotes.map((q, qi) => (
                        <li
                          key={qi}
                          className="flex gap-2.5 rounded-md bg-muted/50 px-3 py-2 text-sm text-foreground/80"
                        >
                          <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="italic">{q}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {!result && !loading && !error && (
          <div className="mt-8 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Try an example:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                { label: "Spotify", id: "com.spotify.music" },
                { label: "Duolingo", id: "com.duolingo" },
                { label: "Notion", id: "notion.id" },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    setUrl(`https://play.google.com/store/apps/details?id=${s.id}`)
                  }
                  className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
