import { useMemo } from "react";
import { TriangleAlert as AlertTriangle, Clock, Info, Quote, TrendingUp, Zap, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComparisonResult, AppAnalysisSummary } from "@/lib/compare-apps.functions";
import type { GeoSignalCounts } from "@/lib/geo-signal-detector";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function GeoSignalMiniChart({ counts, total, isWorst }: { counts: GeoSignalCounts; total: number, isWorst?: boolean }) {
  const segments = [
    { key: "metro" as const, label: "Metro", classes: isWorst ? "bg-bg border-y-2 border-r-2 border-bg" : "bg-ink border-y-2 border-r-2 border-ink", style: {} },
    { key: "non_metro_mentioned" as const, label: "Non-metro", classes: "bg-transparent border-y-2 border-r-2 border-current", style: {} },
    { key: "unclear" as const, label: "Undetected", classes: "border-y-2 border-r-2 border-current", style: { backgroundImage: isWorst ? "repeating-linear-gradient(45deg, #FFF 0, #FFF 1px, transparent 0, transparent 4px)" : "repeating-linear-gradient(45deg, #000 0, #000 1px, transparent 0, transparent 4px)" } },
  ];

  return (
    <div className="space-y-2">
      <div className="flex h-[14px] w-full border-l-2 border-current bg-transparent">
        {segments.map((seg) => {
          const pct = total > 0 ? (counts[seg.key] / total) * 100 : 0;
          return (
            <div
              key={seg.key}
              className={cn("h-full transition-all duration-200 ease-out", seg.classes)}
              style={{
                width: `${pct}%`,
                minWidth: pct > 0 ? "4px" : "0",
                ...seg.style
              }}
              title={`${seg.label}: ${counts[seg.key]} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-[10px] font-mono font-bold uppercase text-current mt-2">
        {segments.map((seg) => (
          <span key={seg.key} className="flex items-center gap-1.5">
            <span 
              className={cn("h-3 w-3 border-2 border-current", seg.key === "metro" ? (isWorst ? "bg-bg" : "bg-ink") : "bg-transparent")} 
              style={seg.style}
            />
            <span>
              {seg.label}: {counts[seg.key]}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function AppCard({
  app,
  isBest,
  isWorst,
}: {
  app: AppAnalysisSummary;
  isBest: boolean;
  isWorst: boolean;
}) {
  const nonMetroPct = app.reviewsCount > 0
    ? ((app.geoSignalCounts.non_metro_mentioned / app.reviewsCount) * 100).toFixed(1)
    : "0.0";

  return (
    <div
      className={cn(
        "brutalist-card rounded-none border-2 p-5",
        isWorst ? "border-negative bg-negative text-bg" : "border-ink bg-bg text-ink"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-[14px] uppercase tracking-[0.02em]">
            {app.appTitle ?? app.packageId}
          </h3>
          <p className="font-mono text-[11px] font-bold mt-1">
            {app.reviewsCount} reviews analyzed
          </p>
        </div>
        <div className="text-right">
          <div className={cn(
            "inline-flex items-center gap-1 border-2 px-2 py-0.5 font-mono text-[10px] font-bold uppercase rounded-none",
            isWorst ? "border-bg bg-transparent text-bg" :
            isBest ? "border-ink bg-ink text-bg" : "border-transparent text-transparent opacity-0 pointer-events-none"
          )}>
            {isWorst && <AlertTriangle className="h-3 w-3" />}
            {isBest && <Zap className="h-3 w-3" />}
            {isWorst ? "Most complaints" : isBest ? "Fewest complaints" : "—"}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3 font-mono text-xs uppercase font-bold">
        <div className="flex items-center justify-between">
          <span>Availability mentions:</span>
          <span className="text-sm">{app.availabilityPercentage}%</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Non-metro signal:</span>
          <span className="text-sm">{nonMetroPct}%</span>
        </div>
        <div className="border-t-2 border-current pt-3">
          <p className="text-[10px] mb-2">Geo-signal distribution:</p>
          <GeoSignalMiniChart counts={app.geoSignalCounts} total={app.reviewsCount} isWorst={isWorst} />
        </div>
      </div>

      {app.geoThemes.length > 0 && (
        <div className="mt-4 border-t-2 border-current pt-4">
          <h4 className="font-mono text-[10px] font-bold uppercase tracking-wide mb-2">
            Top geo-availability themes
          </h4>
          <ul className="space-y-2">
            {app.geoThemes.slice(0, 3).map((theme, i) => (
              <li key={i} className="text-[11px] font-mono">
                <span className="font-bold">{theme.theme}</span>
                <span> — {theme.mentions} mentions</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ComparisonInsights({ result }: { result: ComparisonResult }) {
  const allInsights = [
    ...result.availabilityGap.insights,
    ...result.geoSignalComparison.insights,
    ...result.themeComparison.insights,
  ];

  if (allInsights.length === 0) return null;

  return (
    <div className="brutalist-card rounded-none border-2 border-ink bg-bg p-4">
      <h4 className="flex items-center gap-2 font-display text-[14px] uppercase text-ink mb-3">
        <TrendingUp className="h-4 w-4" />
        Key Insights
      </h4>
      <ul className="space-y-2">
        {allInsights.map((insight, i) => (
          <li key={i} className="text-sm font-medium text-ink flex items-start gap-2">
            <ArrowRight className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{insight}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LimitationsCard() {
  const limitations = [
    "This analysis uses text-based proxies for geography, not verified location data.",
    "City/state metadata is not available in Play Store review data — signals are inferred from text patterns.",
    "Hindi/Hinglish language patterns are a rough proxy for non-metro users, not definitive.",
    "Reviews are a sample and may not represent the full user base.",
  ];

  return (
    <div className="brutalist-card rounded-none border-2 border-ink bg-bg p-4">
      <h4 className="flex items-center gap-2 font-display text-[14px] uppercase text-ink mb-3">
        <Info className="h-4 w-4" />
        Limitations
      </h4>
      <ul className="space-y-2">
        {limitations.map((lim, i) => (
          <li key={i} className="text-[11px] font-mono font-bold uppercase text-ink flex items-start gap-2">
            <span className="">•</span>
            <span>{lim}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ThemeComparisonTable({ result }: { result: ComparisonResult }) {
  const { apps, themeComparison } = result;
  const themeNames = [...new Set(themeComparison.themes.map((t) => t.name))].slice(0, 6);

  if (themeNames.length === 0) return null;

  return (
    <div className="brutalist-card rounded-none border-2 border-ink bg-bg">
      <div className="border-b-2 border-ink px-4 py-3">
        <h4 className="font-display text-[14px] uppercase text-ink">Theme Comparison</h4>
        <p className="font-mono text-[10px] font-bold uppercase text-ink mt-1">Pain points across apps, normalized by review count</p>
      </div>
      <div className="w-full overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b-2 border-ink bg-ink text-bg">
              <th className="px-4 py-2 text-left font-mono text-[11px] font-bold uppercase">Theme</th>
              {apps.map((app) => (
                <th key={app.packageId} className="px-4 py-2 text-right font-mono text-[11px] font-bold uppercase">
                  {app.appTitle ?? app.packageId}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {themeNames.map((themeName) => (
              <tr key={themeName} className="border-b-2 border-ink last:border-0 hover:bg-ink hover:text-bg transition-colors duration-200">
                <td className="px-4 py-2 font-bold uppercase text-[11px] font-mono">{themeName}</td>
                {apps.map((app) => {
                  const themeData = themeComparison.themes.find(
                    (t) => t.name === themeName && t.apps.some((a) => a.packageId === app.packageId),
                  );
                  const appTheme = themeData?.apps.find((a) => a.packageId === app.packageId);
                  return (
                    <td key={app.packageId} className="px-4 py-2 text-right font-mono text-[11px] font-bold uppercase">
                      {appTheme ? (
                        <span>{appTheme.percentage}%</span>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QuotesSection({ apps }: { apps: AppAnalysisSummary[] }) {
  const allQuotes: { quote: string; app: string; theme: string }[] = [];

  for (const app of apps) {
    for (const theme of app.geoThemes.slice(0, 3)) {
      for (const quote of theme.quotes.slice(0, 2)) {
        allQuotes.push({ quote, app: app.appTitle ?? app.packageId, theme: theme.theme });
      }
    }
  }

  if (allQuotes.length === 0) return null;

  return (
    <div className="brutalist-card rounded-none border-2 border-ink bg-bg p-4">
      <h4 className="flex items-center gap-2 font-display text-[14px] uppercase text-ink mb-3">
        <Quote className="h-4 w-4" />
        Sample User Quotes
      </h4>
      <ul className="space-y-3">
        {allQuotes.slice(0, 8).map((item, i) => (
          <li key={i} className="rounded-none border-2 border-ink bg-bg px-3 py-2">
            <p className="font-mono text-[11px] text-ink uppercase">"{item.quote}"</p>
            <p className="mt-1 font-mono text-[10px] font-bold uppercase text-ink">
              — {item.app}, {item.theme}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ComparisonReport({ result }: { result: ComparisonResult }) {
  const { apps, availabilityGap } = result;
  const worstApp = apps.find((a) => a.packageId === availabilityGap.worstApp?.packageId);
  const bestApp = apps.find((a) => a.packageId === availabilityGap.bestApp?.packageId);
  const gap = availabilityGap.worstApp && availabilityGap.bestApp
    ? availabilityGap.worstApp.percentage - availabilityGap.bestApp.percentage
    : 0;

  const headline = useMemo(() => {
    if (worstApp && gap >= 5) {
      return `${worstApp.appTitle ?? worstApp.packageId} leads in availability complaints`;
    }
    return "Quick Commerce Availability Comparison";
  }, [worstApp, gap]);

  const subheadline = useMemo(() => {
    const totalReviews = apps.reduce((sum, a) => sum + a.reviewsCount, 0);
    return `Here's what ${totalReviews}+ recent reviews say about geo-availability gaps`;
  }, [apps]);

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="border-b-2 border-ink pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl uppercase tracking-[0.02em] text-ink">{headline}</h2>
            <p className="mt-1 font-mono text-sm text-ink">{subheadline}</p>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase text-ink">
            <Clock className="h-3.5 w-3.5" />
            {timeAgo(result.comparisonDate)}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {apps.map((app) => (
            <span
              key={app.packageId}
              className="inline-flex items-center gap-1.5 border-2 border-ink bg-bg px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-ink rounded-none"
            >
              {app.cached && <Clock className="h-3 w-3 text-ink" />}
              {app.appTitle ?? app.packageId}
            </span>
          ))}
        </div>
      </div>

      {/* Apps Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => (
          <AppCard
            key={app.packageId}
            app={app}
            isBest={bestApp?.packageId === app.packageId}
            isWorst={worstApp?.packageId === app.packageId}
          />
        ))}
      </div>

      {/* Insights */}
      <ComparisonInsights result={result} />

      {/* Theme Comparison Table */}
      <ThemeComparisonTable result={result} />

      {/* Quotes */}
      <QuotesSection apps={apps} />

      {/* Limitations */}
      <LimitationsCard />
    </section>
  );
}

export function ComparisonLoading() {
  return (
    <div className="space-y-6">
      <div className="brutalist-card border-2 border-ink bg-bg p-6 text-center">
        <div className="mx-auto mb-4 h-6 w-6 border-2 border-ink bg-ink animate-[spin_1s_steps(4)_infinite]" />
        <div className="font-mono text-sm uppercase text-ink font-bold">Comparing apps...</div>
        <div className="mt-2 font-mono text-[11px] text-ink uppercase">This usually takes 30–90 seconds.</div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="brutalist-card rounded-none border-2 border-ink bg-bg p-5 h-48 opacity-20" />
        ))}
      </div>
    </div>
  );
}
