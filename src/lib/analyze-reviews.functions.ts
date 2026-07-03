import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  url: z.string().trim().min(1).max(500),
});

export type PainPoint = {
  theme: string;
  summary: string;
  mentions: number;
  percentage: number;
  confidence: "high" | "low";
  quotes: string[];
};

export type RatingDistribution = {
  "5": number;
  "4": number;
  "3": number;
  "2": number;
  "1": number;
};

export type AnalysisResult = {
  packageId: string;
  appTitle: string | null;
  reviewsCount: number;
  painPoints: PainPoint[];
  ratingDistribution: RatingDistribution;
  topKeywords: string[];
  limitedReviews: boolean;
  cached: boolean;
  cachedAt: string;
};

function extractPackageId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const u = new URL(trimmed);
    if (!/(^|\.)play\.google\.com$/.test(u.hostname)) return null;
    const id = u.searchParams.get("id");
    if (id && /^[a-zA-Z][\w.]+$/.test(id)) return id;
    return null;
  } catch {
    return null;
  }
}

async function fetchPlayStoreReviews(
  packageId: string,
  count = 150,
): Promise<{
  appTitle: string | null;
  reviews: { rating: number; text: string }[];
  appExists: boolean;
}> {
  // Check app existence via details page first
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
): Promise<LlmResponse> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const negative = reviews
    .filter(
      (r) =>
        r.rating <= 3 ||
        /bug|crash|slow|broken|hate|worst|terrible|awful|annoying|freeze|lag|glitch|problem|issue|doesn'?t work|stopped/i.test(
          r.text,
        ),
    )
    .slice(0, 120);
  const source = negative.length >= 15 ? negative : reviews.slice(0, 120);

  const numbered = source
    .map((r, i) => `#${i + 1} (${r.rating}★) ${r.text.replace(/\s+/g, " ").slice(0, 500)}`)
    .join("\n");

  const systemPrompt = `You are a senior product analyst. Given user reviews for a mobile app:
1. Identify pain-point themes. Cluster related complaints into SPECIFIC, actionable themes (not vague labels like "UX issues"). For each theme return: name (short), count (# of reviews clearly about this theme), summary (one sentence), and 2-3 short verbatim quotes.
2. Extract top_keywords: 8-12 meaningful, specific words/short phrases most frequent across reviews. EXCLUDE stopwords (a, the, is, and, this, that) and generic low-signal review words (app, good, nice, please, money, use, using, time). PREFER specific issue words (delay, support, chatbot, settlement, cashback, refund, crash, slow, bug). Skip words under 4 chars unless clearly meaningful like "bug".
Return ONLY valid JSON: {"themes":[{"name":string,"count":number,"summary":string,"quotes":string[]}],"top_keywords":string[]}. Order themes by count desc. Return 4-8 themes.`;

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
  if (res.status === 402)
    throw new Error("AI credits exhausted. Please add credits to your workspace.");
  if (!res.ok) {
    const errTxt = await res.text().catch(() => "");
    throw new Error(`AI request failed (${res.status}): ${errTxt.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as {
    themes?: LlmTheme[];
    top_keywords?: string[];
  };
  const themes = Array.isArray(parsed.themes) ? parsed.themes : [];
  const top_keywords = Array.isArray(parsed.top_keywords) ? parsed.top_keywords : [];
  return { themes, top_keywords };
}

async function clusterWithAI(
  reviews: { rating: number; text: string }[],
): Promise<LlmResponse> {
  try {
    return await callClusteringLLM(reviews);
  } catch (e) {
    // Retry once
    try {
      return await callClusteringLLM(reviews);
    } catch {
      throw e instanceof Error ? e : new Error("Analysis failed");
    }
  }
}

const STOPWORDS = new Set([
  "a","an","the","is","are","was","were","and","or","but","this","that","these","those",
  "it","its","for","of","to","in","on","at","by","with","as","be","been","being","have",
  "has","had","do","does","did","not","no","yes","so","if","then","than","too","very",
  "just","also","only","from","up","out","about","into","over","after","before",
  "app","apps","good","nice","great","bad","please","money","use","using","used","time",
  "times","really","much","many","some","any","all","every","one","two","get","got",
  "make","made","would","could","should","will","can","cant","don","dont","doesn",
  "you","your","yours","they","them","their","we","our","us","me","my","mine","he","she",
  "his","her","him","hers","because","when","where","what","which","who","how","why",
  "there","here","been","being","other","more","most","less","least","again","still",
]);

function extractKeywordsFromReviews(
  reviews: { rating: number; text: string }[],
  limit = 10,
): string[] {
  const counts = new Map<string, number>();
  for (const r of reviews) {
    const words = r.text.toLowerCase().match(/[a-z]{3,}/g) || [];
    const seen = new Set<string>();
    for (const w of words) {
      if (STOPWORDS.has(w)) continue;
      if (w.length < 4 && w !== "bug") continue;
      if (seen.has(w)) continue;
      seen.add(w);
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

function filterAndRankKeywords(raw: string[], fallback: string[]): string[] {
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const kRaw of raw) {
    if (typeof kRaw !== "string") continue;
    const k = kRaw.trim().toLowerCase();
    if (!k) continue;
    if (seen.has(k)) continue;
    if (STOPWORDS.has(k)) continue;
    if (k.length < 4 && k !== "bug") continue;
    seen.add(k);
    cleaned.push(k);
  }
  if (cleaned.length < 6) {
    for (const f of fallback) {
      if (cleaned.length >= 10) break;
      if (!seen.has(f)) {
        seen.add(f);
        cleaned.push(f);
      }
    }
  }
  return cleaned.slice(0, 10);
}

function computeRatingDistribution(
  reviews: { rating: number; text: string }[],
): RatingDistribution {
  const dist: RatingDistribution = { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 };
  for (const r of reviews) {
    const key = String(Math.max(1, Math.min(5, Math.round(r.rating)))) as keyof RatingDistribution;
    if (r.rating >= 1 && r.rating <= 5) dist[key]++;
  }
  return dist;
}

export const analyzeReviews = createServerFn({ method: "POST" })
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<AnalysisResult> => {
    const packageId = extractPackageId(data.url);
    if (!packageId) {
      throw new Error("Please paste a valid Play Store app link.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: cached } = await supabaseAdmin
      .from("review_analysis_cache")
      .select("*")
      .eq("package_id", packageId)
      .maybeSingle();

    if (cached) {
      const age = Date.now() - new Date(cached.created_at as string).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        const result = cached.result as {
          painPoints: PainPoint[];
          ratingDistribution?: RatingDistribution;
          topKeywords?: string[];
          limitedReviews?: boolean;
        };
        return {
          packageId,
          appTitle: cached.app_title as string | null,
          reviewsCount: cached.reviews_count as number,
          painPoints: result.painPoints,
          ratingDistribution:
            result.ratingDistribution ?? { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 },
          topKeywords: result.topKeywords ?? [],
          limitedReviews: result.limitedReviews ?? (cached.reviews_count as number) < 30,
          cached: true,
          cachedAt: cached.created_at as string,
        };
      }
    }

    const { appTitle, reviews, appExists } = await fetchPlayStoreReviews(packageId, 150);
    if (!appExists) {
      throw new Error("We couldn't find this app on the Play Store. Double-check the link.");
    }
    if (reviews.length < 3) {
      throw new Error(
        `Not enough reviews to analyze (found ${reviews.length}). Try a more popular app.`,
      );
    }

    const llm = await clusterWithAI(reviews);

    // Compute confidence server-side; drop themes with count < 3.
    const painPoints: PainPoint[] = llm.themes
      .filter((t) => t && typeof t.name === "string" && Array.isArray(t.quotes))
      .map((t) => {
        const mentions = Number.isFinite(t.count) ? Math.max(0, Math.floor(t.count)) : 0;
        return {
          theme: String(t.name).slice(0, 120),
          summary: String(t.summary ?? "").slice(0, 400),
          mentions,
          percentage: reviews.length ? Math.round((mentions / reviews.length) * 100) : 0,
          confidence: (mentions >= 10 ? "high" : "low") as "high" | "low",
          quotes: t.quotes
            .filter((q): q is string => typeof q === "string")
            .slice(0, 3)
            .map((q) => q.slice(0, 300)),
        };
      })
      .filter((p) => p.mentions >= 3)
      .sort((a, b) => b.mentions - a.mentions);

    if (painPoints.length === 0) {
      throw new Error("Could not extract pain points from these reviews.");
    }

    const fallbackKeywords = extractKeywordsFromReviews(reviews, 10);
    const topKeywords = filterAndRankKeywords(llm.top_keywords, fallbackKeywords);
    const ratingDistribution = computeRatingDistribution(reviews);
    const limitedReviews = reviews.length < 30;

    const now = new Date().toISOString();
    await supabaseAdmin.from("review_analysis_cache").upsert({
      package_id: packageId,
      app_title: appTitle,
      reviews_count: reviews.length,
      result: { painPoints, ratingDistribution, topKeywords, limitedReviews },
      created_at: now,
    });

    return {
      packageId,
      appTitle,
      reviewsCount: reviews.length,
      painPoints,
      ratingDistribution,
      topKeywords,
      limitedReviews,
      cached: false,
      cachedAt: now,
    };
  });
