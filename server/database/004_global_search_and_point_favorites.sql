-- Allow favorites to reference every public map point and speed up full-text-like lookup.
BEGIN;

ALTER TABLE public.favorites
  DROP CONSTRAINT IF EXISTS favorites_place_id_fkey;

COMMENT ON COLUMN public.favorites.place_id IS
  '公开地图点位 ID，可引用文化景观或由事件地点聚合生成的 event_site 点位。';

CREATE INDEX IF NOT EXISTS events_search_trgm_idx
  ON public.events USING gin (
    (coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' ||
     coalesce(description, '') || ' ' || coalesce(narrative, '') || ' ' ||
     coalesce(tags, '')) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS places_search_trgm_idx
  ON public.places USING gin (
    (coalesce(name, '') || ' ' || coalesce(summary, '') || ' ' ||
     coalesce(narrative, '') || ' ' || coalesce(tags, '')) gin_trgm_ops
  );

COMMIT;
