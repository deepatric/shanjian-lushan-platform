-- 山鉴-庐山抗战文化景观数字平台 PostgreSQL/PostGIS schema
-- 目标：保留旧表到 legacy，重建面向 places/events/timeline/users 的规范内容库。

BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS legacy;

DO $$
DECLARE
  tbl text;
  old_tables text[] := ARRAY[
    'archive_features',
    'archive_records',
    'favorites',
    'nodes',
    'relations',
    'sessions',
    'submissions',
    'timeline_chapters',
    'tour_nodes',
    'tours',
    'users'
  ];
BEGIN
  FOREACH tbl IN ARRAY old_tables LOOP
    IF to_regclass('legacy.' || tbl) IS NULL AND to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA legacy', tbl);
    END IF;
  END LOOP;

  IF to_regclass('legacy.users_id_seq') IS NULL AND to_regclass('public.users_id_seq') IS NOT NULL THEN
    ALTER SEQUENCE public.users_id_seq SET SCHEMA legacy;
  END IF;
  IF to_regclass('legacy.relations_id_seq') IS NULL AND to_regclass('public.relations_id_seq') IS NOT NULL THEN
    ALTER SEQUENCE public.relations_id_seq SET SCHEMA legacy;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP VIEW IF EXISTS public.map_points_v;
DROP VIEW IF EXISTS public.regions;

CREATE TABLE IF NOT EXISTS public.raw_import_records (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  batch_key text NOT NULL,
  source_file text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('xlsx', 'docx', 'legacy', 'manual')),
  sheet_name text,
  row_index integer,
  row_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_key, source_file, row_key)
);

CREATE INDEX IF NOT EXISTS raw_import_records_source_idx
  ON public.raw_import_records (source_file, row_index);
CREATE INDEX IF NOT EXISTS raw_import_records_payload_idx
  ON public.raw_import_records USING gin (payload);

CREATE TABLE IF NOT EXISTS public.users (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email text NOT NULL UNIQUE,
  username text UNIQUE,
  nickname text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'pending')),
  avatar_url text,
  organization text,
  bio text,
  favorites text NOT NULL DEFAULT '[]',
  settings text NOT NULL DEFAULT '{}',
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_status_idx ON public.users (status);

CREATE TABLE IF NOT EXISTS public.admins (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email text NOT NULL UNIQUE,
  nickname text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  permissions text NOT NULL DEFAULT '[]',
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admins_status_idx ON public.admins (status);

CREATE TABLE IF NOT EXISTS public.sessions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  subject_id text NOT NULL,
  subject_type text NOT NULL DEFAULT 'user' CHECK (subject_type IN ('user', 'admin')),
  role text NOT NULL CHECK (role IN ('user', 'admin')),
  token text NOT NULL UNIQUE,
  ip_address text,
  user_agent text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_subject_idx ON public.sessions (subject_id);
CREATE INDEX IF NOT EXISTS sessions_role_idx ON public.sessions (role);

CREATE TABLE IF NOT EXISTS public.sources (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title text NOT NULL,
  source_type text NOT NULL,
  citation text NOT NULL,
  author text,
  publisher text,
  publish_date_raw text,
  url text,
  archive_code text,
  reliability text NOT NULL DEFAULT 'to_verify'
    CHECK (reliability IN ('high', 'medium', 'low', 'to_verify', 'reviewed')),
  note text,
  metadata text NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sources_type_idx ON public.sources (source_type);
CREATE INDEX IF NOT EXISTS sources_title_trgm_idx ON public.sources USING gin (title gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.places (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  official_name text,
  historical_names text NOT NULL DEFAULT '[]',
  place_type text NOT NULL DEFAULT 'heritage'
    CHECK (place_type IN ('heritage', 'battle', 'event')),
  place_kind text NOT NULL DEFAULT 'heritage_landscape',
  longitude double precision NOT NULL CHECK (longitude BETWEEN 113 AND 118),
  latitude double precision NOT NULL CHECK (latitude BETWEEN 27 AND 31),
  altitude double precision,
  geom text,
  geom_point geometry(Point, 4326)
    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED,
  spatial_precision text NOT NULL DEFAULT 'exact'
    CHECK (spatial_precision IN ('exact', 'road', 'village', 'site', 'scenic_area', 'town', 'area_estimated')),
  coordinate_confidence text NOT NULL DEFAULT 'medium'
    CHECK (coordinate_confidence IN ('high', 'medium', 'low', 'to_verify')),
  region_id text NOT NULL,
  region text NOT NULL,
  address_raw text,
  start_year integer NOT NULL DEFAULT 1937,
  end_year integer NOT NULL DEFAULT 1945,
  start_date_raw text,
  end_date_raw text,
  highlight_level integer NOT NULL DEFAULT 1 CHECK (highlight_level BETWEEN 1 AND 3),
  base_info text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  narrative text,
  heritage_level text,
  protection_status text,
  source_confidence text NOT NULL DEFAULT 'to_verify',
  tags text NOT NULL DEFAULT '[]',
  metadata text NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  review_status text NOT NULL DEFAULT 'approved' CHECK (review_status IN ('pending', 'approved', 'rejected')),
  primary_media_id text,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS places_type_idx ON public.places (place_type);
CREATE INDEX IF NOT EXISTS places_kind_idx ON public.places (place_kind);
CREATE INDEX IF NOT EXISTS places_region_text_idx ON public.places (region);
CREATE INDEX IF NOT EXISTS places_start_year_idx ON public.places (start_year);
CREATE INDEX IF NOT EXISTS places_status_idx ON public.places (status);
CREATE INDEX IF NOT EXISTS places_geom_point_idx ON public.places USING gist (geom_point);
CREATE INDEX IF NOT EXISTS places_name_trgm_idx ON public.places USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.events (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title text NOT NULL,
  slug text UNIQUE,
  event_type text NOT NULL DEFAULT 'historical',
  event_domain text NOT NULL CHECK (event_domain IN ('war', 'affairs')),
  event_subtype text NOT NULL,
  actor_side text NOT NULL
    CHECK (actor_side IN ('japanese_army', 'chinese_forces', 'civilian_foreign', 'collaborationist', 'mixed')),
  initiator_side text
    CHECK (initiator_side IS NULL OR initiator_side IN ('japanese_army', 'chinese_forces', 'civilian_foreign', 'collaborationist', 'mixed')),
  start_time_raw text NOT NULL,
  end_time_raw text,
  normalized_start text NOT NULL,
  normalized_end text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  date_precision text NOT NULL DEFAULT 'day'
    CHECK (date_precision IN ('day', 'month', 'year', 'range', 'season')),
  year integer NOT NULL,
  month integer,
  day integer,
  summary text NOT NULL DEFAULT '',
  description text,
  narrative text,
  classification_note text,
  region text NOT NULL DEFAULT '',
  region_id text,
  place_id text REFERENCES public.places(id) ON DELETE SET NULL,
  importance integer NOT NULL DEFAULT 1 CHECK (importance BETWEEN 1 AND 5),
  source_confidence text NOT NULL DEFAULT 'to_verify'
    CHECK (source_confidence IN ('high', 'medium', 'low', 'to_verify', 'raw_import')),
  tags text NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_year_idx ON public.events (year);
CREATE INDEX IF NOT EXISTS events_domain_idx ON public.events (event_domain);
CREATE INDEX IF NOT EXISTS events_actor_idx ON public.events (actor_side);
CREATE INDEX IF NOT EXISTS events_start_date_idx ON public.events (start_date);
CREATE INDEX IF NOT EXISTS events_place_idx ON public.events (place_id);
CREATE INDEX IF NOT EXISTS events_title_trgm_idx ON public.events USING gin (title gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.event_locations (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  location_name text NOT NULL,
  address_raw text,
  longitude double precision NOT NULL CHECK (longitude BETWEEN 113 AND 118),
  latitude double precision NOT NULL CHECK (latitude BETWEEN 27 AND 31),
  altitude double precision,
  geom_point geometry(Point, 4326)
    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED,
  spatial_precision text NOT NULL DEFAULT 'site'
    CHECK (spatial_precision IN ('exact', 'road', 'village', 'site', 'scenic_area', 'town', 'area_estimated')),
  coordinate_confidence text NOT NULL DEFAULT 'medium'
    CHECK (coordinate_confidence IN ('high', 'medium', 'low', 'to_verify')),
  is_primary boolean NOT NULL DEFAULT true,
  source_note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_locations_event_idx ON public.event_locations (event_id);
CREATE INDEX IF NOT EXISTS event_locations_geom_idx ON public.event_locations USING gist (geom_point);
CREATE INDEX IF NOT EXISTS event_locations_name_trgm_idx ON public.event_locations USING gin (location_name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.place_events (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  place_id text NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  relation_type text NOT NULL DEFAULT 'related',
  note text,
  confidence text NOT NULL DEFAULT 'medium'
    CHECK (confidence IN ('high', 'medium', 'low', 'to_verify')),
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (place_id, event_id, relation_type)
);

CREATE INDEX IF NOT EXISTS place_events_event_idx ON public.place_events (event_id);

CREATE TABLE IF NOT EXISTS public.persons (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  aliases text NOT NULL DEFAULT '[]',
  birth_raw text,
  death_raw text,
  role_title text,
  summary text NOT NULL DEFAULT '',
  biography text,
  tags text NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS persons_name_idx ON public.persons (name);
CREATE INDEX IF NOT EXISTS persons_name_trgm_idx ON public.persons USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.event_persons (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  person_id text NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'mentioned',
  side text CHECK (side IS NULL OR side IN ('japanese_army', 'chinese_forces', 'civilian_foreign', 'collaborationist', 'mixed')),
  note text,
  UNIQUE (event_id, person_id, role)
);

CREATE INDEX IF NOT EXISTS event_persons_person_idx ON public.event_persons (person_id);

CREATE TABLE IF NOT EXISTS public.media (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  media_type text NOT NULL DEFAULT 'image'
    CHECK (media_type IN ('image', 'archive', 'ai_restoration', 'map', 'document')),
  url text,
  storage_key text,
  thumbnail_url text,
  title text NOT NULL,
  caption text NOT NULL DEFAULT '',
  mime_type text,
  size_bytes integer,
  width integer,
  height integer,
  is_ai_generated boolean NOT NULL DEFAULT false,
  ai_prompt text,
  license text,
  provider text,
  credit_line text,
  captured_at_raw text,
  source_id text REFERENCES public.sources(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  metadata text NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_type_idx ON public.media (media_type);
CREATE INDEX IF NOT EXISTS media_source_idx ON public.media (source_id);

CREATE TABLE IF NOT EXISTS public.media_links (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  media_id text NOT NULL REFERENCES public.media(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('place', 'event', 'event_location', 'timeline', 'source')),
  target_id text NOT NULL,
  relation_type text NOT NULL DEFAULT 'illustrates',
  sort_order integer NOT NULL DEFAULT 0,
  note text
);

CREATE INDEX IF NOT EXISTS media_links_target_idx ON public.media_links (target_type, target_id);
CREATE INDEX IF NOT EXISTS media_links_media_idx ON public.media_links (media_id);

CREATE TABLE IF NOT EXISTS public.source_links (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  source_id text NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('place', 'event', 'event_location', 'timeline', 'person', 'media', 'raw_import')),
  target_id text NOT NULL,
  relation_type text NOT NULL DEFAULT 'evidence',
  quote text,
  note text
);

CREATE INDEX IF NOT EXISTS source_links_target_idx ON public.source_links (target_type, target_id);
CREATE INDEX IF NOT EXISTS source_links_source_idx ON public.source_links (source_id);

CREATE TABLE IF NOT EXISTS public.geo_evidence (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  target_type text NOT NULL CHECK (target_type IN ('place', 'event_location')),
  target_id text NOT NULL,
  location_label text NOT NULL,
  longitude double precision,
  latitude double precision,
  precision_level text NOT NULL
    CHECK (precision_level IN ('exact', 'road', 'village', 'site', 'scenic_area', 'town', 'area_estimated', 'unresolved')),
  confidence text NOT NULL DEFAULT 'medium'
    CHECK (confidence IN ('high', 'medium', 'low', 'to_verify', 'unresolved')),
  evidence_type text NOT NULL CHECK (evidence_type IN ('source_table', 'legacy_annotation', 'web_research', 'manual_inference')),
  evidence_title text,
  evidence_url text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS geo_evidence_target_idx ON public.geo_evidence (target_type, target_id);

CREATE TABLE IF NOT EXISTS public.timeline_entries (
  time_key text PRIMARY KEY,
  start_date date NOT NULL,
  end_date date NOT NULL,
  date_precision text NOT NULL CHECK (date_precision IN ('day', 'month', 'year', 'range', 'season')),
  sort_order integer NOT NULL DEFAULT 0,
  chapter_no integer,
  chapter_title text,
  title text NOT NULL,
  narration text NOT NULL,
  scope text NOT NULL DEFAULT 'lushan' CHECK (scope IN ('national', 'jiangxi_jiujiang', 'lushan', 'postwar')),
  map_focus jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_context text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS timeline_entries_start_idx ON public.timeline_entries (start_date);
CREATE INDEX IF NOT EXISTS timeline_entries_chapter_idx ON public.timeline_entries (chapter_no, sort_order);

CREATE TABLE IF NOT EXISTS public.timeline_event_links (
  time_key text NOT NULL REFERENCES public.timeline_entries(time_key) ON DELETE CASCADE,
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  relation_type text NOT NULL DEFAULT 'mentions',
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (time_key, event_id, relation_type)
);

CREATE TABLE IF NOT EXISTS public.timeline_keyframes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title text NOT NULL,
  year integer NOT NULL,
  month integer,
  day integer,
  place_id text REFERENCES public.places(id) ON DELETE SET NULL,
  event_id text REFERENCES public.events(id) ON DELETE SET NULL,
  camera text NOT NULL DEFAULT '{}',
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived'))
);

CREATE INDEX IF NOT EXISTS timeline_keyframes_year_idx ON public.timeline_keyframes (year);
CREATE INDEX IF NOT EXISTS timeline_keyframes_place_idx ON public.timeline_keyframes (place_id);

CREATE TABLE IF NOT EXISTS public.place_relations (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  from_place_id text NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  to_place_id text NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  relation_type text NOT NULL,
  title text,
  note text,
  weight integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS place_relations_from_idx ON public.place_relations (from_place_id);
CREATE INDEX IF NOT EXISTS place_relations_to_idx ON public.place_relations (to_place_id);

CREATE TABLE IF NOT EXISTS public.favorites (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  place_id text NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, place_id)
);

CREATE INDEX IF NOT EXISTS favorites_place_idx ON public.favorites (place_id);

CREATE TABLE IF NOT EXISTS public.ugc_submissions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text REFERENCES public.users(id) ON DELETE SET NULL,
  submission_type text NOT NULL CHECK (submission_type IN ('place', 'text', 'media')),
  title text NOT NULL,
  submitter text NOT NULL,
  place_payload text,
  text_payload text,
  media_payload text,
  source_note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note text,
  reviewer_id text,
  reviewed_at timestamptz,
  published_target_type text,
  published_target_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ugc_submissions_status_idx ON public.ugc_submissions (status);
CREATE INDEX IF NOT EXISTS ugc_submissions_user_idx ON public.ugc_submissions (user_id);

CREATE TABLE IF NOT EXISTS public.export_requests (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text REFERENCES public.users(id) ON DELETE SET NULL,
  request_id text NOT NULL UNIQUE,
  applicant text NOT NULL,
  data_scope text NOT NULL,
  filters text NOT NULL DEFAULT '{}',
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note text,
  approved_by text,
  file_url text,
  processed_at timestamptz,
  download_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS export_requests_status_idx ON public.export_requests (status);
CREATE INDEX IF NOT EXISTS export_requests_user_idx ON public.export_requests (user_id);

CREATE TABLE IF NOT EXISTS public.download_records (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  export_request_id text NOT NULL REFERENCES public.export_requests(id) ON DELETE CASCADE,
  user_id text REFERENCES public.users(id) ON DELETE SET NULL,
  token text NOT NULL UNIQUE,
  downloaded_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS download_records_export_idx ON public.download_records (export_request_id);

CREATE TABLE IF NOT EXISTS public.notifications (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text REFERENCES public.users(id) ON DELETE CASCADE,
  admin_id text REFERENCES public.admins(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_admin_idx ON public.notifications (admin_id);

CREATE TABLE IF NOT EXISTS public.admin_logs (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  operator text NOT NULL,
  operator_id text,
  operator_role text NOT NULL DEFAULT 'admin',
  action text NOT NULL,
  target text NOT NULL,
  target_type text,
  target_id text,
  ip_address text,
  metadata text NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_logs_action_idx ON public.admin_logs (action);
CREATE INDEX IF NOT EXISTS admin_logs_target_idx ON public.admin_logs (target_type, target_id);

CREATE TABLE IF NOT EXISTS public.system_configs (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  scope text NOT NULL DEFAULT 'global',
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dataset_versions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  version text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  source_note text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW public.regions AS
WITH region_points AS (
  SELECT region_id, region, longitude, latitude, created_at, updated_at
  FROM public.places
  WHERE status = 'active'
  UNION ALL
  SELECT e.region_id, e.region, el.longitude, el.latitude, el.created_at, e.updated_at
  FROM public.events e
  JOIN public.event_locations el ON el.event_id = e.id
  WHERE e.status = 'active'
)
SELECT
  COALESCE(NULLIF(region_id, ''), lower(regexp_replace(region, '\s+', '-', 'g'))) AS id,
  COALESCE(NULLIF(region_id, ''), lower(regexp_replace(region, '\s+', '-', 'g'))) AS code,
  region AS name,
  'derived'::text AS region_type,
  count(*)::integer AS count,
  NULL::text AS parent_id,
  NULL::text AS geom,
  NULL::text AS bbox,
  avg(longitude)::double precision AS center_lng,
  avg(latitude)::double precision AS center_lat,
  0::integer AS sort_order,
  '由 places.region 派生的兼容视图，不作为核心规范表维护。'::text AS description,
  min(created_at) AS created_at,
  max(updated_at) AS updated_at
FROM region_points
GROUP BY COALESCE(NULLIF(region_id, ''), lower(regexp_replace(region, '\s+', '-', 'g'))), region;

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
  p.status
FROM public.places p
WHERE p.status = 'active'
UNION ALL
SELECT
  el.id AS point_id,
  'event_location'::text AS point_source,
  e.id AS source_id,
  CASE WHEN e.event_domain = 'war' THEN 'battle' ELSE 'event' END AS marker_type,
  e.title || '｜' || el.location_name AS name,
  e.summary,
  e.region,
  e.region_id,
  concat_ws('｜', e.start_time_raw, el.location_name) AS base_info,
  e.tags,
  el.longitude,
  el.latitude,
  el.geom_point,
  el.spatial_precision,
  el.coordinate_confidence,
  e.start_date,
  e.end_date,
  e.start_time_raw AS time_raw,
  e.event_domain,
  e.actor_side,
  e.year AS start_year,
  COALESCE(EXTRACT(year FROM e.end_date)::integer, e.year) AS end_year,
  e.importance AS highlight_level,
  e.status
FROM public.events e
JOIN public.event_locations el ON el.event_id = e.id
WHERE e.status = 'active';

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users',
    'admins',
    'places',
    'events',
    'persons',
    'media',
    'sources',
    'ugc_submissions',
    'export_requests'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',
      t,
      t
    );
  END LOOP;
END $$;

COMMIT;
