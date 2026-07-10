import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { CircleAlert as AlertCircle, Search, Sparkles, Quote, Clock, RefreshCw, Info, GitCompare, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

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

function ConfidenceBadge({ level, isRank1 }: { level: "high" | "low" | "medium"; isRank1?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center border-2 px-2 py-0.5 font-mono text-[10px] font-bold uppercase rounded-none transition-colors duration-200",
        isRank1
          ? "border-bg text-bg group-hover:border-negative group-hover:text-negative bg-transparent"
          : "border-ink text-ink group-hover:border-bg group-hover:text-bg bg-transparent"
      )}
    >
      {level} confidence
    </span>
  );
}

function RatingChart({ dist }: { dist: RatingDistribution }) {
  const total = (["5", "4", "3", "2", "1"] as const).reduce((s, k) => s + dist[k], 0);
  return (
    <div className="brutalist-card border-2 border-ink bg-bg p-5 rounded-none">
      <h3 className="mb-4 text-sm font-bold text-ink">Rating distribution</h3>
      <ul className="space-y-2">
        {(["5", "4", "3", "2", "1"] as const).map((star) => {
          const count = dist[star];
          const pct = total ? (count / total) * 100 : 0;
          let barClasses = "h-full transition-all duration-200 ease-out";
          if (star === "5" || star === "4") barClasses += " bg-ink";
          else if (star === "3") barClasses += " bg-bg border-y-2 border-r-2 border-ink";
          else barClasses += " bg-negative";
          return (
            <li key={star} className="flex items-center gap-2 sm:gap-3 text-sm">
              <span className="w-[20px] shrink-0 font-mono text-[11px] text-ink">
                {star}★
              </span>
              <div className="relative h-[14px] flex-1 border-l-2 border-ink">
                <div
                  className={barClasses}
                  style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right font-mono text-[11px] text-ink">
                {count} ({pct.toFixed(0)}%)
              </span>
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

function LoadingCard({ steps = LOADING_STEPS }: { steps?: string[] }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % steps.length), 3500);
    return () => clearInterval(id);
  }, [steps.length]);
  return (
    <div className="brutalist-card border-2 border-ink bg-bg p-8 text-center rounded-none">
      <div className="mx-auto mb-4 h-6 w-6 border-2 border-ink bg-ink animate-[spin_1s_steps(4)_infinite]" />
      <div className="font-mono text-sm uppercase text-ink font-bold">{steps[step]}</div>
      <div className="mt-2 font-mono text-[10px] text-ink uppercase">This usually takes 30–90 seconds.</div>
    </div>
  );
}

function QuotesList({ quotes, isRank1 }: { quotes: string[], isRank1: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (quotes.length === 0) return null;

  const visibleQuotes = expanded ? quotes : [quotes[0]];

  return (
    <div className="mt-4 space-y-2 border-t-2 border-current pt-4">
      {visibleQuotes.map((q, qi) => (
        <div
          key={qi}
          className={cn(
            "flex gap-2.5 rounded-none border-2 p-3 font-mono text-[11px]",
            isRank1
              ? "bg-bg border-ink text-ink group-hover:bg-ink group-hover:text-bg"
              : "bg-bg border-ink text-ink group-hover:bg-bg group-hover:text-ink group-hover:border-ink"
          )}
        >
          <Quote className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="uppercase">"{q}"</span>
        </div>
      ))}
      {quotes.length > 1 && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); setExpanded(!expanded); }}
          className="mt-2 font-mono text-[10px] font-bold uppercase underline hover:no-underline"
        >
          {expanded ? "Show less" : `Show more (+${quotes.length - 1})`}
        </button>
      )}
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
    <main className="min-h-screen bg-paper">
      <div className="mx-auto w-full max-w-3xl px-6 pt-16 pb-24 sm:pt-24">
        <header className="mb-10">
          <div className="mb-3 inline-flex items-center gap-2 border-2 border-ink bg-bg px-3 py-1 font-mono text-xs font-bold uppercase text-ink rounded-none">
            <Sparkles className="h-3.5 w-3.5" />
            Powered by real user reviews
          </div>
          <h1 className="font-display text-4xl sm:text-5xl uppercase tracking-[0.02em] text-ink">
            Review Pain-Point Copilot
          </h1>
          <p className="mt-3 max-w-xl text-base text-ink font-medium">
            {mode === "compare"
              ? "Compare any 2-4 apps by their evidence-backed pain points. See which ones have the most complaints."
              : "Paste any Google Play Store link. Get a ranked, evidence-backed breakdown of the app's weaknesses in seconds."}
          </p>
        </header>

        {/* Mode Toggle */}
        <div className="mb-6 flex border-2 border-ink bg-bg p-1 rounded-none">
          <button
            type="button"
            onClick={() => handleModeToggle("single")}
            className={cn(
              "flex-1 rounded-none px-4 py-2 font-mono text-xs sm:text-sm font-bold uppercase transition-all duration-200 ease-out",
              mode === "single"
                ? "bg-ink text-bg"
                : "text-ink hover:bg-ink hover:text-bg"
            )}
          >
            <Search className="mr-2 inline h-4 w-4" />
            Single App
          </button>
          <button
            type="button"
            onClick={() => handleModeToggle("compare")}
            className={cn(
              "flex-1 rounded-none px-4 py-2 font-mono text-xs sm:text-sm font-bold uppercase transition-all duration-200 ease-out",
              mode === "compare"
                ? "bg-ink text-bg"
                : "text-ink hover:bg-ink hover:text-bg"
            )}
          >
            <GitCompare className="mr-2 inline h-4 w-4" />
            Compare Apps
          </button>
        </div>

        {mode === "single" && (
          <div className="brutalist-card mb-4 rounded-none border-2 border-ink bg-bg p-5">
            <h3 className="flex items-center gap-2 font-bold text-ink mb-3">
              <Search className="h-4 w-4" />
              Analyze Single App
            </h3>
            <form onSubmit={onSubmit}>
              <label htmlFor="playstore-url" className="sr-only">
                Play Store URL
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink" />
                  <input
                    id="playstore-url"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://play.google.com/store/apps/details?id=com.spotify.music"
                    className="h-12 w-full rounded-none border-2 border-ink bg-bg pr-4 pl-10 text-sm text-ink outline-none transition-all duration-200 ease-out placeholder:text-ink/60 focus:bg-ink/5"
                    disabled={loading}
                  />
                </div>
                <button
                  type="submit"
                  disabled={!valid || loading}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-none border-2 border-ink bg-ink px-6 text-sm font-mono font-bold uppercase text-bg transition-all duration-200 ease-out hover:bg-bg hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-ink disabled:hover:text-bg"
                >
                  {loading ? "Analyzing…" : "Analyze reviews"}
                </button>
              </div>
              {touched && !valid && (
                <p className="mt-2 font-mono text-xs font-bold uppercase text-negative">Please paste a valid Play Store app link.</p>
              )}
            </form>
          </div>
        )}

        {mode === "compare" && (
          <div className="mb-6">
            <div className="brutalist-card rounded-none border-2 border-ink bg-bg p-5">
              <h3 className="flex items-center gap-2 font-bold text-ink mb-2">
                <GitCompare className="h-4 w-4" />
                Compare Multiple Apps
              </h3>
              <p className="text-sm font-medium text-ink mb-4">
                Enter Play Store URLs to compare them head-to-head (2 to 4 apps).
              </p>

              <div className="space-y-3 mb-4">
                {compareUrls.map((val, idx) => (
                  <div key={idx} className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink" />
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
                        className="h-10 w-full rounded-none border-2 border-ink bg-bg pr-4 pl-10 text-sm text-ink outline-none transition-all duration-200 ease-out placeholder:text-ink/60 focus:bg-ink/5"
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
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-none border-2 border-ink bg-bg text-ink transition-all duration-200 ease-out hover:bg-ink hover:text-bg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-bg disabled:hover:text-ink"
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
                    className="inline-flex items-center gap-1.5 font-mono text-sm font-bold uppercase text-ink hover:bg-ink hover:text-bg px-2 py-1 border-2 border-transparent hover:border-ink transition-all duration-200 ease-out disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="inline-flex items-center justify-center gap-2 rounded-none border-2 border-ink bg-ink px-6 py-2.5 text-sm font-mono font-bold uppercase text-bg transition-all duration-200 ease-out hover:bg-bg hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-ink disabled:hover:text-bg"
                >
                  {loading ? "Comparing…" : "Compare Apps"}
                </button>
              </div>
              {!compareValid && compareUrls.some(u => u.length > 0 && !isValidInput(u)) && (
                <p className="mt-3 font-mono text-xs font-bold uppercase text-negative">Please ensure at least 2 entered links are valid Play Store URLs.</p>
              )}
            </div>
          </div>
        )}

        {/* Divider Band */}
        <div className="my-12 h-2 w-full bg-ink"></div>

        {error && !loading && (
          <div className="brutalist-card mb-6 flex items-start justify-between gap-3 border-2 border-ink bg-bg p-4 text-sm font-mono uppercase text-ink rounded-none">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{error}</div>
            </div>
            {(error === "Analysis failed — please try again." || error === "Comparison failed — please try again.") && (
              <button
                type="button"
                onClick={mode === "compare" ? runComparison : runAnalyze}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-none border-2 border-ink bg-bg px-2.5 py-1 text-xs font-bold uppercase text-ink hover:bg-ink hover:text-bg transition-all duration-200 ease-out"
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
            <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-ink pb-4">
              <div>
                <h2 className="font-display text-2xl uppercase tracking-[0.02em] text-ink">
                  {result.appTitle ?? result.packageId}
                </h2>
                <p className="font-mono text-sm text-ink mt-1">
                  {result.painPoints.length} pain points from {result.reviewsCount} recent reviews
                </p>
              </div>
              {result.cached && (
                <span className="inline-flex items-center gap-1.5 border-2 border-ink bg-bg px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-ink rounded-none">
                  <Clock className="h-3 w-3" />
                  Cached • {timeAgo(result.cachedAt)}
                </span>
              )}
            </div>

            {result.limitedReviews && (
              <div className="mb-4 flex items-start gap-2.5 border-2 border-ink bg-bg p-3 text-sm font-mono text-ink rounded-none">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>This app has limited reviews — results may be less reliable.</span>
              </div>
            )}

            <div className="mb-6">
              <RatingChart dist={result.ratingDistribution} />
            </div>

            {result.topKeywords.length > 0 && (
              <div className="mb-8">
                <h3 className="mb-3 text-sm font-bold text-ink uppercase">Top keywords</h3>
                <div className="flex flex-wrap gap-2">
                  {result.topKeywords.map((k) => (
                    <span
                      key={k}
                      className="rounded-none bg-ink px-2 py-1 font-mono text-xs uppercase text-bg"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <ol className="space-y-4">
              {result.painPoints.map((p, i) => {
                const isRank1 = i === 0;
                return (
                  <li
                    key={i}
                    className={cn(
                      "brutalist-card group rounded-none border-y-2 sm:border-2 p-5 transition-all duration-200 ease-out -mx-6 sm:mx-0 px-6 sm:px-5 animate-[slide-up_200ms_ease-out_both] motion-reduce:animate-[fade-in_200ms_ease-out_both]",
                      isRank1
                        ? "border-negative bg-negative text-bg hover:bg-bg hover:border-negative hover:text-negative"
                        : "border-ink bg-bg text-ink hover:bg-ink hover:border-ink hover:text-bg"
                    )}
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex shrink-0 items-center justify-center font-mono text-sm font-bold">
                          #{i + 1}
                        </span>
                        <div>
                          <h3 className="font-display text-[14px] uppercase tracking-[0.02em]">{p.theme}</h3>
                          <p className="mt-1 text-sm font-medium">{p.summary}</p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-mono text-lg font-bold tabular-nums">
                          {p.mentions}
                        </div>
                        <div className="font-mono text-[10px] uppercase">mentions</div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <ConfidenceBadge level={p.confidence} isRank1={isRank1} />
                    </div>

                    <QuotesList quotes={p.quotes} isRank1={isRank1} />
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {!result && !comparisonResult && !loading && !error && mode === "single" && (
          <div className="brutalist-card mt-8 border-2 border-ink bg-bg p-6 text-sm font-mono text-ink rounded-none">
            <p className="font-bold uppercase">Try an example:</p>
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
                  className="rounded-none border-2 border-ink bg-bg px-3 py-1.5 text-xs font-bold uppercase text-ink transition-all duration-200 ease-out hover:bg-ink hover:text-bg"
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
