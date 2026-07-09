import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { CircleAlert as AlertCircle, Loader as Loader2, Search, Sparkles, Quote, Clock, RefreshCw, Info, GitCompare, MapPin, Plus, X } from "lucide-react";

import { analyzeReviews, type AnalysisResult, type RatingDistribution } from "@/lib/analyze-reviews.functions";
import { compareApps, type ComparisonResult } from "@/lib/compare-apps.functions";
import { ComparisonReport, ComparisonLoading } from "@/components/comparison-report";

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

function extractPackageId(input: string): string {
  const trimmed = input.trim();
  if (PACKAGE_RE.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    return u.searchParams.get("id") || "";
  } catch {
    return "";
  }
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

function ConfidenceBadge({ level }: { level: "high" | "low" }) {
  const styles =
    level === "high"
      ? "bg-success/10 text-success border-success/20"
      : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${styles}`}
    >
      {level} confidence
    </span>
  );
}

function RatingChart({ dist }: { dist: RatingDistribution }) {
  const total = (["5", "4", "3", "2", "1"] as const).reduce((s, k) => s + dist[k], 0);
  const shades: Record<string, string> = {
    "5": "#1978E5",
    "4": "#4593EB",
    "3": "#72AEF1",
    "2": "#9FC9F6",
    "1": "#CCE3FB",
  };
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Rating distribution</h3>
      <ul className="space-y-2">
        {(["5", "4", "3", "2", "1"] as const).map((star) => {
          const count = dist[star];
          const pct = total ? (count / total) * 100 : 0;
          return (
            <li key={star} className="flex items-center gap-3 text-sm">
              <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">
                {star}★
              </span>
              <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-muted">
                <div
                  className="h-full rounded-md transition-all"
                  style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%`, backgroundColor: shades[star] }}
                />
                <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-foreground/80">
                  {count} ({pct.toFixed(0)}%)
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const LOADING_STEPS = [
  "Fetching reviews from Play Store…",
  "Reading through user feedback…",
  "Clustering pain points…",
  "Ranking themes by frequency…",
  "Almost done — polishing results…",
];

const COMPARISON_LOADING_STEPS = [
  "Fetching reviews for all apps…",
  "Analyzing geo-availability signals…",
  "Clustering pain points per app…",
  "Building comparison report…",
  "Almost done — computing insights…",
];

function LoadingCard({ steps = LOADING_STEPS }: { steps?: string[] }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % steps.length), 3500);
    return () => clearInterval(id);
  }, [steps.length]);
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
      <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" />
      <div className="font-medium text-foreground">{steps[step]}</div>
      <div className="mt-1 text-xs">This usually takes 30–90 seconds.</div>
    </div>
  );
}

function Index() {
  const analyze = useServerFn(analyzeReviews);
  const runCompare = useServerFn(compareApps);
  const [url, setUrl] = useState("");
  const [compareUrls, setCompareUrls] = useState<string[]>([
    "https://play.google.com/store/apps/details?id=com.grofersapp",
    "https://play.google.com/store/apps/details?id=com.zeptoconsumerapp",
    "https://play.google.com/store/apps/details?id=com.swiggy.instamart",
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [mode, setMode] = useState<"single" | "compare">("single");

  const valid = useMemo(() => isValidInput(url), [url]);
  const touched = url.length > 0;

  const compareValid = useMemo(() => {
    const validUrls = compareUrls.filter((u) => isValidInput(u));
    return validUrls.length >= 2;
  }, [compareUrls]);

  async function runAnalyze() {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setComparisonResult(null);
    try {
      const res = await analyze({ data: { url: url.trim() } });
      setResult(res);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Analysis failed — please try again.";
      const msg =
        raw.includes("Play Store request failed") ||
          raw.includes("Could not parse") ||
          raw.startsWith("AI request failed") ||
          raw === "AI returned invalid JSON"
          ? "Analysis failed — please try again."
          : raw;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function runComparison() {
    if (loading || !compareValid) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setComparisonResult(null);
    try {
      const packageIds = compareUrls
        .filter(isValidInput)
        .map(extractPackageId)
        .filter(Boolean);

      if (packageIds.length < 2) throw new Error("Need at least 2 valid apps to compare.");

      const res = await runCompare({ data: { packageIds, hypothesis: "geo_availability" } });
      setComparisonResult(res);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Comparison failed — please try again.";
      const msg =
        raw.includes("Play Store request failed") ||
          raw.includes("Could not parse") ||
          raw.startsWith("AI request failed")
          ? "Comparison failed — please try again."
          : raw;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "compare") {
      await runComparison();
    } else {
      await runAnalyze();
    }
  }

  const handleModeToggle = (newMode: "single" | "compare") => {
    setMode(newMode);
    setError(null);
    setResult(null);
    setComparisonResult(null);
  };

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
            {mode === "compare"
              ? "Compare any 2-4 apps by their evidence-backed pain points. See which ones have the most complaints."
              : "Paste any Google Play Store link. Get a ranked, evidence-backed breakdown of the app's weaknesses in seconds."}
          </p>
        </header>

        {/* Mode Toggle */}
        <div className="mb-6 flex rounded-lg border border-border bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => handleModeToggle("single")}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${mode === "single"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
              }`}
          >
            <Search className="mr-2 inline h-4 w-4" />
            Single App
          </button>
          <button
            type="button"
            onClick={() => handleModeToggle("compare")}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${mode === "compare"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
              }`}
          >
            <GitCompare className="mr-2 inline h-4 w-4" />
            Compare Apps
          </button>
        </div>

        {mode === "single" && (
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
              <p className="mt-2 text-xs text-destructive">Please paste a valid Play Store app link.</p>
            )}
          </form>
        )}

        {mode === "compare" && (
          <div className="mb-6">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
                <GitCompare className="h-4 w-4 text-primary" />
                Compare Multiple Apps
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Enter Play Store URLs to compare them head-to-head (2 to 4 apps).
              </p>

              <div className="space-y-3 mb-4">
                {compareUrls.map((val, idx) => (
                  <div key={idx} className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={val}
                        onChange={(e) => {
                          const newUrls = [...compareUrls];
                          newUrls[idx] = e.target.value;
                          setCompareUrls(newUrls);
                        }}
                        placeholder="https://play.google.com/store/apps/details?id=com.example.app"
                        className="h-10 w-full rounded-lg border border-input bg-card pr-4 pl-10 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                        disabled={loading}
                      />
                    </div>
                    {compareUrls.length > 2 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newUrls = [...compareUrls];
                          newUrls.splice(idx, 1);
                          setCompareUrls(newUrls);
                        }}
                        disabled={loading}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-input bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Remove app"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {compareUrls.length < 4 && (
                  <button
                    type="button"
                    onClick={() => setCompareUrls([...compareUrls, ""])}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="h-4 w-4" />
                    Add another app
                  </button>
                )}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={runComparison}
                  disabled={!compareValid || loading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Comparing…
                    </>
                  ) : (
                    <>
                      <GitCompare className="h-4 w-4" />
                      Compare Apps
                    </>
                  )}
                </button>
              </div>
              {!compareValid && compareUrls.some(u => u.length > 0 && !isValidInput(u)) && (
                <p className="mt-3 text-xs text-destructive">Please ensure at least 2 entered links are valid Play Store URLs.</p>
              )}
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="mb-6 flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{error}</div>
            </div>
            {(error === "Analysis failed — please try again." || error === "Comparison failed — please try again.") && (
              <button
                type="button"
                onClick={mode === "compare" ? runComparison : runAnalyze}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-destructive/40 bg-background px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            )}
          </div>
        )}

        {loading && mode === "compare" && <ComparisonLoading />}
        {loading && mode === "single" && <LoadingCard />}

        {mode === "compare" && comparisonResult && !loading && (
          <ComparisonReport result={comparisonResult} />
        )}

        {mode === "single" && result && !loading && (
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

            {result.limitedReviews && (
              <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>This app has limited reviews — results may be less reliable.</span>
              </div>
            )}

            <div className="mb-6">
              <RatingChart dist={result.ratingDistribution} />
            </div>

            {result.topKeywords.length > 0 && (
              <div className="mb-8">
                <h3 className="mb-3 text-sm font-semibold text-foreground">Top keywords</h3>
                <div className="flex flex-wrap gap-2">
                  {result.topKeywords.map((k) => (
                    <span
                      key={k}
                      className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            )}

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

        {!result && !comparisonResult && !loading && !error && mode === "single" && (
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
