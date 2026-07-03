
CREATE TABLE public.review_analysis_cache (
  package_id TEXT PRIMARY KEY,
  app_title TEXT,
  reviews_count INTEGER NOT NULL DEFAULT 0,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.review_analysis_cache TO anon, authenticated;
GRANT ALL ON public.review_analysis_cache TO service_role;

ALTER TABLE public.review_analysis_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cache is publicly readable"
  ON public.review_analysis_cache FOR SELECT
  USING (true);
