export type GeoSignal = "metro" | "non_metro_mentioned" | "unclear";

export type GeoSignalResult = {
  signal: GeoSignal;
  confidence: number;
  indicators: string[];
};

export type GeoSignalCounts = {
  metro: number;
  non_metro_mentioned: number;
  unclear: number;
};

export type GeoTheme = {
  theme: string;
  summary: string;
  mentions: number;
  percentage: number;
  confidence: "high" | "low";
  geo_relevance: "high" | "medium" | "low";
  quotes: string[];
};

const METRO_CITIES = new Set([
  "delhi", "mumbai", "bangalore", "bengaluru", "chennai", "kolkata", "hyderabad", "pune",
  "ahmedabad", "jaipur", "surat", "lucknow", "kanpur", "nagpur", "indore", "thane",
  "bhopal", "visakhapatnam", "pimpri-chinchwad", "patna", "vadodara", "ghaziabad",
  "ludhiana", "agra", "nashik", "faridabad", "meerut", "rajkot", "kalyan-dombivli",
  "vasai-virar", "varanasi", "srinagar", "aurangabad", "dhanbad", "amritsar",
  "noida", "gurgaon", "gurugram", "navi mumbai", "howrah", "coimbatore",
]);

const TIER_2_3_CITIES = new Set([
  "chandigarh", "trivandrum", "thiruvananthapuram", "kochi", "cochin", "mysore", "mysuru",
  "madurai", "bhubaneswar", "bhubaneshwar", "jodhpur", "udaipur", "kota", "goa",
  "dehradun", "haridwar", "rishikesh", "jalandhar", "amritsar", "ludhiana",
  "guwahati", "shillong", "imphal", "silchar", "dibrugarh", "jorhat",
  "raipur", "bhilai", "durg", "bilaspur", "jabalpur", "gwalior", "ujjain",
  "tiruchirappalli", "trichy", "salem", "tirunelveli", "vellor", "pondicherry",
  "pondy", "mangalore", "mangaluru", "hubli", "dharwad", "belgaum", "belgavi",
  "rajahmundry", "vijayawada", "guntur", "nellore", "kakinada", "tirupati",
  "warangal", "karimnagar", "nizamabad", "khammam",
  "jammu", "srinagar", "leh", "ladakh",
  "ranchi", "jamshedpur", "dhanbad", "hazaribagh", "bokaro",
  "durgapur", "asansol", "siliguri", "bardhaman", "barddhaman", "malda",
  "cuttack", "rourkela", "berhampur", "sambalpur", "puri",
  "ajmer", "bikaner", "alwar", "bhilwara", "pali",
  "solapur", "kolhapur", "sangli", "satara", "latur", "nanded", "parbhani", "jalgaon",
  "allahabad", "prayagraj", "moradabad", "bareilly", "aligarh", "saharanpur",
  "gorakhpur", "faizabad", "ayodhya", "varanasi", "benaras",
]);

const AVAILABILITY_INDICATORS = [
  /not available (in |near |around |at )?/i,
  /not (available|delivered?|service) (in|near|around) my (area|city|location|locality)/i,
  /no (service|delivery|store|dark ?store) (in|near|around|at) /i,
  /doesn'?t deliver? (to|in|near) /i,
  /not delivering (to|in) /i,
  /only (available|delivers?) (in|to|for) /i,
  /service not available/i,
  /not (in |available in )?my (area|city|pincode|location)/i,
  /out of (delivery |service )?area/i,
  /(not|no) (available|coverage|service) (for|in) my/i,
  /delivery not (available|possible) (in|to|for) /i,
  /can'?t deliver (to|in) /i,
  /only (metro|big cities|major cities)/i,
  /only (in|available in) (metro|tier[- ]?1|big) cities/i,
  /(no|limited) presence (in|outside) /i,
  /not (serv(ed|icing)|covered) (in|at) /i,
];

const NON_METRO_INDICATORS = [
  /not available in my (small |tier[- ]?[23] |non[- ]?metro )?(city|town|area)/i,
  /no (dark ?store|store|warehouse) (in|near) my (city|town|area)/i,
  /my (city|town|area) (isn'?t|is not|not) (covered|serviced|available)/i,
  /(limited|limited to|only in) (metro|big|major|tier[- ]?1) cities/i,
  /(no|not) available (in|outside) (non[- ]?metro|tier[- ]?[23]|small)/i,
  /not (available|delivered) in (non[- ]?metro|tier[- ]?[23]|small)/i,
  /why (not|no) (in|for) (small|non[- ]?metro|tier[- ]?[23]) /i,
  /please (start|begin|launch) (in|at) /i,
  /when (will|is it) (coming|available|launching) (to|in) /i,
  /waiting for (launch|start|arrival) (in|at) /i,
];

const HINDI_HINGLISH_PATTERNS = [
  /[क-ह][a-z]*\s*(hi|bhai|didi|uncle|aunty|sir|madam)/i,
  /\b(nahi|nahī̃|nahi|nah|nahī)\s*(hai|hain|tha|the|tha|thī)\b/i,
  /\b(koi|koyi|kaun|kis)\s*(nahi|nah|na)\b/i,
  /\b(milta|milti|milte|mila|mili|milo)\s*(nahi|nah|na)\b/i,
  /\b(ghar|ghar)\s*(se|par|pe|tak)\b/i,
  /\b(dukan|dokan|dukaan|store)\s*(nahi|nah|koi)\b/i,
  /\b(bahut|bohot|bahut)\s*(accha|achha|acchha|theek)\b/i,
  /\b(kaam|kaam)\s*(nahi|nah|na)\s*(karta|karta|karte)\b/i,
  /\b(chahiye|cahiye|chāhie)\b/i,
  /\b(karna|karna|kar|karo|kariye)\s*(hai|hain|tha|the)\b/i,
];

function detectCityMentions(text: string): { cities: string[]; isNonMetro: boolean } {
  const lower = text.toLowerCase();
  const foundCities: string[] = [];
  let isNonMetro = false;

  const words = lower.split(/\s+|[,.!?;:]/);
  for (const word of words) {
    const clean = word.trim();
    if (METRO_CITIES.has(clean)) {
      foundCities.push(clean);
    } else if (TIER_2_3_CITIES.has(clean)) {
      foundCities.push(clean);
      isNonMetro = true;
    }
  }

  return { cities: foundCities, isNonMetro };
}

function detectAvailabilityIndicators(text: string): string[] {
  const indicators: string[] = [];
  for (const pattern of AVAILABILITY_INDICATORS) {
    if (pattern.test(text)) {
      indicators.push(pattern.source);
    }
  }
  return indicators;
}

function detectNonMetroIndicators(text: string): string[] {
  const indicators: string[] = [];
  for (const pattern of NON_METRO_INDICATORS) {
    if (pattern.test(text)) {
      indicators.push(pattern.source);
    }
  }
  return indicators;
}

function detectRegionalLanguage(text: string): boolean {
  for (const pattern of HINDI_HINGLISH_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

export function classifyGeoSignal(reviewText: string): GeoSignalResult {
  const text = reviewText.toLowerCase();
  const indicators: string[] = [];

  // Detect city mentions
  const { cities, isNonMetro } = detectCityMentions(reviewText);
  const hasTier2_3Mention = isNonMetro;

  // Detect availability/language patterns
  const availabilityIndicators = detectAvailabilityIndicators(reviewText);
  const nonMetroIndicators = detectNonMetroIndicators(reviewText);
  const isRegionalLanguage = detectRegionalLanguage(text);

  // Score calculation
  let metroScore = 0;
  let nonMetroScore = 0;

  // Bonus for tier 2/3 city mentions
  if (hasTier2_3Mention) {
    nonMetroScore += 3;
    indicators.push("tier_2_3_city_mentioned");
  }

  // Non-metro specific patterns
  if (nonMetroIndicators.length > 0) {
    nonMetroScore += nonMetroIndicators.length * 2;
    indicators.push(...nonMetroIndicators);
  }

  // Availability indicators + tier 2/3 cities
  if (availabilityIndicators.length > 0 && hasTier2_3Mention) {
    nonMetroScore += 2;
    indicators.push(...availabilityIndicators);
  }

  // Regional language as proxy for non-metro (lower weight)
  if (isRegionalLanguage) {
    nonMetroScore += 1;
    indicators.push("regional_language_pattern");
  }

  // Metro mentions with availability issues (contrast pattern)
  const metroCityFound = cities.some((c) => METRO_CITIES.has(c));
  if (metroCityFound && availabilityIndicators.length > 0) {
    // User has metro coverage issues - less likely to be non-metro complaint
    metroScore += 1;
    indicators.push(...availabilityIndicators);
  }

  // Determine signal
  const totalScore = metroScore + nonMetroScore;
  if (totalScore === 0) {
    return {
      signal: "unclear",
      confidence: 0.3,
      indicators: [],
    };
  }

  if (nonMetroScore > metroScore && nonMetroScore >= 2) {
    const confidence = Math.min(0.9, 0.5 + (nonMetroScore - metroScore) * 0.1);
    return {
      signal: "non_metro_mentioned",
      confidence,
      indicators: [...new Set(indicators)],
    };
  }

  if (metroScore > 0 && availabilityIndicators.length > 0) {
    return {
      signal: "metro",
      confidence: Math.min(0.8, 0.5 + metroScore * 0.1),
      indicators: [...new Set(indicators)],
    };
  }

  return {
    signal: "unclear",
    confidence: 0.4,
    indicators: [...new Set(indicators)],
  };
}

export function computeGeoSignalCounts(
  reviews: { rating: number; text: string }[],
): GeoSignalCounts {
  const counts: GeoSignalCounts = { metro: 0, non_metro_mentioned: 0, unclear: 0 };

  for (const review of reviews) {
    const result = classifyGeoSignal(review.text);
    if (result.signal === "metro") {
      counts.metro++;
    } else if (result.signal === "non_metro_mentioned") {
      counts.non_metro_mentioned++;
    } else {
      counts.unclear++;
    }
  }

  return counts;
}

export function filterReviewsByGeoSignal(
  reviews: { rating: number; text: string }[],
  signal: GeoSignal,
): { rating: number; text: string }[] {
  if (signal === "unclear") return reviews;
  return reviews.filter((r) => classifyGeoSignal(r.text).signal === signal);
}

export function getAvailabilityRelatedReviews(
  reviews: { rating: number; text: string }[],
): { rating: number; text: string; geoSignal: GeoSignal }[] {
  const availabilityReviews: { rating: number; text: string; geoSignal: GeoSignal }[] = [];

  for (const review of reviews) {
    const indicators = detectAvailabilityIndicators(review.text);
    const nonMetroIndicators = detectNonMetroIndicators(review.text);
    if (indicators.length > 0 || nonMetroIndicators.length > 0) {
      const result = classifyGeoSignal(review.text);
      availabilityReviews.push({
        rating: review.rating,
        text: review.text,
        geoSignal: result.signal,
      });
    }
  }

  return availabilityReviews;
}
