import { randomBytes, scryptSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, '../..');
const databaseUrl = process.env.DATABASE_URL;
const supplementalFiles = ['006_place_photos.sql'];
const connectAttempts = Number(process.env.DB_CONNECT_MAX_ATTEMPTS ?? 60);
const connectRetryDelayMs = Number(process.env.DB_CONNECT_RETRY_DELAY_MS ?? 5000);

if (!databaseUrl) throw new Error('DATABASE_URL is required');

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

async function connectToDatabase() {
  let lastError;
  for (let attempt = 1; attempt <= connectAttempts; attempt += 1) {
    const client = new Client({
      connectionString: databaseUrl,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
    try {
      await client.connect();
      if (attempt > 1) console.log(`Database connection restored after ${attempt} attempts`);
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      if (attempt === connectAttempts) break;
      console.warn(`Database is not ready (${attempt}/${connectAttempts}); retrying in ${connectRetryDelayMs}ms`);
      await sleep(connectRetryDelayMs);
    }
  }
  throw lastError;
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${digest.toString('hex')}`;
}

function readAdminAccounts() {
  const raw = process.env.ADMIN_ACCOUNTS_JSON;
  const compactPasswords = process.env.ADMIN_PASSWORDS?.split(',').map((value) => value.trim());
  const accounts = raw
    ? JSON.parse(raw)
    : [
        ['admin-01', 'admin01@shanjian.local', '平台主管'],
        ['admin-02', 'admin02@shanjian.local', '档案管理员'],
        ['admin-03', 'admin03@shanjian.local', '内容管理员'],
        ['admin-04', 'admin04@shanjian.local', '审核管理员'],
        ['admin-05', 'admin05@shanjian.local', '运营管理员'],
      ].map(([id, email, nickname], index) => ({
        id,
        email,
        nickname,
        password: compactPasswords?.[index],
        permissions: ['*'],
      }));
  if (!Array.isArray(accounts) || accounts.length !== 5) {
    throw new Error('ADMIN_ACCOUNTS_JSON or ADMIN_PASSWORDS must contain exactly five accounts');
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

async function applySupplementalFiles(client) {
  for (const file of supplementalFiles) {
    const sql = await readFile(resolve(workspaceRoot, 'server/database', file), 'utf8').catch(() => '');
    if (!sql) continue;
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

const client = await connectToDatabase();

try {
  await client.query('SELECT pg_advisory_lock($1)', [19371945]);
  if (!(await hasDataset(client))) await applyDatabaseFiles(client);
  else console.log('Database dataset already initialized; preserving current records');
  await applySupplementalFiles(client);
  await upsertAdmins(client, readAdminAccounts());
  await client.query('SELECT pg_advisory_unlock($1)', [19371945]);
} finally {
  await client.end();
}
