-- Add timeline acts and expose one map point per physical event site.
BEGIN;

DROP VIEW IF EXISTS public.map_points_v;
DROP VIEW IF EXISTS public.event_sites_v;

CREATE TABLE IF NOT EXISTS public.acts (
  act_no integer PRIMARY KEY CHECK (act_no BETWEEN 1 AND 9),
  title text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.event_acts (
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  act_no integer NOT NULL REFERENCES public.acts(act_no) ON DELETE CASCADE,
  assignment_source text NOT NULL DEFAULT 'timeline'
    CHECK (assignment_source IN ('timeline', 'archive_section', 'date_fallback', 'manual')),
  confidence text NOT NULL DEFAULT 'high'
    CHECK (confidence IN ('high', 'medium', 'low')),
  PRIMARY KEY (event_id, act_no)
);

CREATE INDEX IF NOT EXISTS event_acts_act_idx ON public.event_acts (act_no, event_id);

INSERT INTO public.acts (act_no, title, start_date, end_date, sort_order)
SELECT
  chapter_no,
  min(chapter_title),
  min(start_date),
  max(end_date),
  chapter_no
FROM public.timeline_entries
WHERE chapter_no IS NOT NULL
GROUP BY chapter_no
ON CONFLICT (act_no) DO UPDATE SET
  title = EXCLUDED.title,
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO public.event_acts (event_id, act_no, assignment_source, confidence)
SELECT DISTINCT tel.event_id, te.chapter_no, 'timeline', 'high'
FROM public.timeline_event_links tel
JOIN public.timeline_entries te ON te.time_key = tel.time_key
WHERE te.chapter_no IS NOT NULL
ON CONFLICT (event_id, act_no) DO NOTHING;

WITH archive_rows AS (
  SELECT
    regexp_replace(sl.note, '^生成事件\s+', '') AS event_id,
    coalesce(r.payload ->> '对应板块', '') AS section_name,
    e.start_date
  FROM public.source_links sl
  JOIN public.raw_import_records r
    ON sl.target_type = 'raw_import' AND sl.target_id = r.id
  JOIN public.events e
    ON e.id = regexp_replace(sl.note, '^生成事件\s+', '')
  WHERE r.source_file = '庐山历史归档_Table1_Default View.xlsx'
)
INSERT INTO public.event_acts (event_id, act_no, assignment_source, confidence)
SELECT event_id, 1, 'archive_section', 'high'
FROM archive_rows
WHERE section_name LIKE '%PART01%'
ON CONFLICT (event_id, act_no) DO NOTHING;

WITH archive_rows AS (
  SELECT
    regexp_replace(sl.note, '^生成事件\s+', '') AS event_id,
    coalesce(r.payload ->> '对应板块', '') AS section_name,
    e.start_date
  FROM public.source_links sl
  JOIN public.raw_import_records r
    ON sl.target_type = 'raw_import' AND sl.target_id = r.id
  JOIN public.events e
    ON e.id = regexp_replace(sl.note, '^生成事件\s+', '')
  WHERE r.source_file = '庐山历史归档_Table1_Default View.xlsx'
)
INSERT INTO public.event_acts (event_id, act_no, assignment_source, confidence)
SELECT
  event_id,
  CASE
    WHEN section_name LIKE '%PART3%' THEN 5
    WHEN start_date <= DATE '1938-07-31' THEN 2
    WHEN start_date <= DATE '1938-10-31' THEN 3
    ELSE 4
  END,
  'archive_section',
  CASE WHEN section_name LIKE '%PART3%' THEN 'high' ELSE 'medium' END
FROM archive_rows
WHERE section_name LIKE '%PART02%' OR section_name LIKE '%PART3%'
ON CONFLICT (event_id, act_no) DO NOTHING;

INSERT INTO public.event_acts (event_id, act_no, assignment_source, confidence)
SELECT
  e.id,
  CASE
    WHEN e.start_date < DATE '1938-05-01' THEN 1
    WHEN e.start_date <= DATE '1938-07-31' THEN 2
    WHEN e.start_date <= DATE '1938-10-31' THEN 3
    WHEN e.start_date < DATE '1945-05-01' THEN 4
    ELSE 5
  END,
  'date_fallback',
  'medium'
FROM public.events e
WHERE NOT EXISTS (SELECT 1 FROM public.event_acts ea WHERE ea.event_id = e.id)
ON CONFLICT (event_id, act_no) DO NOTHING;

CREATE OR REPLACE VIEW public.event_sites_v AS
WITH located AS (
  SELECT
    el.id AS event_location_id,
    el.event_id,
    lower(regexp_replace(trim(el.location_name), '\s+', '', 'g')) || ':' ||
      round(el.longitude::numeric, 5)::text || ':' || round(el.latitude::numeric, 5)::text AS site_key,
    el.location_name,
    el.address_raw,
    el.longitude,
    el.latitude,
    el.spatial_precision,
    el.coordinate_confidence,
    e.title,
    e.summary,
    e.region,
    e.region_id,
    e.start_time_raw,
    e.start_date,
    e.end_date,
    e.year,
    e.event_domain,
    e.actor_side,
    e.importance
  FROM public.event_locations el
  JOIN public.events e ON e.id = el.event_id
  WHERE e.status = 'active'
), grouped AS (
  SELECT
    site_key,
    'site-' || substr(md5(site_key), 1, 12) AS point_id,
    min(location_name) AS location_name,
    min(address_raw) AS address_raw,
    avg(longitude)::double precision AS longitude,
    avg(latitude)::double precision AS latitude,
    min(spatial_precision) AS spatial_precision,
    min(coordinate_confidence) AS coordinate_confidence,
    min(region) AS region,
    min(region_id) AS region_id,
    min(start_date) AS start_date,
    max(end_date) AS end_date,
    min(start_time_raw) AS time_raw,
    min(year) AS start_year,
    max(EXTRACT(year FROM end_date)::integer) AS end_year,
    max(importance) AS highlight_level,
    CASE WHEN bool_or(event_domain = 'war') THEN 'battle' ELSE 'event' END AS marker_type,
    CASE WHEN count(DISTINCT actor_side) = 1 THEN min(actor_side) ELSE 'mixed' END AS actor_side,
    count(DISTINCT event_id)::integer AS event_count,
    array_agg(event_id ORDER BY start_date, title) AS event_ids,
    CASE
      WHEN count(DISTINCT event_id) = 1 THEN min(summary)
      ELSE count(DISTINCT event_id)::text || ' 条历史事件按时间顺序归档。'
    END AS summary
  FROM located
  GROUP BY site_key
)
SELECT
  g.*,
  coalesce(a.act_numbers, ARRAY[]::integer[]) AS act_numbers,
  coalesce(a.act_titles, ARRAY[]::text[]) AS act_titles
FROM grouped g
LEFT JOIN LATERAL (
  SELECT
    array_agg(DISTINCT ea.act_no ORDER BY ea.act_no) AS act_numbers,
    array_agg(DISTINCT acts.title ORDER BY acts.title) AS act_titles
  FROM located l
  JOIN public.event_acts ea ON ea.event_id = l.event_id
  JOIN public.acts ON acts.act_no = ea.act_no
  WHERE l.site_key = g.site_key
) a ON true;

CREATE OR REPLACE VIEW public.map_points_v AS
SELECT
  p.id AS point_id,
  'place'::text AS point_source,
  p.id AS source_id,
  p.place_type AS marker_type,
  p.name,
  p.summary,
  p.region,
  p.region_id,
  p.base_info,
  p.tags,
  p.longitude,
  p.latitude,
  p.geom_point,
  p.spatial_precision,
  p.coordinate_confidence,
  NULL::date AS start_date,
  NULL::date AS end_date,
  NULL::text AS time_raw,
  NULL::text AS event_domain,
  NULL::text AS actor_side,
  p.start_year,
  p.end_year,
  p.highlight_level,
  coalesce(pa.event_count, 0) AS event_count,
  coalesce(pa.event_ids, ARRAY[]::text[]) AS event_ids,
  coalesce(pa.act_numbers, ARRAY[]::integer[]) AS act_numbers,
  coalesce(pa.act_titles, ARRAY[]::text[]) AS act_titles,
  p.status
FROM public.places p
LEFT JOIN LATERAL (
  SELECT
    count(DISTINCT el.event_id)::integer AS event_count,
    array_agg(DISTINCT el.event_id) AS event_ids,
    array_agg(DISTINCT ea.act_no ORDER BY ea.act_no) AS act_numbers,
    array_agg(DISTINCT acts.title ORDER BY acts.title) AS act_titles
  FROM public.event_locations el
  JOIN public.event_acts ea ON ea.event_id = el.event_id
  JOIN public.acts ON acts.act_no = ea.act_no
  WHERE round(el.longitude::numeric, 5) = round(p.longitude::numeric, 5)
    AND round(el.latitude::numeric, 5) = round(p.latitude::numeric, 5)
) pa ON true
WHERE p.status = 'active'
UNION ALL
SELECT
  s.point_id,
  'event_site'::text AS point_source,
  s.site_key AS source_id,
  s.marker_type,
  s.location_name AS name,
  s.summary,
  s.region,
  s.region_id,
  concat_ws('｜', s.event_count::text || '个事件', s.location_name) AS base_info,
  jsonb_build_array('事件点位', CASE WHEN s.marker_type = 'battle' THEN '战争事件' ELSE '事务事件' END)::text AS tags,
  s.longitude,
  s.latitude,
  ST_SetSRID(ST_MakePoint(s.longitude, s.latitude), 4326) AS geom_point,
  s.spatial_precision,
  s.coordinate_confidence,
  s.start_date,
  s.end_date,
  s.time_raw,
  CASE WHEN s.marker_type = 'battle' THEN 'war' ELSE 'affairs' END AS event_domain,
  s.actor_side,
  s.start_year,
  s.end_year,
  s.highlight_level,
  s.event_count,
  s.event_ids,
  s.act_numbers,
  s.act_titles,
  'active'::text AS status
FROM public.event_sites_v s;

CREATE OR REPLACE VIEW public.regions AS
SELECT
  coalesce(nullif(region_id, ''), lower(regexp_replace(region, '\s+', '-', 'g'))) AS id,
  coalesce(nullif(region_id, ''), lower(regexp_replace(region, '\s+', '-', 'g'))) AS code,
  region AS name,
  'derived'::text AS region_type,
  count(*)::integer AS count,
  NULL::text AS parent_id,
  NULL::text AS geom,
  NULL::text AS bbox,
  avg(longitude)::double precision AS center_lng,
  avg(latitude)::double precision AS center_lat,
  0::integer AS sort_order,
  '由合并后的地图点位派生，用于区域筛选。'::text AS description,
  now() AS created_at,
  now() AS updated_at
FROM public.map_points_v
GROUP BY
  coalesce(nullif(region_id, ''), lower(regexp_replace(region, '\s+', '-', 'g'))),
  region;

COMMIT;
