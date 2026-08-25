import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dbPath = fileURLToPath(new URL('../data/shanjian-prisma.sqlite', import.meta.url));

if (!existsSync(dirname(dbPath))) mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);

const tables = [
  'dataset_versions', 'notifications', 'download_records', 'place_relations', 'timeline_keyframes',
  'source_links', 'media_links', 'event_persons', 'place_events', 'favorites',
  'ugc_submissions', 'export_requests', 'admin_logs', 'system_configs',
  'media', 'sources', 'persons', 'events', 'places', 'regions', 'sessions', 'admins', 'users',
];

db.exec('PRAGMA foreign_keys = OFF;');
for (const table of tables) db.exec(`DROP TABLE IF EXISTS ${table};`);

db.exec(`
CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  avatar_url TEXT,
  organization TEXT,
  bio TEXT,
  favorites TEXT NOT NULL DEFAULT '[]',
  settings TEXT NOT NULL DEFAULT '{}',
  last_login_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX users_status_idx ON users(status);

CREATE TABLE admins (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  status TEXT NOT NULL DEFAULT 'active',
  avatar_url TEXT,
  permissions TEXT NOT NULL DEFAULT '[]',
  last_login_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX admins_status_idx ON admins(status);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  subject_id TEXT NOT NULL,
  subject_type TEXT NOT NULL DEFAULT 'user',
  role TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX sessions_subject_id_idx ON sessions(subject_id);
CREATE INDEX sessions_role_idx ON sessions(role);

CREATE TABLE regions (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  region_type TEXT NOT NULL DEFAULT 'area',
  count INTEGER NOT NULL DEFAULT 0,
  parent_id TEXT,
  geom TEXT,
  bbox TEXT,
  center_lng REAL,
  center_lat REAL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX regions_parent_id_idx ON regions(parent_id);

CREATE TABLE places (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  official_name TEXT,
  historical_names TEXT NOT NULL DEFAULT '[]',
  place_type TEXT NOT NULL,
  longitude REAL NOT NULL,
  latitude REAL NOT NULL,
  altitude REAL,
  geom TEXT,
  spatial_precision TEXT NOT NULL DEFAULT 'point',
  region_id TEXT NOT NULL,
  region TEXT NOT NULL,
  address_raw TEXT,
  start_year INTEGER NOT NULL,
  end_year INTEGER NOT NULL,
  start_date_raw TEXT,
  end_date_raw TEXT,
  highlight_level INTEGER NOT NULL,
  base_info TEXT NOT NULL,
  summary TEXT NOT NULL,
  narrative TEXT,
  heritage_level TEXT,
  protection_status TEXT,
  source_confidence TEXT NOT NULL DEFAULT 'demo',
  tags TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  review_status TEXT NOT NULL DEFAULT 'approved',
  primary_media_id TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX places_place_type_idx ON places(place_type);
CREATE INDEX places_region_id_idx ON places(region_id);
CREATE INDEX places_start_year_idx ON places(start_year);
CREATE INDEX places_status_idx ON places(status);

CREATE TABLE events (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  slug TEXT UNIQUE,
  event_type TEXT NOT NULL DEFAULT 'historical',
  start_time_raw TEXT NOT NULL,
  end_time_raw TEXT,
  normalized_start TEXT NOT NULL,
  normalized_end TEXT,
  year INTEGER NOT NULL,
  month INTEGER,
  day INTEGER,
  summary TEXT NOT NULL,
  description TEXT,
  region TEXT NOT NULL,
  region_id TEXT,
  place_id TEXT,
  importance INTEGER NOT NULL DEFAULT 1,
  source_confidence TEXT NOT NULL DEFAULT 'demo',
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX events_year_idx ON events(year);
CREATE INDEX events_place_id_idx ON events(place_id);
CREATE INDEX events_region_id_idx ON events(region_id);

CREATE TABLE persons (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  aliases TEXT NOT NULL,
  birth_raw TEXT,
  death_raw TEXT,
  role_title TEXT,
  summary TEXT NOT NULL,
  biography TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX persons_name_idx ON persons(name);

CREATE TABLE media (
  id TEXT PRIMARY KEY NOT NULL,
  media_type TEXT NOT NULL,
  url TEXT,
  storage_key TEXT,
  thumbnail_url TEXT,
  title TEXT NOT NULL,
  caption TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  width INTEGER,
  height INTEGER,
  is_ai_generated BOOLEAN NOT NULL DEFAULT false,
  ai_prompt TEXT,
  license TEXT,
  provider TEXT,
  credit_line TEXT,
  captured_at_raw TEXT,
  source_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX media_media_type_idx ON media(media_type);
CREATE INDEX media_source_id_idx ON media(source_id);

CREATE TABLE sources (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  citation TEXT NOT NULL,
  author TEXT,
  publisher TEXT,
  publish_date_raw TEXT,
  url TEXT,
  archive_code TEXT,
  reliability TEXT NOT NULL DEFAULT 'to_verify',
  note TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX sources_source_type_idx ON sources(source_type);

CREATE TABLE place_events (
  id TEXT PRIMARY KEY NOT NULL,
  place_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  note TEXT,
  confidence TEXT NOT NULL DEFAULT 'demo',
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(place_id, event_id, relation_type)
);
CREATE INDEX place_events_event_id_idx ON place_events(event_id);

CREATE TABLE event_persons (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  role TEXT NOT NULL,
  note TEXT,
  UNIQUE(event_id, person_id, role)
);
CREATE INDEX event_persons_person_id_idx ON event_persons(person_id);

CREATE TABLE media_links (
  id TEXT PRIMARY KEY NOT NULL,
  media_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'illustrates',
  sort_order INTEGER NOT NULL DEFAULT 0,
  note TEXT
);
CREATE INDEX media_links_target_type_target_id_idx ON media_links(target_type, target_id);
CREATE INDEX media_links_media_id_idx ON media_links(media_id);

CREATE TABLE source_links (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'evidence',
  quote TEXT,
  note TEXT
);
CREATE INDEX source_links_target_type_target_id_idx ON source_links(target_type, target_id);
CREATE INDEX source_links_source_id_idx ON source_links(source_id);

CREATE TABLE place_relations (
  id TEXT PRIMARY KEY NOT NULL,
  from_place_id TEXT NOT NULL,
  to_place_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  title TEXT,
  note TEXT,
  weight INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX place_relations_from_place_id_idx ON place_relations(from_place_id);
CREATE INDEX place_relations_to_place_id_idx ON place_relations(to_place_id);

CREATE TABLE timeline_keyframes (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER,
  day INTEGER,
  place_id TEXT,
  event_id TEXT,
  camera TEXT NOT NULL DEFAULT '{}',
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);
CREATE INDEX timeline_keyframes_year_idx ON timeline_keyframes(year);
CREATE INDEX timeline_keyframes_place_id_idx ON timeline_keyframes(place_id);

CREATE TABLE favorites (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  place_id TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, place_id)
);
CREATE INDEX favorites_place_id_idx ON favorites(place_id);

CREATE TABLE ugc_submissions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT,
  submission_type TEXT NOT NULL,
  title TEXT NOT NULL,
  submitter TEXT NOT NULL,
  place_payload TEXT,
  text_payload TEXT,
  media_payload TEXT,
  source_note TEXT NOT NULL,
  status TEXT NOT NULL,
  review_note TEXT,
  reviewer_id TEXT,
  reviewed_at DATETIME,
  published_target_type TEXT,
  published_target_id TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ugc_submissions_status_idx ON ugc_submissions(status);
CREATE INDEX ugc_submissions_user_id_idx ON ugc_submissions(user_id);

CREATE TABLE export_requests (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT,
  request_id TEXT NOT NULL,
  applicant TEXT NOT NULL,
  data_scope TEXT NOT NULL,
  filters TEXT NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  review_note TEXT,
  approved_by TEXT,
  file_url TEXT,
  processed_at DATETIME,
  download_expires_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX export_requests_status_idx ON export_requests(status);
CREATE INDEX export_requests_user_id_idx ON export_requests(user_id);

CREATE TABLE download_records (
  id TEXT PRIMARY KEY NOT NULL,
  export_request_id TEXT NOT NULL,
  user_id TEXT,
  token TEXT NOT NULL UNIQUE,
  downloaded_at DATETIME,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX download_records_export_request_id_idx ON download_records(export_request_id);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT,
  admin_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  read_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX notifications_user_id_idx ON notifications(user_id);
CREATE INDEX notifications_admin_id_idx ON notifications(admin_id);

CREATE TABLE admin_logs (
  id TEXT PRIMARY KEY NOT NULL,
  operator TEXT NOT NULL,
  operator_id TEXT,
  operator_role TEXT NOT NULL DEFAULT 'admin',
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  ip_address TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX admin_logs_action_idx ON admin_logs(action);
CREATE INDEX admin_logs_target_type_target_id_idx ON admin_logs(target_type, target_id);

CREATE TABLE system_configs (
  id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  updated_by TEXT,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dataset_versions (
  id TEXT PRIMARY KEY NOT NULL,
  version TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  source_note TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

db.exec('PRAGMA foreign_keys = ON;');
db.close();

console.log(`SQLite schema prepared for Prisma at ${dbPath}`);
