-- Add geo-signal fields to review_analysis_cache
ALTER TABLE public.review_analysis_cache 
ADD COLUMN IF NOT EXISTS geo_signal_counts JSONB DEFAULT '{"metro": 0, "non_metro_mentioned": 0, "unclear": 0}'::jsonb,
ADD COLUMN IF NOT EXISTS geo_themes JSONB DEFAULT '[]'::jsonb;

-- Create table for storing multi-app comparisons
CREATE TABLE IF NOT EXISTS public.app_comparisons (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  package_ids TEXT[] NOT NULL,
  app_titles JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  result JSONB NOT NULL
);

GRANT SELECT ON public.app_comparisons TO anon, authenticated;
GRANT ALL ON public.app_comparisons TO service_role;

ALTER TABLE public.app_comparisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comparisons are publicly readable"
  ON public.app_comparisons FOR SELECT
  USING (true);