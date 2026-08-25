import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const dbPath = resolve(__dirname, '../data/shanjian.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

export function initSchema() {
  db.exec(`
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, nickname TEXT, password_hash TEXT, role TEXT, favorites TEXT DEFAULT '[]', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS admins (id TEXT PRIMARY KEY, email TEXT UNIQUE, nickname TEXT, password_hash TEXT, role TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS regions (id TEXT PRIMARY KEY, name TEXT, count INTEGER DEFAULT 0, parent_id TEXT, geom TEXT);
CREATE TABLE IF NOT EXISTS places (id TEXT PRIMARY KEY, name TEXT, slug TEXT UNIQUE, place_type TEXT, longitude REAL, latitude REAL, altitude REAL, geom TEXT, region_id TEXT, region TEXT, start_year INTEGER, end_year INTEGER, highlight_level INTEGER, base_info TEXT, summary TEXT, tags TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, title TEXT, start_time_raw TEXT, normalized_start TEXT, year INTEGER, month INTEGER, summary TEXT, region TEXT, place_id TEXT);
CREATE TABLE IF NOT EXISTS persons (id TEXT PRIMARY KEY, name TEXT, aliases TEXT, summary TEXT);
CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, media_type TEXT, url TEXT, title TEXT, caption TEXT, is_ai_generated INTEGER, source_id TEXT);
CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, title TEXT, source_type TEXT, citation TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS ugc_submissions (id TEXT PRIMARY KEY, submission_type TEXT, title TEXT, submitter TEXT, source_note TEXT, status TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS export_requests (id TEXT PRIMARY KEY, request_id TEXT, applicant TEXT, data_scope TEXT, reason TEXT, status TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS admin_logs (id TEXT PRIMARY KEY, operator TEXT, action TEXT, target TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS system_configs (id TEXT PRIMARY KEY, key TEXT UNIQUE, value TEXT);
`);
}

export function all(sql, params = {}) { return db.prepare(sql).all(params); }
export function get(sql, params = {}) { return db.prepare(sql).get(params); }
export function run(sql, params = {}) { return db.prepare(sql).run(params); }

export function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

export function rowToPlace(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    placeType: row.place_type,
    longitude: row.longitude,
    latitude: row.latitude,
    altitude: row.altitude ?? undefined,
    regionId: row.region_id,
    region: row.region,
    startYear: row.start_year,
    endYear: row.end_year,
    highlightLevel: row.highlight_level,
    baseInfo: row.base_info,
    summary: row.summary,
    tags: parseJson(row.tags, []),
  };
}

export function rowToEvent(row) {
  return { id: row.id, title: row.title, startTimeRaw: row.start_time_raw, normalizedStart: row.normalized_start, year: row.year, month: row.month ?? undefined, summary: row.summary, region: row.region };
}
