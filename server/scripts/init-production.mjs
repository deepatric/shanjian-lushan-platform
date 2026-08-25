import { randomBytes, scryptSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, '../..');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error('DATABASE_URL is required');

function hashPassword(password) {
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${digest.toString('hex')}`;
}

function readAdminAccounts() {
  const raw = process.env.ADMIN_ACCOUNTS_JSON;
  if (!raw) throw new Error('ADMIN_ACCOUNTS_JSON is required');
  const accounts = JSON.parse(raw);
  if (!Array.isArray(accounts) || accounts.length !== 5) {
    throw new Error('ADMIN_ACCOUNTS_JSON must contain exactly five accounts');
  }
  for (const account of accounts) {
    if (!account.id || !/^\S+@\S+\.\S+$/.test(account.email ?? '') || !account.nickname || String(account.password ?? '').length < 12) {
      throw new Error('Each admin requires id, email, nickname, and a password of at least 12 characters');
    }
  }
  return accounts;
}

async function hasDataset(client) {
  const result = await client.query(`
    SELECT to_regclass('public.map_points_v') IS NOT NULL AS has_view,
           to_regclass('public.places') IS NOT NULL AS has_places
  `);
  if (!result.rows[0]?.has_view || !result.rows[0]?.has_places) return false;
  const count = await client.query('SELECT count(*)::integer AS count FROM public.places');
  return Number(count.rows[0]?.count ?? 0) > 0;
}

async function applyDatabaseFiles(client) {
  const files = [
    '001_lushan_platform_schema.sql',
    '002_lushan_platform_seed.generated.sql',
    '003_acts_and_grouped_sites.sql',
    '004_global_search_and_point_favorites.sql',
    '005_user_avatars.sql',
  ];
  for (const file of files) {
    const sql = await readFile(resolve(workspaceRoot, 'server/database', file), 'utf8');
    await client.query(sql);
    console.log(`Applied ${file}`);
  }
}

async function upsertAdmins(client, accounts) {
  for (const account of accounts) {
    await client.query(
      `INSERT INTO public.admins (id, email, nickname, password_hash, role, status, permissions)
       VALUES ($1, lower($2), $3, $4, 'admin', 'active', $5)
       ON CONFLICT (email) DO UPDATE SET
         nickname = EXCLUDED.nickname,
         password_hash = EXCLUDED.password_hash,
         status = 'active',
         permissions = EXCLUDED.permissions,
         updated_at = now()`,
      [account.id, account.email, account.nickname, hashPassword(account.password), JSON.stringify(account.permissions ?? ['*'])],
    );
  }
  await client.query("DELETE FROM public.admins WHERE email = 'admin@shanjian.local'");
  console.log(`Initialized ${accounts.length} administrator accounts`);
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

try {
  await client.connect();
  await client.query('SELECT pg_advisory_lock($1)', [19371945]);
  if (!(await hasDataset(client))) await applyDatabaseFiles(client);
  else console.log('Database dataset already initialized; preserving current records');
  await upsertAdmins(client, readAdminAccounts());
  await client.query('SELECT pg_advisory_unlock($1)', [19371945]);
} finally {
  await client.end();
}
