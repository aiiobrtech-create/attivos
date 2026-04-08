ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS geo_lat double precision NULL;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS geo_lng double precision NULL;
