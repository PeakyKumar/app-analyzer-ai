import { useMemo } from "react";
import { TriangleAlert as AlertTriangle, Clock, Info, MapPin, Quote, TrendingUp, Users, Zap, ArrowRight } from "lucide-react";
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

function GeoSignalMiniChart({ counts, total }: { counts: GeoSignalCounts; total: number }) {
  const segments = [
    { key: "metro" as const, label: "Metro signal", color: "#1978E5" },
    { key: "non_metro_mentioned" as const, label: "Non-metro signal", color: "#F97316" },
    { key: "unclear" as const, label: "Undetected", color: "#94A3B8" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex h-4 w-full overflow-hidden rounded-md bg-muted">
        {segments.map((seg) => {
          const pct = total > 0 ? (counts[seg.key] / total) * 100 : 0;
          return (
            <div
              key={seg.key}
              className="h-full transition-all"
              style={{
                width: `${pct}%`,
                backgroundColor: seg.color,
                minWidth: pct > 0 ? "4px" : "0",
              }}
              title={`${seg.label}: ${counts[seg.key]} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        {segments.map((seg) => (
          <span key={seg.key} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: seg.color }} />
            <span className="text-muted-foreground">
              {seg.key === "non_metro_mentioned" ? "Non-metro" : seg.key.charAt(0).toUpperCase() + seg.key.slice(1)}:{" "}
              <span className="font-medium text-foreground">{counts[seg.key]}</span>
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
        "rounded-lg border bg-card p-5 transition",
        isWorst && "border-destructive/30",
        isBest && "border-success/30",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">
            {app.appTitle ?? app.packageId}
          </h3>
          <p className="text-sm text-muted-foreground">
            {app.reviewsCount} reviews analyzed
          </p>
        </div>
        <div className="text-right">
          <div className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
            isWorst && "bg-destructive/10 text-destructive",
            isBest && "bg-success/10 text-success",
            !isWorst && !isBest && "bg-muted text-muted-foreground",
          )}>
            {isWorst && <AlertTriangle className="h-3 w-3" />}
            {isBest && <Zap className="h-3 w-3" />}
            {isWorst ? "Most availability complaints" : isBest ? "Fewest availability complaints" : ""}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Availability-related mentions:</span>
          <span className="font-medium text-foreground">{app.availabilityPercentage}%</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Non-metro signal:</span>
          <span className="font-medium text-foreground">{nonMetroPct}%</span>
        </div>
        <div className="border-t border-border pt-3">
          <p className="text-xs text-muted-foreground mb-2">Geo-signal distribution:</p>
          <GeoSignalMiniChart counts={app.geoSignalCounts} total={app.reviewsCount} />
        </div>
      </div>

      {app.geoThemes.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Top geo-availability themes
          </h4>
          <ul className="space-y-2">
            {app.geoThemes.slice(0, 3).map((theme, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium text-foreground">{theme.theme}</span>
                <span className="text-muted-foreground"> — {theme.mentions} mentions</span>
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
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
        <TrendingUp className="h-4 w-4 text-primary" />
        Key Insights
      </h4>
      <ul className="space-y-2">
        {allInsights.map((insight, i) => (
          <li key={i} className="text-sm text-foreground flex items-start gap-2">
            <ArrowRight className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
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
    <div className="rounded-lg border border-border bg-muted/50 p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
        <Info className="h-4 w-4 text-muted-foreground" />
        Limitations
      </h4>
      <ul className="space-y-2">
        {limitations.map((lim, i) => (
          <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
            <span className="text-muted-foreground/50">•</span>
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
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h4 className="text-sm font-semibold text-foreground">Theme Comparison</h4>
        <p className="text-xs text-muted-foreground">Pain points across apps, normalized by review count</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Theme</th>
              {apps.map((app) => (
                <th key={app.packageId} className="px-4 py-2 text-right font-medium text-muted-foreground">
                  {app.appTitle ?? app.packageId}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {themeNames.map((themeName) => (
              <tr key={themeName} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-foreground">{themeName}</td>
                {apps.map((app) => {
                  const themeData = themeComparison.themes.find(
                    (t) => t.name === themeName && t.apps.some((a) => a.packageId === app.packageId),
                  );
                  const appTheme = themeData?.apps.find((a) => a.packageId === app.packageId);
                  return (
                    <td key={app.packageId} className="px-4 py-2 text-right">
                      {appTheme ? (
                        <span className="font-medium text-foreground">
                          {appTheme.percentage}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
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
    <div className="rounded-lg border border-border bg-card p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
        <Quote className="h-4 w-4 text-muted-foreground" />
        Sample User Quotes
      </h4>
      <ul className="space-y-3">
        {allQuotes.slice(0, 8).map((item, i) => (
          <li key={i} className="rounded-md bg-muted/50 px-3 py-2">
            <p className="text-sm text-foreground italic">"{item.quote}"</p>
            <p className="mt-1 text-xs text-muted-foreground">
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
      return `${worstApp.appTitle ?? worstApp.packageId} leads in availability-related complaints`;
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
      <div className="border-b border-border pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">{headline}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{subheadline}</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {timeAgo(result.comparisonDate)}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {apps.map((app) => (
            <span
              key={app.packageId}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs"
            >
              {app.cached && <Clock className="h-3 w-3 text-muted-foreground" />}
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
      <div className="animate-pulse">
        <div className="h-8 w-2/3 rounded bg-muted" />
        <div className="mt-2 h-4 w-1/2 rounded bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-5 animate-pulse">
            <div className="h-5 w-1/2 rounded bg-muted" />
            <div className="mt-2 h-4 w-1/3 rounded bg-muted" />
            <div className="mt-4 space-y-2">
              <div className="h-3 w-full rounded bg-muted" />
              <div className="h-3 w-3/4 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
