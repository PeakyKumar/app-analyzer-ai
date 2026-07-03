import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  type PainPoint,
  type RatingDistribution,
  type GeoTheme,
  type GeoSignalCounts,
  classifyGeoSignal,
  computeGeoSignalCounts,
  getAvailabilityRelatedReviews,
} from "./geo-signal-detector";

const CompareInputSchema = z.object({
  packageIds: z.array(z.string().trim().min(1).max(200)).min(2).max(5),
  hypothesis: z.enum(["geo_availability", "general"]).default("geo_availability"),
});

export type AppAnalysisSummary = {
  packageId: string;
  appTitle: string | null;
  reviewsCount: number;
  painPoints: PainPoint[];
  geoThemes: GeoTheme[];
  ratingDistribution: RatingDistribution;
  topKeywords: string[];
  geoSignalCounts: GeoSignalCounts;
  availabilityMentions: number;
  availabilityPercentage: number;
  limitedReviews: boolean;
  cached: boolean;
  cachedAt: string;
};

export type ComparisonResult = {
  apps: AppAnalysisSummary[];
  comparisonDate: string;
  hypothesis: string;
  availabilityGap: {
    worstApp: { packageId: string; percentage: number } | null;
    bestApp: { packageId: string; percentage: number } | null;
    insights: string[];
  };
  geoSignalComparison: {
    packages: { packageId: string; nonMetroPercentage: number }[];
    insights: string[];
  };
  themeComparison: {
    themes: { name: string; apps: { packageId: string; mentions: number; percentage: number }[] }[];
    insights: string[];
  };
  limitations: string[];
};

async function fetchPlayStoreReviews(
  packageId: string,
  count = 150,
): Promise<{
  appTitle: string | null;
  reviews: { rating: number; text: string }[];
  appExists: boolean;
}> {
  let appTitle: string | null = null;
  let appExists = false;
  try {
    const titleRes = await fetch(
      `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageId)}&hl=en&gl=us`,
      {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      },
    );
    if (titleRes.ok) {
      appExists = true;
      const html = await titleRes.text();
      const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (m) appTitle = m[1].replace(/\s*-\s*Apps on Google Play\s*$/i, "").trim();
    } else if (titleRes.status === 404) {
      appExists = false;
    }
  } catch {
    // ignore
  }

  if (!appExists) {
    return { appTitle, reviews: [], appExists: false };
  }

  const payload =
    "f.req=" +
    encodeURIComponent(
      JSON.stringify([
        [
          [
            "UsvDTd",
            JSON.stringify([null, null, [2, null, [count, null, null]], [packageId, 7]]),
            null,
            "generic",
          ],
        ],
      ]),
    );

  const res = await fetch(
    "https://play.google.com/_/PlayStoreUi/data/batchexecute?rpcids=UsvDTd&hl=en&gl=us",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: payload,
    },
  );

  if (!res.ok) {
    throw new Error(`Play Store request failed with status ${res.status}`);
  }

  const text = await res.text();
  const idx = text.indexOf("\n");
  const cleaned = idx >= 0 ? text.slice(idx + 1) : text;
  let outer: unknown;
  try {
    outer = JSON.parse(cleaned);
  } catch {
    throw new Error("Could not parse Play Store response");
  }

  const innerStr = (outer as unknown[])?.[0] as unknown[] | undefined;
  const rpcBody = innerStr?.[2] as string | null | undefined;
  const reviews: { rating: number; text: string }[] = [];
  if (rpcBody) {
    const inner = JSON.parse(rpcBody) as unknown[];
    const rawReviews = (inner?.[0] ?? []) as unknown[];
    for (const r of rawReviews) {
      if (!Array.isArray(r)) continue;
      const rating = typeof r[2] === "number" ? r[2] : 0;
      const rawText = r[4];
      const reviewText = typeof rawText === "string" ? rawText.trim() : "";
      if (!reviewText) continue;
      reviews.push({ rating, text: reviewText });
    }
  }

  return { appTitle, reviews, appExists: true };
}

type LlmTheme = { name: string; count: number; quotes: string[]; summary?: string };
type LlmResponse = { themes: LlmTheme[]; top_keywords: string[] };

async function callClusteringLLM(
  reviews: { rating: number; text: string }[],
  hypothesis: "geo_availability" | "general",
): Promise<LlmResponse> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const negative = reviews
    .filter(
      (r) =>
        r.rating <= 3 ||
        /bug|crash|slow|broken|hate|worst|terrible|awful|annoying|freeze|lag|glitch|problem|issue|doesn'?t work|stopped|available|delivery|area|city|location|not available|no store|no dark/i.test(
          r.text,
        ),
    )
    .slice(0, 120);
  const source = negative.length >= 15 ? negative : reviews.slice(0, 120);

  const numbered = source
    .map((r, i) => `#${i + 1} (${r.rating}★) ${r.text.replace(/\s+/g, " ").slice(0, 500)}`)
    .join("\n");

  let systemPrompt: string;

  if (hypothesis === "geo_availability") {
    systemPrompt = `You are a senior product analyst specializing in quick commerce and hyperlocal delivery apps. Given user reviews for a quick commerce app, identify themes specifically related to:

1. SERVICE-AREA/AVAILABILITY GAPS: complaints about not being available in certain cities/areas, "not serviceable in my area", limited to metros only
2. CATALOG DEPTH OUTSIDE MAJOR CITIES: product selection issues, limited inventory compared to big cities
3. DELIVERY-TIME VARIANCE: slower deliveries in non-metro areas, longer wait times
4. DARK-STORE DENSITY COMPLAINTS: no dark store nearby, warehouse coverage issues

For each theme return:
- name: short specific theme name
- count: number of reviews clearly about this theme
- summary: one sentence description
- quotes: 2-3 short verbatim quotes from reviews
- geo_relevance: "high" if directly about availability/area, "medium" if indirectly related, "low" if not geography-related

Also extract top_keywords: 8-12 meaningful specific words/short phrases. EXCLUDE stopwords and generic words. PREFER: availability, city, area, delivery, dark store, coverage, metro, tier.

Return ONLY valid JSON: {"themes":[{"name":string,"count":number,"summary":string,"quotes":string[], "geo_relevance":"high"|"medium"|"low"}],"top_keywords":string[]}. Order by count desc. Return 4-8 themes.`;
  } else {
    systemPrompt = `You are a senior product analyst. Given user reviews for a mobile app:
1. Identify pain-point themes. Cluster related complaints into SPECIFIC, actionable themes. For each theme return: name, count, summary, and 2-3 short verbatim quotes.
2. Extract top_keywords: 8-12 meaningful, specific words/short phrases most frequent. EXCLUDE stopwords and generic words.
Return ONLY valid JSON: {"themes":[{"name":string,"count":number,"summary":string,"quotes":string[]}],"top_keywords":string[]}. Order by count desc. Return 4-8 themes.`;
  }

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Reviews:\n${numbered}` },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (res.status === 429) throw new Error("AI rate limit exceeded. Please try again in a moment.");
  if (res.status === 402) throw new Error("AI credits exhausted. Please add credits to your workspace.");
  if (!res.ok) {
    const errTxt = await res.text().catch(() => "");
    throw new Error(`AI request failed (${res.status}): ${errTxt.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as {
    themes?: (LlmTheme & { geo_relevance?: string })[];
    top_keywords?: string[];
  };
  const themes = Array.isArray(parsed.themes) ? parsed.themes : [];
  const top_keywords = Array.isArray(parsed.top_keywords) ? parsed.top_keywords : [];
  return { themes, top_keywords };
}

async function analyzeApp(
  packageId: string,
  hypothesis: "geo_availability" | "general",
): Promise<AppAnalysisSummary> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Check for cached geo analysis
  const { data: cached } = await supabaseAdmin
    .from("review_analysis_cache")
    .select("*")
    .eq("package_id", packageId)
    .maybeSingle();

  const cacheAge = cached ? Date.now() - new Date(cached.created_at as string).getTime() : Infinity;

  if (cached && cacheAge < 24 * 60 * 60 * 1000 && cached.geo_themes && cached.geo_signal_counts) {
    const result = cached.result as {
      painPoints: PainPoint[];
      ratingDistribution?: RatingDistribution;
      topKeywords?: string[];
      limitedReviews?: boolean;
    };
    const geoThemes = cached.geo_themes as GeoTheme[];
    const geoSignalCounts = cached.geo_signal_counts as GeoSignalCounts;

    return {
      packageId,
      appTitle: cached.app_title as string | null,
      reviewsCount: cached.reviews_count as number,
      painPoints: result.painPoints,
      geoThemes,
      ratingDistribution: result.ratingDistribution ?? { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 },
      topKeywords: result.topKeywords ?? [],
      geoSignalCounts,
      availabilityMentions: geoThemes.reduce((sum, t) => sum + t.mentions, 0),
      availabilityPercentage: cached.reviews_count as number > 0
        ? Math.round((geoThemes.reduce((sum, t) => sum + t.mentions, 0) / (cached.reviews_count as number)) * 100)
        : 0,
      limitedReviews: result.limitedReviews ?? (cached.reviews_count as number) < 30,
      cached: true,
      cachedAt: cached.created_at as string,
    };
  }

  const { appTitle, reviews, appExists } = await fetchPlayStoreReviews(packageId, 150);
  if (!appExists) {
    throw new Error(`We couldn't find ${packageId} on the Play Store.`);
  }
  if (reviews.length < 3) {
    throw new Error(`Not enough reviews for ${packageId} (found ${reviews.length}). Try a more popular app.`);
  }

  // Compute geo signals
  const geoSignalCounts = computeGeoSignalCounts(reviews);
  const availabilityReviews = getAvailabilityRelatedReviews(reviews);
  const availabilityMentions = availabilityReviews.length;

  // Run LLM clustering
  const llm = await callClusteringLLM(reviews, hypothesis);

  // Build geo-themes and regular pain points
  const allThemes: (PainPoint & { geo_relevance: string })[] = llm.themes
    .filter((t) => t && typeof t.name === "string" && Array.isArray(t.quotes))
    .map((t) => {
      const mentions = Number.isFinite(t.count) ? Math.max(0, Math.floor(t.count)) : 0;
      const geoRel = (t as { geo_relevance?: string }).geo_relevance ?? "low";
      return {
        theme: String(t.name).slice(0, 120),
        summary: String(t.summary ?? "").slice(0, 400),
        mentions,
        percentage: reviews.length ? Math.round((mentions / reviews.length) * 100) : 0,
        confidence: (mentions >= 10 ? "high" : "low") as "high" | "low",
        geo_relevance: geoRel as "high" | "medium" | "low",
        quotes: t.quotes.filter((q): q is string => typeof q === "string").slice(0, 3).map((q) => q.slice(0, 300)),
      };
    })
    .filter((p) => p.mentions >= 2);

  const geoThemes: GeoTheme[] = allThemes
    .filter((t) => t.geo_relevance === "high" || t.geo_relevance === "medium")
    .map((t) => ({
      theme: t.theme,
      summary: t.summary,
      mentions: t.mentions,
      percentage: t.percentage,
      confidence: t.confidence,
      geo_relevance: t.geo_relevance,
      quotes: t.quotes,
    }))
    .sort((a, b) => b.mentions - a.mentions);

  const painPoints: PainPoint[] = allThemes
    .map(({ geo_relevance, ...rest }) => rest)
    .filter((p) => p.mentions >= 3)
    .sort((a, b) => b.mentions - a.mentions);

  if (painPoints.length === 0) {
    throw new Error(`Could not extract pain points from reviews for ${packageId}.`);
  }

  // Compute rating distribution
  const ratingDistribution: RatingDistribution = { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 };
  for (const r of reviews) {
    const key = String(Math.max(1, Math.min(5, Math.round(r.rating)))) as keyof RatingDistribution;
    if (r.rating >= 1 && r.rating <= 5) ratingDistribution[key]++;
  }

  // Extract keywords (fallback)
  const STOPWORDS = new Set([
    "a", "an", "the", "is", "are", "was", "were", "and", "or", "but", "this", "that",
    "app", "apps", "good", "nice", "great", "bad", "please", "use", "using", "time",
  ]);
  const counts = new Map<string, number>();
  for (const r of reviews) {
    const words = r.text.toLowerCase().match(/[a-z]{4,}/g) || [];
    for (const w of words) {
      if (STOPWORDS.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  const fallbackKeywords = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w]) => w);
  const topKeywords = (llm.top_keywords?.filter((k) => k && k.length >= 4) ?? []).slice(0, 10);
  if (topKeywords.length < 6) topKeywords.push(...fallbackKeywords.slice(0, 10 - topKeywords.length));

  const limitedReviews = reviews.length < 30;
  const now = new Date().toISOString();

  // Cache with geo fields
  await supabaseAdmin.from("review_analysis_cache").upsert({
    package_id: packageId,
    app_title: appTitle,
    reviews_count: reviews.length,
    result: { painPoints, ratingDistribution, topKeywords, limitedReviews },
    geo_themes: geoThemes,
    geo_signal_counts: geoSignalCounts,
      created_at: now,
    });

    return {
      packageId,
      appTitle,
      reviewsCount: reviews.length,
      painPoints,
      geoThemes,
      ratingDistribution,
      topKeywords,
      geoSignalCounts,
      availabilityMentions,
      availabilityPercentage: reviews.length > 0 ? Math.round((availabilityMentions / reviews.length) * 100) : 0,
      limitedReviews,
      cached: false,
      cachedAt: now,
    };
  }

  function generateComparisonInsights(apps: AppAnalysisSummary[]): ComparisonResult["availabilityGap"]["insights"] {
    const insights: string[] = [];
    const sorted = [...apps].sort((a, b) => b.availabilityPercentage - a.availabilityPercentage);

    if (sorted.length >= 2) {
      const gap = sorted[0].availabilityPercentage - sorted[sorted.length - 1].availabilityPercentage;
      if (gap > 5) {
        insights.push(`${sorted[0].appTitle ?? sorted[0].packageId} has ${gap}% more availability-related complaints than ${sorted[sorted.length - 1].appTitle ?? sorted[sorted.length - 1].packageId}.`);
      }
    }

    const avgAvailability = apps.reduce((sum, a) => sum + a.availabilityPercentage, 0) / apps.length;
    if (avgAvailability > 10) {
      insights.push(`Average availability-related complaints across apps: ${avgAvailability.toFixed(1)}%.`);
    }

    return insights;
  }

  function generateGeoSignalInsights(apps: AppAnalysisSummary[]): ComparisonResult["geoSignalComparison"]["insights"] {
    const insights: string[] = [];

    const sorted = [...apps].sort((a, b) => {
      const aPct = a.reviewsCount > 0 ? (a.geoSignalCounts.non_metro_mentioned / a.reviewsCount) * 100 : 0;
      const bPct = b.reviewsCount > 0 ? (b.geoSignalCounts.non_metro_mentioned / b.reviewsCount) * 100 : 0;
      return bPct - aPct;
    });

    if (sorted.length >= 2 && sorted[0].reviewsCount > 0) {
      const topPct = (sorted[0].geoSignalCounts.non_metro_mentioned / sorted[0].reviewsCount) * 100;
      if (topPct > 5) {
        insights.push(`${sorted[0].appTitle ?? sorted[0].packageId} shows highest non-metro signal at ${topPct.toFixed(1)}%.`);
      }
    }

    return insights;
  }

  function generateThemeInsights(apps: AppAnalysisSummary[]): ComparisonResult["themeComparison"]["insights"] {
    const insights: string[] = [];

    // Find common themes across apps
    const themeMap = new Map<string, { packageId: string; mentions: number; percentage: number }[]>();
    for (const app of apps) {
      const allThemes = [...app.painPoints, ...app.geoThemes];
      for (const theme of allThemes) {
        const key = theme.theme.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30);
        const existing = themeMap.get(key) ?? [];
        existing.push({ packageId: app.packageId, mentions: theme.mentions, percentage: theme.percentage });
        themeMap.set(key, existing);
      }
    }

    const commonThemes = [...themeMap.entries()]
      .filter(([, apps]) => apps.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3);

    for (const [themeKey, themeApps] of commonThemes) {
      const appNames = themeApps.map((a) => apps.find((app) => app.packageId === a.packageId)?.appTitle ?? a.packageId).join(", ");
      insights.push(`"${themeKey}" appears in ${themeApps.length} app(s): ${appNames}.`);
    }

    return insights;
  }

  export const compareApps = createServerFn({ method: "POST" })
    .inputValidator((input: unknown) => CompareInputSchema.parse(input))
    .handler(async ({ data }): Promise<ComparisonResult> => {
      const apps = await Promise.all(
        data.packageIds.map((id) => analyzeApp(id, data.hypothesis)),
      );

      const availabilityGap: ComparisonResult["availabilityGap"] = {
        worstApp: null,
        bestApp: null,
        insights: generateComparisonInsights(apps),
      };

      const sortedByAvailability = [...apps].sort((a, b) => b.availabilityPercentage - a.availabilityPercentage);
      availabilityGap.worstApp = {
        packageId: sortedByAvailability[0].packageId,
        percentage: sortedByAvailability[0].availabilityPercentage,
      };
      availabilityGap.bestApp = {
        packageId: sortedByAvailability[sortedByAvailability.length - 1].packageId,
        percentage: sortedByAvailability[sortedByAvailability.length - 1].availabilityPercentage,
      };

      const geoSignalComparison: ComparisonResult["geoSignalComparison"] = {
        packages: apps.map((a) => ({
          packageId: a.packageId,
          nonMetroPercentage: a.reviewsCount > 0
            ? (a.geoSignalCounts.non_metro_mentioned / a.reviewsCount) * 100
            : 0,
        })),
        insights: generateGeoSignalInsights(apps),
      };

      // Build theme comparison
      const themeMap = new Map<string, { packageId: string; mentions: number; percentage: number }[]>();
      for (const app of apps) {
        for (const theme of [...app.painPoints, ...app.geoThemes]) {
          const key = theme.theme.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
          const existing = themeMap.get(key) ?? [];
          existing.push({ packageId: app.packageId, mentions: theme.mentions, percentage: theme.percentage });
          themeMap.set(key, existing);
        }
      }

      const themeComparison: ComparisonResult["themeComparison"] = {
        themes: [...themeMap.entries()]
          .map(([name, appsData]) => ({
            name: name,
            apps: appsData,
          }))
          .filter((t) => t.apps.length >= 1)
          .slice(0, 10),
        insights: generateThemeInsights(apps),
      };

      const limitations: string[] = [
        "This analysis uses text-based proxies for geography, not verified location data. Results are directional, not definitive.",
        "City/state metadata is not available in Play Store review data — signals are inferred from review text patterns.",
        "Hindi/Hinglish language patterns are used as a rough proxy for non-metro users, which is not definitive.",
        "Reviews are a sample of user sentiment and may not represent the full user base.",
        "Cached results may be up to 24 hours old.",
      ];

      const now = new Date().toISOString();

      return {
        apps,
        comparisonDate: now,
        hypothesis: data.hypothesis,
        availabilityGap,
        geoSignalComparison,
        themeComparison,
        limitations,
      };
    });

  export const analyzeSingleAppWithGeo = createServerFn({ method: "POST" })
    .inputValidator((input: unknown) => CompareInputSchema.parse(input))
    .handler(async ({ data }) => {
      const results = await Promise.all(
        data.packageIds.slice(0, 1).map((id) => analyzeApp(id, data.hypothesis)),
      );
      return results[0] ?? null;
    });
