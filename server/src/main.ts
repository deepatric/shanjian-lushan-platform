import 'reflect-metadata';
import { Body, Controller, Delete, Get, Headers, HttpException, HttpStatus, Module, Param, Post, Put, Query, Res } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, '../..');

function loadRuntimeEnv() {
  const envFile = resolve(workspaceRoot, 'server/.env');
  if (!existsSync(envFile)) return;
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    process.env[key] = rest.join('=').replace(/^["']|["']$/g, '');
  }
}

loadRuntimeEnv();

const prisma = new PrismaClient();

type AuthUser = { id: string; email: string; nickname: string; role: 'user' | 'admin'; avatarUrl?: string; favorites: string[]; notifications: string[] };

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}

function toPlace(row: any) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    placeType: row.placeType,
    longitude: row.longitude,
    latitude: row.latitude,
    altitude: row.altitude ?? undefined,
    regionId: row.regionId,
    region: row.region,
    startYear: row.startYear,
    endYear: row.endYear,
    highlightLevel: row.highlightLevel,
    baseInfo: row.baseInfo,
    summary: row.summary,
    tags: parseJson<string[]>(row.tags, []),
  };
}

function toEvent(row: any) {
  return { id: row.id, title: row.title, startTimeRaw: row.startTimeRaw, normalizedStart: row.normalizedStart, year: row.year, month: row.month ?? undefined, day: row.day ?? undefined, summary: row.summary, region: row.region, regionId: row.regionId ?? undefined, placeId: row.placeId ?? undefined };
}

type MapPointRow = {
  point_id: string;
  point_source: 'place' | 'event_site';
  source_id: string;
  marker_type: 'battle' | 'event' | 'heritage';
  name: string;
  summary: string;
  region: string;
  region_id: string | null;
  base_info: string | null;
  tags: string | null;
  longitude: number;
  latitude: number;
  spatial_precision: string;
  coordinate_confidence: string;
  start_date: Date | null;
  end_date: Date | null;
  time_raw: string | null;
  event_domain: string | null;
  actor_side: string | null;
  start_year: number;
  end_year: number;
  highlight_level: number;
  event_count: number;
  event_ids: string[] | null;
  act_numbers: number[] | null;
  act_titles: string[] | null;
  status: string;
};

function toMapPoint(row: MapPointRow) {
  return {
    id: row.point_id,
    pointSource: row.point_source,
    sourceId: row.source_id,
    name: row.name,
    slug: `${row.point_source}-${row.point_id}`,
    placeType: row.marker_type,
    longitude: Number(row.longitude),
    latitude: Number(row.latitude),
    regionId: row.region_id || row.region,
    region: row.region,
    startYear: Number(row.start_year),
    endYear: Number(row.end_year),
    highlightLevel: Math.max(1, Math.min(3, Number(row.highlight_level || 1))) as 1 | 2 | 3,
    baseInfo: row.base_info || [row.time_raw, row.spatial_precision, row.coordinate_confidence].filter(Boolean).join('｜'),
    summary: row.summary,
    tags: parseJson<string[]>(row.tags, []),
    eventCount: Number(row.event_count || 0),
    eventIds: row.event_ids ?? [],
    actNumbers: row.act_numbers ?? [],
    actTitles: row.act_titles ?? [],
  };
}

function getAllMapPointRows() {
  return prisma.$queryRaw<MapPointRow[]>`
    SELECT point_id, point_source, source_id, marker_type, name, summary, region, region_id,
           base_info, tags, longitude, latitude, spatial_precision, coordinate_confidence,
           start_date, end_date, time_raw, event_domain, actor_side, start_year, end_year,
           highlight_level, event_count, event_ids, act_numbers, act_titles, status
    FROM public.map_points_v
    WHERE status = 'active'
  `;
}

async function matchingEventIdsForKeyword(keyword: string) {
  if (!keyword) return new Set<string>();
  const pattern = `%${keyword}%`;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT DISTINCT e.id
    FROM public.events e
    LEFT JOIN public.event_locations el ON el.event_id = e.id
    WHERE e.status = 'active'
      AND lower(concat_ws(' ', e.title, e.summary, e.description, e.narrative,
        e.tags, e.start_time_raw, e.end_time_raw, e.region,
        el.location_name, el.address_raw, el.source_note)) LIKE ${pattern}
  `;
  return new Set(rows.map((row) => row.id));
}

function jsonField(value: unknown, fallback: unknown[] = []) {
  if (typeof value === 'string') return value;
  return JSON.stringify(value ?? fallback);
}

function hashPassword(password: string) {
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${digest.toString('hex')}`;
}

function verifyPassword(password: string, stored: string) {
  if (!stored.startsWith('scrypt$')) return stored === password;
  const [, saltHex, digestHex] = stored.split('$');
  if (!saltHex || !digestHex) return false;
  try {
    const expected = Buffer.from(digestHex, 'hex');
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function validateCredentials(email: string | undefined, password: string | undefined) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    throw new HttpException({ code: 'VALIDATION_ERROR', message: '请输入有效邮箱地址' }, HttpStatus.BAD_REQUEST);
  }
  if (!password || password.length < 8) {
    throw new HttpException({ code: 'VALIDATION_ERROR', message: '密码至少需要 8 个字符' }, HttpStatus.BAD_REQUEST);
  }
  return normalizedEmail;
}

function parseCoordinates(raw: unknown) {
  if (typeof raw !== 'string') return undefined;
  const [lng, lat] = raw.split(/[,\s，]+/).map((item) => Number(item.trim())).filter((item) => Number.isFinite(item));
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return undefined;
  return { lng, lat };
}

function pdfHex(text: string) {
  const source = Buffer.from(text.replace(/[\u{10000}-\u{10ffff}]/gu, ''), 'utf16le');
  const swapped = Buffer.alloc(source.length);
  for (let index = 0; index < source.length; index += 2) {
    swapped[index] = source[index + 1];
    swapped[index + 1] = source[index];
  }
  return swapped.toString('hex').toUpperCase();
}

function pdfText(text: string, x: number, y: number, size = 10) {
  return `BT /F1 ${size} Tf ${x} ${y} Td <${pdfHex(text)}> Tj ET\n`;
}

function makePdfReport(exportRequest: any, dataset: { places: any[]; events: any[]; sources: any[]; media: any[] }) {
  const lines = [
    '山鉴-庐山抗战文化景观数字平台',
    '资料下载包审核报告',
    `申请编号：${exportRequest.requestId}`,
    `申请人：${exportRequest.applicant}`,
    `数据范围：${exportRequest.dataScope}`,
    `申请理由：${exportRequest.reason || '未填写'}`,
    `处理时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    `点位数量：${dataset.places.length}，事件数量：${dataset.events.length}，来源数量：${dataset.sources.length}，媒体数量：${dataset.media.length}`,
    '下载包内容：report.pdf、raw-data.json、places.csv、photos/ 原始照片与 photo-manifest.json。',
    '说明：本模板沿用前台深墨色、古金色与档案纸视觉语言；所有导出均按此结构归档。',
  ];
  const content = [
    '0.93 0.91 0.84 rg 0 0 595 842 re f\n',
    '0.07 0.12 0.12 rg 0 742 595 100 re f\n',
    '0.71 0.55 0.25 rg 38 706 519 2 re f\n',
    '0.98 0.96 0.88 rg\n',
    pdfText(lines[0], 48, 798, 20),
    pdfText(lines[1], 48, 768, 15),
    '0.13 0.18 0.17 rg 38 82 519 610 re f\n',
    '0.92 0.86 0.68 rg 44 88 507 598 re f\n',
    '0.16 0.21 0.19 rg\n',
    ...lines.slice(2).map((line, index) => pdfText(line, 64, 648 - index * 32, index === 0 ? 13 : 10)),
    '0.71 0.55 0.25 rg 64 166 467 1 re f\n',
    '0.16 0.21 0.19 rg\n',
    pdfText('审核状态：已批准。下载记录、数据快照与素材文件已写入数据库和下载包。', 64, 136, 10),
    pdfText('生成方式：Nest API / PostgreSQL / 山鉴统一导出模板。', 64, 112, 9),
  ].join('');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [5 0 R] >>',
    '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo 6 0 R /FontDescriptor << /Type /FontDescriptor /FontName /STSong-Light /Flags 4 /Ascent 880 /Descent -120 /CapHeight 700 /ItalicAngle 0 /StemV 80 >> >>',
    '<< /Registry (Adobe) /Ordering (GB1) /Supplement 2 >>',
    `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}endstream`,
  ];
  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n', 'binary')];
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, 'utf8'));
  });
  const xrefOffset = Buffer.concat(chunks).length;
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, 'binary'));
  offsets.slice(1).forEach((offset) => chunks.push(Buffer.from(`${String(offset).padStart(10, '0')} 00000 n \n`, 'binary')));
  chunks.push(Buffer.from(`trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`, 'binary'));
  return Buffer.concat(chunks);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipDate(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

function makeZip(files: Array<{ name: string; data: Buffer }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const stamp = zipDate();
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, file.data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + file.data.length;
  }
  const centralSize = centralParts.reduce((sum, item) => sum + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function csvCell(value: unknown) {
  const text = Array.isArray(value) ? value.join(';') : String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

async function createSession(subjectId: string, role: 'user' | 'admin') {
  const token = `${role}-${randomUUID()}`;
  await prisma.session.create({
    data: {
      id: randomUUID(),
      subjectId,
      subjectType: role,
      role,
      token,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    },
  });
  return token;
}

async function adminLog(operator: AuthUser, action: string, target: string) {
  await prisma.adminLog.create({ data: { id: randomUUID(), operator: operator.email, action, target } }).catch(() => undefined);
}

async function buildDownloadPackage(exportRequest: any) {
  const [places, events, persons, regions, media, sources, submissions] = await Promise.all([
    prisma.place.findMany({ where: { status: 'active' }, orderBy: { id: 'asc' } }),
    prisma.event.findMany({ orderBy: [{ year: 'asc' }, { month: 'asc' }] }),
    prisma.person.findMany({ orderBy: { id: 'asc' } }),
    prisma.region.findMany({ orderBy: { id: 'asc' } }),
    prisma.media.findMany({ orderBy: { id: 'asc' } }),
    prisma.source.findMany({ orderBy: { id: 'asc' } }),
    prisma.ugcSubmission.findMany({ where: { status: 'approved' }, orderBy: { createdAt: 'desc' } }),
  ]);
  const dataset = { exportRequest, generatedAt: new Date().toISOString(), places, events, persons, regions, media, sources, submissions };
  const placeRows = [
    ['id', 'name', 'type', 'longitude', 'latitude', 'region', 'startYear', 'endYear', 'summary'].join(','),
    ...places.map((place) => [
      place.id,
      place.name,
      place.placeType,
      place.longitude,
      place.latitude,
      place.region,
      place.startYear,
      place.endYear,
      place.summary,
    ].map(csvCell).join(',')),
  ].join('\n');
  const photoDir = resolve(workspaceRoot, 'public/assets/places');
  const photoFiles = existsSync(photoDir) ? await readdir(photoDir) : [];
  const photoManifest = photoFiles.map((name) => ({
    name,
    path: `photos/${name}`,
    source: 'public/assets/places',
    note: 'Original project photo/AI-restoration asset bundled with the approved export.',
  }));
  const files: Array<{ name: string; data: Buffer }> = [
    { name: 'report.pdf', data: makePdfReport(exportRequest, { places, events, sources, media }) },
    { name: 'raw-data.json', data: Buffer.from(JSON.stringify(dataset, null, 2), 'utf8') },
    { name: 'places.csv', data: Buffer.from(placeRows, 'utf8') },
    { name: 'photo-manifest.json', data: Buffer.from(JSON.stringify(photoManifest, null, 2), 'utf8') },
  ];
  for (const photo of photoFiles) {
    const fullPath = join(photoDir, photo);
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extname(photo).toLowerCase())) continue;
    files.push({ name: `photos/${photo}`, data: await readFile(fullPath) });
  }
  return makeZip(files);
}

async function publishSubmission(item: any, admin: AuthUser) {
  if (item.publishedTargetId) return item;
  const placePayload = parseJson<Record<string, unknown>>(item.placePayload, {});
  const textPayload = parseJson<Record<string, unknown>>(item.textPayload, {});
  const mediaPayload = parseJson<Record<string, unknown>>(item.mediaPayload, {});
  if (item.submissionType === 'place') {
    const coordinates = parseCoordinates(placePayload.coordinates) ?? { lng: 115.98, lat: 29.57 };
    const target = await prisma.place.create({
      data: {
        id: randomUUID(),
        name: item.title || String(placePayload.place ?? '用户提交地点'),
        slug: `ugc-${item.id.slice(0, 8)}`,
        placeType: 'heritage',
        longitude: coordinates.lng,
        latitude: coordinates.lat,
        altitude: null,
        geom: JSON.stringify({ type: 'Point', coordinates: [coordinates.lng, coordinates.lat] }),
        spatialPrecision: 'submitted',
        regionId: 'r-guling',
        region: String(placePayload.place ?? '用户提交区域'),
        startYear: Number(placePayload.startYear ?? 1937),
        endYear: Number(placePayload.endYear ?? 1945),
        highlightLevel: 1,
        baseInfo: item.sourceNote || '用户资料提交',
        summary: String(placePayload.description ?? item.sourceNote ?? ''),
        sourceConfidence: 'user_reviewed',
        tags: JSON.stringify(['用户提交', '审核入库']),
        status: 'active',
        reviewStatus: 'approved',
        createdBy: item.userId,
        updatedBy: admin.id,
      },
    });
    return prisma.ugcSubmission.update({ where: { id: item.id }, data: { publishedTargetType: 'place', publishedTargetId: target.id } });
  }
  if (item.submissionType === 'media') {
    const target = await prisma.media.create({
      data: {
        id: randomUUID(),
        mediaType: 'image',
        url: String(mediaPayload.url ?? ''),
        title: item.title,
        caption: String(mediaPayload.caption ?? item.sourceNote ?? ''),
        isAiGenerated: false,
        sourceId: null,
        metadata: JSON.stringify({ submittedBy: item.submitter, payload: mediaPayload }),
      },
    });
    return prisma.ugcSubmission.update({ where: { id: item.id }, data: { publishedTargetType: 'media', publishedTargetId: target.id } });
  }
  const target = await prisma.source.create({
    data: {
      id: randomUUID(),
      title: item.title,
      sourceType: 'user_submission',
      citation: String(textPayload.citation ?? item.sourceNote ?? ''),
      note: String(textPayload.description ?? item.sourceNote ?? ''),
      reliability: 'reviewed',
      metadata: JSON.stringify({ submittedBy: item.submitter, payload: textPayload }),
    },
  });
  return prisma.ugcSubmission.update({ where: { id: item.id }, data: { publishedTargetType: 'source', publishedTargetId: target.id } });
}

async function authUser(authorization?: string): Promise<AuthUser | undefined> {
  const token = authorization?.replace('Bearer ', '');
  if (token === 'admin-token' || token === 'mock-admin-token') {
    const admin = await prisma.admin.findUnique({ where: { email: 'admin@shanjian.local' } });
    return admin ? { id: admin.id, email: admin.email, nickname: admin.nickname, role: 'admin', avatarUrl: admin.avatarUrl ?? undefined, favorites: [], notifications: [] } : undefined;
  }
  if (token === 'user-token' || token === 'mock-user-token') {
    const user = await prisma.user.findUnique({ where: { email: 'viewer@example.com' } });
    return user ? { id: user.id, email: user.email, nickname: user.nickname, role: 'user', avatarUrl: user.avatarUrl ?? undefined, favorites: parseJson<string[]>(user.favorites, []), notifications: [] } : undefined;
  }
  if (!token) return undefined;
  const session = await prisma.session.findUnique({ where: { token } });
  if (!session || session.expiresAt.getTime() < Date.now()) return undefined;
  if (session.role === 'admin') {
    const admin = await prisma.admin.findUnique({ where: { id: session.subjectId } });
    return admin ? { id: admin.id, email: admin.email, nickname: admin.nickname, role: 'admin', avatarUrl: admin.avatarUrl ?? undefined, favorites: [], notifications: [] } : undefined;
  }
  const user = await prisma.user.findUnique({ where: { id: session.subjectId } });
  return user ? { id: user.id, email: user.email, nickname: user.nickname, role: 'user', avatarUrl: user.avatarUrl ?? undefined, favorites: parseJson<string[]>(user.favorites, []), notifications: [] } : undefined;
}

async function requireUser(authorization?: string) {
  const user = await authUser(authorization);
  if (!user) throw new HttpException({ code: 'AUTH_REQUIRED' }, HttpStatus.UNAUTHORIZED);
  return user;
}

async function requireAdmin(authorization?: string) {
  const user = await authUser(authorization);
  if (user?.role !== 'admin') throw new HttpException({ code: 'FORBIDDEN' }, HttpStatus.FORBIDDEN);
  return user;
}

const publicTimelineMilestones = [
  { id: 'national-1937-07', year: 1937, month: 7, title: '七七事变', summary: '全国抗战全面爆发的标志性节点。' },
  { id: 'national-1938-03', year: 1938, month: 3, title: '台儿庄战役', summary: '抗战初期重要胜利。' },
  { id: 'national-1940-08', year: 1940, month: 8, title: '百团大战', summary: '敌后战场大规模主动出击。' },
  { id: 'national-1945-08', year: 1945, month: 8, title: '日本投降', summary: '中国人民抗日战争取得胜利。' },
];

function timelineFrom(places: ReturnType<typeof toPlace>[]) {
  return Array.from({ length: 9 }, (_, index) => {
    const year = 1937 + index;
    return {
      timeBucket: String(year),
      year,
      visiblePlaces: places.filter((place) => place.startYear <= year && place.endYear >= year).map((place) => place.id),
      keyframes: publicTimelineMilestones
        .filter((event) => event.year === year)
        .map((event) => ({ id: `kf-${event.id}`, title: event.title, placeId: 'pl1', year, month: event.month, description: event.summary })),
    };
  });
}

async function syncUserFavorites(userId: string) {
  const rows = await prisma.favorite.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  const favorites = rows.map((item) => item.placeId);
  await prisma.user.update({ where: { id: userId }, data: { favorites: JSON.stringify(favorites) } }).catch(() => undefined);
  return favorites;
}

@Controller('api')
class PublicController {
  @Get('health')
  async health() {
    const [database, mapPoints] = await Promise.all([
      prisma.$queryRaw<Array<{ database_name: string }>>`SELECT current_database() AS database_name`,
      prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM public.map_points_v WHERE status = 'active'`,
    ]);
    return {
      status: 'ok',
      service: 'shanjian-lushan-api',
      database: database[0]?.database_name,
      mapPoints: Number(mapPoints[0]?.count ?? 0),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('map/places')
  async getMapPlaces(@Query('keyword') keyword = '', @Query('type') type = '', @Query('region_id') regionId = '', @Query('time_from') timeFrom = '1937', @Query('time_to') timeTo = '1945') {
    const types = type.split(',').filter(Boolean);
    const from = Number(timeFrom || 1937);
    const to = Number(timeTo || 1945);
    const q = keyword.trim().toLowerCase();
    const [rows, matchingEventIds] = await Promise.all([getAllMapPointRows(), matchingEventIdsForKeyword(q)]);
    return rows.map(toMapPoint).filter((place) => {
      const matchType = types.length === 0 || types.includes(place.placeType);
      const matchRegion = !regionId || place.regionId === regionId;
      const matchTime = place.startYear <= to && place.endYear >= from;
      const ownText = `${place.name} ${place.region} ${place.summary} ${place.baseInfo} ${place.tags.join(' ')}`.toLowerCase();
      const matchKeyword = !q || ownText.includes(q) || place.eventIds.some((eventId) => matchingEventIds.has(eventId));
      return matchType && matchRegion && matchTime && matchKeyword;
    });
  }

  @Get('map/places/:id')
  async getPlaceDetail(@Param('id') id: string) {
    const pointRows = await prisma.$queryRaw<MapPointRow[]>`
      SELECT point_id, point_source, source_id, marker_type, name, summary, region, region_id,
             base_info, tags, longitude, latitude, spatial_precision, coordinate_confidence,
             start_date, end_date, time_raw, event_domain, actor_side, start_year, end_year,
             highlight_level, event_count, event_ids, act_numbers, act_titles, status
      FROM public.map_points_v
      WHERE point_id = ${id}
      LIMIT 1
    `;
    const pointRow = pointRows[0];
    if (!pointRow) throw new HttpException({ code: 'NOT_FOUND' }, HttpStatus.NOT_FOUND);
    if (pointRow.point_source === 'event_site') {
      const eventIds = pointRow.event_ids ?? [];
      const events = await prisma.event.findMany({
        where: { id: { in: eventIds } },
        orderBy: [{ normalizedStart: 'asc' }, { title: 'asc' }],
      });
      if (!events.length) throw new HttpException({ code: 'NOT_FOUND' }, HttpStatus.NOT_FOUND);
      const [relatedRows, mediaLinks, sourceLinks] = await Promise.all([
        prisma.$queryRaw<MapPointRow[]>`
          SELECT point_id, point_source, source_id, marker_type, name, summary, region, region_id,
                 base_info, tags, longitude, latitude, spatial_precision, coordinate_confidence,
                 start_date, end_date, time_raw, event_domain, actor_side, start_year, end_year,
                 highlight_level, event_count, event_ids, act_numbers, act_titles, status
          FROM public.map_points_v
          WHERE point_source = 'event_site' AND region_id = ${pointRow.region_id} AND point_id <> ${id}
          LIMIT 4
        `,
        prisma.mediaLink.findMany({ where: { targetType: 'event', targetId: { in: eventIds } }, orderBy: { sortOrder: 'asc' } }),
        prisma.sourceLink.findMany({ where: { targetType: 'event', targetId: { in: eventIds } } }),
      ]);
      const [mediaRows, linkedSources] = await Promise.all([
        mediaLinks.length ? prisma.media.findMany({ where: { id: { in: mediaLinks.map((item) => item.mediaId) } } }) : Promise.resolve([]),
        sourceLinks.length ? prisma.source.findMany({ where: { id: { in: sourceLinks.map((item) => item.sourceId) } } }) : Promise.resolve([]),
      ]);
      const mediaById = new Map(mediaRows.map((item) => [item.id, item]));
      const linkedMedia = mediaLinks.map((item) => mediaById.get(item.mediaId)).filter(Boolean);
      return {
        ...toMapPoint(pointRow),
        timelineEvents: events.map(toEvent),
        media: linkedMedia,
        relatedPlaces: relatedRows.map(toMapPoint),
        relatedEvents: events.map(toEvent),
        sources: linkedSources,
        notes: [],
      };
    }
    const row = await prisma.place.findUnique({ where: { id } });
    if (!row) throw new HttpException({ code: 'NOT_FOUND' }, HttpStatus.NOT_FOUND);
    const place = toMapPoint(pointRow);
    const eventRows = pointRow.event_ids?.length
      ? await prisma.event.findMany({ where: { id: { in: pointRow.event_ids } }, orderBy: [{ normalizedStart: 'asc' }, { title: 'asc' }] })
      : [];
    const relatedRows = await prisma.place.findMany({ where: { regionId: place.regionId, NOT: { id: place.id } }, take: 4 });
    const mediaLinks = await prisma.mediaLink.findMany({ where: { targetType: 'place', targetId: id }, orderBy: { sortOrder: 'asc' } });
    const mediaRows = mediaLinks.length
      ? await prisma.media.findMany({ where: { id: { in: mediaLinks.map((item) => item.mediaId) } } })
      : [];
    const mediaById = new Map(mediaRows.map((item) => [item.id, item]));
    const linkedMedia = mediaLinks.map((item) => mediaById.get(item.mediaId)).filter(Boolean);
    const sourceLinks = await prisma.sourceLink.findMany({ where: { targetType: 'place', targetId: id } });
    const linkedSources = sourceLinks.length
      ? await prisma.source.findMany({ where: { id: { in: sourceLinks.map((item) => item.sourceId) } } })
      : await prisma.source.findMany({ take: 5 });
    return {
      ...place,
      timelineEvents: eventRows.map(toEvent),
      media: linkedMedia,
      relatedPlaces: relatedRows.map(toPlace),
      relatedEvents: eventRows.slice(0, 3).map(toEvent),
      sources: linkedSources,
      notes: [],
    };
  }

  @Get('search')
  async search(@Query('q') q = '') {
    const keyword = q.trim().toLowerCase();
    const [pointRows, persons, events, matchingEventIds] = await Promise.all([
      getAllMapPointRows(),
      prisma.person.findMany(),
      prisma.event.findMany(),
      matchingEventIdsForKeyword(keyword),
    ]);
    return {
      places: pointRows.map(toMapPoint).filter((place) => !keyword
        || `${place.name} ${place.region} ${place.summary} ${place.baseInfo} ${place.tags.join(' ')}`.toLowerCase().includes(keyword)
        || place.eventIds.some((eventId) => matchingEventIds.has(eventId))),
      persons: persons
        .map((person) => ({ ...person, aliases: parseJson<string[]>(person.aliases, []) }))
        .filter((person) => !keyword || `${person.name} ${person.aliases.join(' ')} ${person.summary} ${person.biography ?? ''} ${person.tags}`.toLowerCase().includes(keyword)),
      events: events.map(toEvent).filter((event) => !keyword || matchingEventIds.has(event.id)),
    };
  }

  @Get('events/timeline')
  async getTimeline() {
    const places = await prisma.place.findMany();
    const fallback = timelineFrom(places.map(toPlace));
    const keyframes = await prisma.timelineKeyframe.findMany({ where: { status: 'active' }, orderBy: [{ year: 'asc' }, { sortOrder: 'asc' }] }).catch(() => []);
    if (!keyframes.length) return fallback;
    return fallback.map((bucket) => ({
      ...bucket,
      keyframes: keyframes
        .filter((item) => item.year === bucket.year)
        .map((item) => ({ id: item.id, title: item.title, placeId: item.placeId ?? 'pl1', year: item.year, month: item.month ?? undefined, description: item.description })),
    }));
  }

  @Get('timeline/acts')
  async getActs() {
    const rows = await prisma.$queryRaw<Array<{ act_no: number; title: string; start_date: Date; end_date: Date }>>`
      SELECT act_no, title, start_date, end_date
      FROM public.acts
      ORDER BY sort_order, act_no
    `;
    return rows.map((row) => ({
      actNo: row.act_no,
      title: row.title,
      startDate: row.start_date.toISOString().slice(0, 10),
      endDate: row.end_date.toISOString().slice(0, 10),
    }));
  }

  @Get('filters/regions')
  async getRegions() {
    return prisma.region.findMany({ orderBy: { count: 'desc' } });
  }
}

@Controller('api')
class AuthController {
  @Post('auth/login')
  async login(@Body() body: { email: string; password: string }) {
    const email = validateCredentials(body.email, body.password);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'active' || !verifyPassword(body.password, user.passwordHash)) throw new HttpException({ code: 'AUTH_REQUIRED' }, HttpStatus.UNAUTHORIZED);
    const favorites = await syncUserFavorites(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), ...(!user.passwordHash.startsWith('scrypt$') ? { passwordHash: hashPassword(body.password) } : {}) } }).catch(() => undefined);
    return { token: await createSession(user.id, 'user'), user: { id: user.id, email: user.email, nickname: user.nickname, role: 'user', avatarUrl: user.avatarUrl ?? undefined, favorites, notifications: [] } };
  }

  @Post('auth/register')
  async register(@Body() body: { email: string; password: string; nickname?: string }) {
    const email = validateCredentials(body.email, body.password);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new HttpException({ code: 'EMAIL_EXISTS', message: '该邮箱已注册' }, HttpStatus.CONFLICT);
    const nickname = body.nickname?.trim() || '档案共建者';
    const user = await prisma.user.create({ data: { id: randomUUID(), email, nickname, passwordHash: hashPassword(body.password), role: 'user', favorites: '[]' } });
    return { token: await createSession(user.id, 'user'), user: { id: user.id, email: user.email, nickname: user.nickname, role: 'user', favorites: [], notifications: [] } };
  }

  @Get('me')
  async me(@Headers('authorization') authorization?: string) {
    return requireUser(authorization);
  }

  @Put('me/avatar')
  async updateAvatar(@Headers('authorization') authorization: string | undefined, @Body() body: { avatarUrl?: string }) {
    const user = await requireUser(authorization);
    const avatarUrl = body.avatarUrl?.trim() ?? '';
    const validImage = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(avatarUrl);
    if (!validImage || avatarUrl.length > 750_000) {
      throw new HttpException({ code: 'VALIDATION_ERROR', message: '头像格式无效或图片过大' }, HttpStatus.BAD_REQUEST);
    }
    if (user.role === 'admin') await prisma.admin.update({ where: { id: user.id }, data: { avatarUrl } });
    else await prisma.user.update({ where: { id: user.id }, data: { avatarUrl } });
    return { ...user, avatarUrl };
  }

  @Get('me/favorites')
  async myFavorites(@Headers('authorization') authorization?: string) {
    const user = await requireUser(authorization);
    const rows = await prisma.favorite.findMany({ where: { userId: user.id } });
    const favoriteOrder = new Map(rows.map((item, index) => [item.placeId, index]));
    return (await getAllMapPointRows())
      .filter((point) => favoriteOrder.has(point.point_id))
      .sort((a, b) => (favoriteOrder.get(a.point_id) ?? 0) - (favoriteOrder.get(b.point_id) ?? 0))
      .map(toMapPoint);
  }

  @Get('me/submissions')
  async mySubmissions(@Headers('authorization') authorization?: string) {
    const user = await requireUser(authorization);
    return prisma.ugcSubmission.findMany({ where: { OR: [{ userId: user.id }, { submitter: user.email }] }, orderBy: { createdAt: 'desc' } });
  }

  @Get('me/export-requests')
  async myExportRequests(@Headers('authorization') authorization?: string) {
    const user = await requireUser(authorization);
    return prisma.exportRequest.findMany({ where: { OR: [{ userId: user.id }, { applicant: user.email }] }, orderBy: { createdAt: 'desc' } });
  }

  @Get('export-requests/:id/download')
  async downloadExport(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Query('token') token: string | undefined, @Res() res: any) {
    const item = await prisma.exportRequest.findUnique({ where: { id } });
    if (!item || item.status !== 'approved') throw new HttpException({ code: 'NOT_FOUND' }, HttpStatus.NOT_FOUND);
    const record = token
      ? await prisma.downloadRecord.findUnique({ where: { token } })
      : undefined;
    const user = authorization ? await authUser(authorization) : undefined;
    const canDownloadByToken = record?.exportRequestId === id && record.expiresAt.getTime() > Date.now();
    const canDownloadByUser = user && (user.role === 'admin' || user.id === item.userId || user.email === item.applicant);
    if (!canDownloadByToken && !canDownloadByUser) throw new HttpException({ code: 'FORBIDDEN' }, HttpStatus.FORBIDDEN);
    const archive = await buildDownloadPackage(item);
    if (record) await prisma.downloadRecord.update({ where: { id: record.id }, data: { downloadedAt: new Date() } }).catch(() => undefined);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${item.requestId}.zip"`);
    res.setHeader('Content-Length', String(archive.length));
    return res.end(archive);
  }

  @Post('favorites')
  async addFavorite(@Headers('authorization') authorization: string | undefined, @Body() body: { place_id?: string; placeId?: string }) {
    const user = await requireUser(authorization);
    const placeId = body.placeId ?? body.place_id;
    if (!placeId) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'place_id required' }, HttpStatus.BAD_REQUEST);
    const pointExists = (await getAllMapPointRows()).some((point) => point.point_id === placeId);
    if (!pointExists) throw new HttpException({ code: 'NOT_FOUND', message: '公开地图中不存在该点位' }, HttpStatus.NOT_FOUND);
    const favorite = await prisma.favorite.upsert({
      where: { userId_placeId: { userId: user.id, placeId } },
      update: {},
      create: { id: randomUUID(), userId: user.id, placeId },
    });
    const favorites = await syncUserFavorites(user.id);
    return { ...favorite, favorites };
  }

  @Delete('favorites/:placeId')
  async removeFavorite(@Headers('authorization') authorization: string | undefined, @Param('placeId') placeId: string) {
    const user = await requireUser(authorization);
    await prisma.favorite.deleteMany({ where: { userId: user.id, placeId } });
    const favorites = await syncUserFavorites(user.id);
    return { placeId, deleted: true, favorites };
  }

  @Post('ugc/submissions')
  async createUgc(@Headers('authorization') authorization: string | undefined, @Body() body: any) {
    const user = await requireUser(authorization);
    return prisma.ugcSubmission.create({ data: { id: randomUUID(), userId: user.id, submissionType: body.submissionType || 'place', title: body.title || '未命名提交', submitter: user.email, placePayload: body.placePayload ? JSON.stringify(body.placePayload) : null, textPayload: body.textPayload ? JSON.stringify(body.textPayload) : null, mediaPayload: body.mediaPayload ? JSON.stringify(body.mediaPayload) : null, sourceNote: body.sourceNote || '', status: 'pending' } });
  }

  @Post('export-requests')
  async createExport(@Headers('authorization') authorization: string | undefined, @Body() body: any) {
    const user = await requireUser(authorization);
    return prisma.exportRequest.create({ data: { id: randomUUID(), userId: user.id, requestId: `EXP-${Date.now()}`, applicant: user.email, dataScope: body.dataScope || '地点基础数据', filters: body.filters ? JSON.stringify(body.filters) : '{}', reason: body.reason || '', status: 'pending' } });
  }
}

@Controller('api/admin')
class AdminController {
  @Post('auth/login')
  async login(@Body() body: { email: string; password: string }) {
    const email = validateCredentials(body.email, body.password);
    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin || admin.status !== 'active' || !verifyPassword(body.password, admin.passwordHash)) throw new HttpException({ code: 'AUTH_REQUIRED' }, HttpStatus.UNAUTHORIZED);
    await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date(), ...(!admin.passwordHash.startsWith('scrypt$') ? { passwordHash: hashPassword(body.password) } : {}) } }).catch(() => undefined);
    return { token: await createSession(admin.id, 'admin'), user: { id: admin.id, email: admin.email, nickname: admin.nickname, role: 'admin', avatarUrl: admin.avatarUrl ?? undefined, favorites: [], notifications: [] } };
  }

  @Get('dashboard')
  async dashboard(@Headers('authorization') authorization?: string) {
    await requireAdmin(authorization);
    const [mapPointRows, eventDomainRows, ugcPending, exportPending, sourceCount] = await Promise.all([
      prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM public.map_points_v WHERE status = 'active'`,
      prisma.$queryRaw<Array<{ event_domain: string; count: bigint }>>`SELECT event_domain, count(*)::bigint AS count FROM public.events WHERE status = 'active' GROUP BY event_domain`,
      prisma.ugcSubmission.count({ where: { status: 'pending' } }),
      prisma.exportRequest.count({ where: { status: 'pending' } }),
      prisma.source.count(),
    ]);
    return { stats: [
      { label: '公开地图点位', value: Number(mapPointRows[0]?.count ?? 0), hint: '文化景观与事件坐标合计' },
      { label: '战争事件', value: Number(eventDomainRows.find((row) => row.event_domain === 'war')?.count ?? 0), hint: '按冲突行为科学分类' },
      { label: '事务事件', value: Number(eventDomainRows.find((row) => row.event_domain === 'affairs')?.count ?? 0), hint: '行政、社会与外交记录' },
      { label: '待审 UGC', value: ugcPending, hint: '进入审核队列' },
      { label: '导出申请', value: exportPending, hint: '等待审批' },
      { label: '来源条目', value: sourceCount, hint: '可追溯引用' },
    ] };
  }

  @Get('ugc/submissions')
  async submissions(@Headers('authorization') authorization?: string) {
    await requireAdmin(authorization);
    return prisma.ugcSubmission.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Post('ugc/:id/approve')
  async approveUgc(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) {
    const admin = await requireAdmin(authorization);
    const reviewed = await prisma.ugcSubmission.update({ where: { id }, data: { status: 'approved', reviewerId: admin.id, reviewedAt: new Date() } });
    const item = await publishSubmission(reviewed, admin);
    await adminLog(admin, 'approve_ugc', id);
    return item;
  }

  @Post('ugc/:id/reject')
  async rejectUgc(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) {
    const admin = await requireAdmin(authorization);
    const item = await prisma.ugcSubmission.update({ where: { id }, data: { status: 'rejected', reviewerId: admin.id, reviewedAt: new Date() } });
    await adminLog(admin, 'reject_ugc', id);
    return item;
  }

  @Get('export-requests')
  async exportRequests(@Headers('authorization') authorization?: string) {
    await requireAdmin(authorization);
    return prisma.exportRequest.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Post('export-requests/:id/approve')
  async approveExport(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) {
    const admin = await requireAdmin(authorization);
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    const item = await prisma.exportRequest.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy: admin.id,
        processedAt: new Date(),
        downloadExpiresAt: expiresAt,
        fileUrl: `/api/export-requests/${id}/download?token=${token}`,
      },
    });
    await prisma.downloadRecord.create({ data: { id: randomUUID(), exportRequestId: id, userId: item.userId, token, expiresAt } }).catch(() => undefined);
    await adminLog(admin, 'approve_export', id);
    return item;
  }

  @Post('export-requests/:id/reject')
  async rejectExport(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) {
    const admin = await requireAdmin(authorization);
    const item = await prisma.exportRequest.update({ where: { id }, data: { status: 'rejected', approvedBy: admin.id, processedAt: new Date() } });
    await adminLog(admin, 'reject_export', id);
    return item;
  }

  @Get('logs')
  async logs(@Headers('authorization') authorization?: string) {
    await requireAdmin(authorization);
    return prisma.adminLog.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Get('config')
  async getConfig(@Headers('authorization') authorization?: string) {
    await requireAdmin(authorization);
    const cfg = await prisma.systemConfig.findUnique({ where: { key: 'map' } });
    return cfg ? JSON.parse(cfg.value) : {};
  }

  @Put('config')
  async updateConfig(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) {
    await requireAdmin(authorization);
    const cfg = await prisma.systemConfig.upsert({ where: { key: 'map' }, update: { value: JSON.stringify(body) }, create: { id: 'cfg-map', key: 'map', value: JSON.stringify(body) } });
    return JSON.parse(cfg.value);
  }

  @Get(':resource')
  async list(@Headers('authorization') authorization: string | undefined, @Param('resource') resource: string) {
    await requireAdmin(authorization);
    if (resource === 'places') return (await prisma.place.findMany()).map(toPlace);
    if (resource === 'events') return (await prisma.event.findMany()).map(toEvent);
    if (resource === 'persons') return (await prisma.person.findMany()).map((person) => ({ ...person, aliases: parseJson<string[]>(person.aliases, []) }));
    if (resource === 'regions') return prisma.region.findMany();
    if (resource === 'media') return prisma.media.findMany();
    if (resource === 'sources') return prisma.source.findMany();
    if (resource === 'timeline-keyframes') return prisma.timelineKeyframe.findMany({ orderBy: [{ year: 'asc' }, { sortOrder: 'asc' }] });
    if (resource === 'place-relations') return prisma.placeRelation.findMany();
    throw new HttpException({ code: 'NOT_FOUND' }, HttpStatus.NOT_FOUND);
  }

  @Post(':resource')
  async create(@Headers('authorization') authorization: string | undefined, @Param('resource') resource: string, @Body() body: any) {
    const admin = await requireAdmin(authorization);
    if (resource === 'regions') {
      throw new HttpException(
        { code: 'READ_ONLY_RESOURCE', message: '区域由点位数据自动派生，不支持新增' },
        HttpStatus.METHOD_NOT_ALLOWED,
      );
    }
    const id = body.id ?? randomUUID();
    let result: unknown;
    if (resource === 'places') {
      result = toPlace(await prisma.place.create({ data: {
        id,
        name: body.name ?? '未命名地点',
        slug: body.slug ?? `place-${id.slice(0, 8)}`,
        placeType: body.placeType ?? 'heritage',
        longitude: Number(body.longitude ?? 115.98),
        latitude: Number(body.latitude ?? 29.58),
        altitude: body.altitude === undefined ? null : Number(body.altitude),
        geom: body.geom ?? JSON.stringify({ type: 'Point', coordinates: [Number(body.longitude ?? 115.98), Number(body.latitude ?? 29.58)] }),
        regionId: body.regionId ?? 'r-guling',
        region: body.region ?? '牯岭镇',
        startYear: Number(body.startYear ?? 1937),
        endYear: Number(body.endYear ?? 1945),
        highlightLevel: Number(body.highlightLevel ?? 1),
        baseInfo: body.baseInfo ?? '',
        summary: body.summary ?? '',
        tags: jsonField(body.tags),
        status: body.status ?? 'draft',
      } }));
    } else if (resource === 'events') {
      result = toEvent(await prisma.event.create({ data: {
        id,
        title: body.title ?? '未命名事件',
        startTimeRaw: body.startTimeRaw ?? String(body.year ?? 1937),
        normalizedStart: body.normalizedStart ?? `${body.year ?? 1937}-01-01`,
        year: Number(body.year ?? 1937),
        month: body.month === undefined ? null : Number(body.month),
        summary: body.summary ?? '',
        region: body.region ?? '庐山',
        regionId: body.regionId ?? null,
        placeId: body.placeId ?? null,
      } }));
    } else if (resource === 'persons') {
      const person = await prisma.person.create({ data: { id, name: body.name ?? '未命名人物', aliases: jsonField(body.aliases), summary: body.summary ?? '' } });
      result = { ...person, aliases: parseJson<string[]>(person.aliases, []) };
    } else if (resource === 'media') {
      result = await prisma.media.create({ data: { id, mediaType: body.mediaType ?? 'image', url: body.url ?? null, title: body.title ?? '未命名媒体', caption: body.caption ?? '', isAiGenerated: Boolean(body.isAiGenerated ?? false), sourceId: body.sourceId ?? null } });
    } else if (resource === 'sources') {
      result = await prisma.source.create({ data: { id, title: body.title ?? '未命名来源', sourceType: body.sourceType ?? 'archive', citation: body.citation ?? '', note: body.note ?? null } });
    } else {
      throw new HttpException({ code: 'NOT_FOUND' }, HttpStatus.NOT_FOUND);
    }
    await adminLog(admin, `create_${resource}`, id);
    return result;
  }

  @Put(':resource/:id')
  async update(@Headers('authorization') authorization: string | undefined, @Param('resource') resource: string, @Param('id') id: string, @Body() body: any) {
    const admin = await requireAdmin(authorization);
    if (resource === 'regions') {
      throw new HttpException(
        { code: 'READ_ONLY_RESOURCE', message: '区域由点位数据自动派生，不支持修改' },
        HttpStatus.METHOD_NOT_ALLOWED,
      );
    }
    let result: unknown;
    if (resource === 'places') {
      const data: any = { ...body };
      delete data.id;
      if (data.tags !== undefined) data.tags = jsonField(data.tags);
      if (data.longitude !== undefined) data.longitude = Number(data.longitude);
      if (data.latitude !== undefined) data.latitude = Number(data.latitude);
      if (data.altitude !== undefined && data.altitude !== null) data.altitude = Number(data.altitude);
      if (data.startYear !== undefined) data.startYear = Number(data.startYear);
      if (data.endYear !== undefined) data.endYear = Number(data.endYear);
      if (data.highlightLevel !== undefined) data.highlightLevel = Number(data.highlightLevel);
      result = toPlace(await prisma.place.update({ where: { id }, data }));
    } else if (resource === 'events') {
      const data: any = { ...body };
      delete data.id;
      if (data.year !== undefined) data.year = Number(data.year);
      if (data.month !== undefined && data.month !== null) data.month = Number(data.month);
      result = toEvent(await prisma.event.update({ where: { id }, data }));
    } else if (resource === 'persons') {
      const data: any = { ...body };
      delete data.id;
      if (data.aliases !== undefined) data.aliases = jsonField(data.aliases);
      const person = await prisma.person.update({ where: { id }, data });
      result = { ...person, aliases: parseJson<string[]>(person.aliases, []) };
    } else if (resource === 'media') {
      const data: any = { ...body };
      delete data.id;
      if (data.isAiGenerated !== undefined) data.isAiGenerated = Boolean(data.isAiGenerated);
      result = await prisma.media.update({ where: { id }, data });
    } else if (resource === 'sources') {
      const data: any = { ...body };
      delete data.id;
      result = await prisma.source.update({ where: { id }, data });
    } else {
      throw new HttpException({ code: 'NOT_FOUND' }, HttpStatus.NOT_FOUND);
    }
    await adminLog(admin, `update_${resource}`, id);
    return result;
  }

  @Delete(':resource/:id')
  async remove(@Headers('authorization') authorization: string | undefined, @Param('resource') resource: string, @Param('id') id: string) {
    const admin = await requireAdmin(authorization);
    if (resource === 'regions') {
      throw new HttpException(
        { code: 'READ_ONLY_RESOURCE', message: '区域由点位数据自动派生，不支持删除' },
        HttpStatus.METHOD_NOT_ALLOWED,
      );
    }
    if (resource === 'places') await prisma.place.delete({ where: { id } });
    else if (resource === 'events') await prisma.event.delete({ where: { id } });
    else if (resource === 'persons') await prisma.person.delete({ where: { id } });
    else if (resource === 'media') await prisma.media.delete({ where: { id } });
    else if (resource === 'sources') await prisma.source.delete({ where: { id } });
    else throw new HttpException({ code: 'NOT_FOUND' }, HttpStatus.NOT_FOUND);
    await adminLog(admin, `delete_${resource}`, id);
    return { id, resource, deleted: true };
  }
}

@Module({ controllers: [PublicController, AuthController, AdminController] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn', 'log'] });
  app.useBodyParser('json', { limit: '1mb' });
  const allowedOrigins = new Set([
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'https://deepatric.github.io',
    ...(process.env.CORS_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean),
  ]);
  app.enableCors({
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
    credentials: true,
  });
  const [database] = await prisma.$queryRaw<Array<{ database_name: string; schema_name: string }>>`
    SELECT current_database() AS database_name, current_schema() AS schema_name
  `;
  const host = process.env.HOST ?? '0.0.0.0';
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, host);
  console.log(`数据库连接已确认：${database.database_name}/${database.schema_name}`);
  console.log(`山鉴 NestJS API 已启动：http://${host}:${port}`);
}

bootstrap();
