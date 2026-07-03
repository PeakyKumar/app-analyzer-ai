import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  url: z.string().trim().min(1).max(500),
});

export type PainPoint = {
  theme: string;
  summary: string;
  mentions: number;
  confidence: "high" | "medium" | "low";
  quotes: string[];
};

export type AnalysisResult = {
  packageId: string;
  appTitle: string | null;
  reviewsCount: number;
  painPoints: PainPoint[];
  cached: boolean;
  cachedAt: string;
};

function extractPackageId(input: string): string | null {
  const trimmed = input.trim();
  // Accept raw package IDs like com.example.app
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
  count = 120,
): Promise<{ appTitle: string | null; reviews: { rating: number; text: string }[] }> {
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
  if (!rpcBody) {
    throw new Error("No reviews returned. Is the app ID correct?");
  }
  const inner = JSON.parse(rpcBody) as unknown[];
  const rawReviews = (inner?.[0] ?? []) as unknown[];

  const reviews: { rating: number; text: string }[] = [];
  for (const r of rawReviews) {
    if (!Array.isArray(r)) continue;
    const rating = typeof r[2] === "number" ? r[2] : 0;
    const rawText = r[4];
    const reviewText = typeof rawText === "string" ? rawText.trim() : "";
    if (!reviewText) continue;
    reviews.push({ rating, text: reviewText });
  }

  // Fetch app title (best effort)
  let appTitle: string | null = null;
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
      const html = await titleRes.text();
      const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (m) appTitle = m[1].replace(/\s*-\s*Apps on Google Play\s*$/i, "").trim();
    }
  } catch {
    // ignore
  }

  return { appTitle, reviews };
}

async function clusterWithAI(
  reviews: { rating: number; text: string }[],
): Promise<PainPoint[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  // Focus on lower-rated + negative sentiment reviews for pain points
  const negative = reviews
    .filter((r) => r.rating <= 3 || /bug|crash|slow|broken|hate|worst|terrible|awful|annoying|freeze|lag|glitch|problem|issue|doesn'?t work|stopped/i.test(r.text))
    .slice(0, 120);
  const source = negative.length >= 15 ? negative : reviews.slice(0, 120);

  const numbered = source
    .map((r, i) => `#${i + 1} (${r.rating}★) ${r.text.replace(/\s+/g, " ").slice(0, 500)}`)
    .join("\n");

  const systemPrompt = `You are a senior product analyst. Given user reviews for a mobile app, identify the top user pain points. Cluster related complaints into specific, actionable themes (NOT vague labels like "UX issues"). For each theme provide: a short specific theme name, a one-sentence summary, mention count (# of reviews clearly about this theme), confidence (high/medium/low based on mention count and specificity), and 2-3 short verbatim quotes. Return ONLY valid JSON with shape: {"painPoints":[{"theme":string,"summary":string,"mentions":number,"confidence":"high"|"medium"|"low","quotes":string[]}]}. Order by mentions desc. Return 4-8 pain points.`;

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
  let parsed: { painPoints?: PainPoint[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI returned invalid JSON");
  }
  const points = Array.isArray(parsed.painPoints) ? parsed.painPoints : [];
  return points
    .filter((p) => p && typeof p.theme === "string" && Array.isArray(p.quotes))
    .map((p) => ({
      theme: String(p.theme).slice(0, 120),
      summary: String(p.summary ?? "").slice(0, 400),
      mentions: Number.isFinite(p.mentions) ? Math.max(0, Math.floor(p.mentions)) : 0,
      confidence: (["high", "medium", "low"] as const).includes(p.confidence)
        ? p.confidence
        : "medium",
      quotes: p.quotes.filter((q) => typeof q === "string").slice(0, 3).map((q) => q.slice(0, 300)),
    }));
}

export const analyzeReviews = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<AnalysisResult> => {
    const packageId = extractPackageId(data.url);
    if (!packageId) {
      throw new Error("Invalid Play Store URL. Expected a link like https://play.google.com/store/apps/details?id=com.example.app");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check cache (24h)
    const { data: cached } = await supabaseAdmin
      .from("review_analysis_cache")
      .select("*")
      .eq("package_id", packageId)
      .maybeSingle();

    if (cached) {
      const age = Date.now() - new Date(cached.created_at as string).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        return {
          packageId,
          appTitle: cached.app_title as string | null,
          reviewsCount: cached.reviews_count as number,
          painPoints: (cached.result as { painPoints: PainPoint[] }).painPoints,
          cached: true,
          cachedAt: cached.created_at as string,
        };
      }
    }

    const { appTitle, reviews } = await fetchPlayStoreReviews(packageId, 150);
    if (reviews.length < 5) {
      throw new Error(`Not enough reviews to analyze (found ${reviews.length}). Try a more popular app.`);
    }

    const painPoints = await clusterWithAI(reviews);
    if (painPoints.length === 0) {
      throw new Error("Could not extract pain points from these reviews.");
    }

    const now = new Date().toISOString();
    await supabaseAdmin.from("review_analysis_cache").upsert({
      package_id: packageId,
      app_title: appTitle,
      reviews_count: reviews.length,
      result: { painPoints },
      created_at: now,
    });

    return {
      packageId,
      appTitle,
      reviewsCount: reviews.length,
      painPoints,
      cached: false,
      cachedAt: now,
    };
  });
