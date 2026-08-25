import http from 'node:http';
import './seed.mjs';
import { all, get, parseJson, rowToEvent, rowToPlace, run } from './db.mjs';

const PORT = Number(process.env.PORT || 4000);

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' });
  res.end(JSON.stringify(data));
}

function body(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
  });
}

function tokenUser(req) {
  const raw = req.headers.authorization?.replace('Bearer ', '');
  if (raw === 'mock-admin-token' || raw === 'admin-token') return { id: 'admin-seed', email: 'admin@shanjian.local', nickname: '系统管理员', role: 'admin', favorites: [], notifications: [] };
  if (raw === 'mock-user-token' || raw === 'user-token') {
    const row = get('SELECT * FROM users WHERE email=$email', { email: 'viewer@example.com' });
    return row ? { id: row.id, email: row.email, nickname: row.nickname, role: 'user', favorites: parseJson(row.favorites, []), notifications: [] } : undefined;
  }
  return undefined;
}

function requireAdmin(req, res) {
  const user = tokenUser(req);
  if (user?.role !== 'admin') { json(res, 403, { code: 'FORBIDDEN' }); return null; }
  return user;
}

function placesQuery(url) {
  const keyword = (url.searchParams.get('keyword') || '').toLowerCase();
  const types = (url.searchParams.get('type') || '').split(',').filter(Boolean);
  const regionId = url.searchParams.get('region_id') || '';
  const from = Number(url.searchParams.get('time_from') || 1937);
  const to = Number(url.searchParams.get('time_to') || 1945);
  return all('SELECT * FROM places WHERE status="active"').map(rowToPlace).filter((place) => {
    const matchType = types.length === 0 || types.includes(place.placeType);
    const matchRegion = !regionId || place.regionId === regionId;
    const matchTime = place.startYear <= to && place.endYear >= from;
    const matchKeyword = !keyword || `${place.name}${place.region}${place.summary}${place.tags.join('')}`.toLowerCase().includes(keyword);
    return matchType && matchRegion && matchTime && matchKeyword;
  });
}

function tableRows(table) {
  const rows = all(`SELECT * FROM ${table}`);
  if (table === 'places') return rows.map(rowToPlace);
  if (table === 'events') return rows.map(rowToEvent);
  if (table === 'persons') return rows.map((r) => ({ id: r.id, name: r.name, aliases: parseJson(r.aliases, []), summary: r.summary }));
  if (table === 'regions') return rows.map((r) => ({ id: r.id, name: r.name, count: r.count, parentId: r.parent_id ?? undefined }));
  if (table === 'media') return rows.map((r) => ({ id: r.id, mediaType: r.media_type, url: r.url ?? undefined, title: r.title, caption: r.caption, isAiGenerated: !!r.is_ai_generated, sourceId: r.source_id ?? undefined }));
  if (table === 'sources') return rows.map((r) => ({ id: r.id, title: r.title, sourceType: r.source_type, citation: r.citation, note: r.note }));
  return rows;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 200, {});
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    if (req.method === 'GET' && path === '/api/map/places') return json(res, 200, placesQuery(url));
    if (req.method === 'GET' && path.startsWith('/api/map/places/')) {
      const id = decodeURIComponent(path.split('/').pop());
      const place = rowToPlace(get('SELECT * FROM places WHERE id=$id', { id }));
      const placeEvents = all('SELECT * FROM events WHERE place_id=$id OR year BETWEEN $from AND $to ORDER BY year LIMIT 5', { id, from: place.startYear, to: place.endYear }).map(rowToEvent);
      return json(res, 200, {
        ...place,
        timelineEvents: placeEvents,
        media: tableRows('media'),
        relatedPlaces: tableRows('places').filter((item) => item.id !== place.id && item.regionId === place.regionId).slice(0, 4),
        relatedEvents: placeEvents.slice(0, 3),
        sources: tableRows('sources'),
        notes: ['当前为演示数据，正式史料需进入来源核验流程。', 'UGC 内容必须审核后发布。'],
      });
    }
    if (req.method === 'GET' && path === '/api/search') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      return json(res, 200, {
        places: tableRows('places').filter((p) => !q || `${p.name}${p.summary}`.toLowerCase().includes(q)),
        persons: tableRows('persons').filter((p) => !q || `${p.name}${p.summary}`.toLowerCase().includes(q)),
        events: tableRows('events').filter((e) => !q || `${e.title}${e.summary}`.toLowerCase().includes(q)),
      });
    }
    if (req.method === 'GET' && path === '/api/events/timeline') {
      const places = tableRows('places');
      const events = tableRows('events');
      const timeline = Array.from({ length: 9 }, (_, i) => {
        const year = 1937 + i;
        return { timeBucket: String(year), year, visiblePlaces: places.filter((p) => p.startYear <= year && p.endYear >= year).map((p) => p.id), keyframes: events.filter((e) => e.year === year).map((e) => ({ id: `kf-${e.id}`, title: e.title, placeId: all('SELECT place_id FROM events WHERE id=$id', { id: e.id })[0]?.place_id || 'pl1', year, month: e.month, description: e.summary })) };
      });
      return json(res, 200, timeline);
    }
    if (req.method === 'GET' && path === '/api/filters/regions') return json(res, 200, tableRows('regions'));

    if (req.method === 'POST' && path === '/api/auth/login') {
      const data = await body(req);
      const row = get('SELECT * FROM users WHERE email=$email', { email: data.email });
      if (!row) return json(res, 401, { code: 'AUTH_REQUIRED' });
      return json(res, 200, { token: 'user-token', user: { id: row.id, email: row.email, nickname: row.nickname, role: 'user', favorites: parseJson(row.favorites, []), notifications: [] } });
    }
    if (req.method === 'POST' && path === '/api/auth/register') {
      const data = await body(req);
      const id = `user-${Date.now()}`;
      run('INSERT OR REPLACE INTO users (id,email,nickname,password_hash,role,favorites) VALUES ($id,$email,$nickname,$password,$role,$favorites)', { id, email: data.email, nickname: data.nickname || '档案共建者', password: data.password || 'shanjian123', role: 'user', favorites: '[]' });
      return json(res, 200, { token: 'user-token', user: { id, email: data.email, nickname: data.nickname || '档案共建者', role: 'user', favorites: [], notifications: [] } });
    }
    if (req.method === 'POST' && path === '/api/admin/auth/login') {
      const data = await body(req);
      const row = get('SELECT * FROM admins WHERE email=$email', { email: data.email });
      if (!row) return json(res, 401, { code: 'AUTH_REQUIRED' });
      return json(res, 200, { token: 'admin-token', user: { id: row.id, email: row.email, nickname: row.nickname, role: 'admin', favorites: [], notifications: [] } });
    }
    if (req.method === 'GET' && path === '/api/me') {
      const user = tokenUser(req);
      return user ? json(res, 200, user) : json(res, 401, { code: 'AUTH_REQUIRED' });
    }
    if (req.method === 'POST' && path === '/api/ugc/submissions') {
      const user = tokenUser(req);
      if (!user) return json(res, 401, { code: 'AUTH_REQUIRED' });
      const data = await body(req);
      const item = { id: `u-${Date.now()}`, submissionType: data.submissionType || 'place', title: data.title || '新资料提交', submitter: user.email, sourceNote: data.sourceNote || '', status: 'pending', createdAt: new Date().toISOString().slice(0, 10) };
      run('INSERT INTO ugc_submissions (id,submission_type,title,submitter,source_note,status,created_at) VALUES ($id,$submissionType,$title,$submitter,$sourceNote,$status,$createdAt)', item);
      return json(res, 200, item);
    }
    if (req.method === 'POST' && path === '/api/export-requests') {
      const user = tokenUser(req);
      if (!user) return json(res, 401, { code: 'AUTH_REQUIRED' });
      const data = await body(req);
      const item = { id: `x-${Date.now()}`, requestId: `EXP-${Date.now()}`, applicant: user.email, dataScope: data.dataScope || '当前筛选', reason: data.reason || '', status: 'pending', createdAt: new Date().toISOString().slice(0, 10) };
      run('INSERT INTO export_requests (id,request_id,applicant,data_scope,reason,status,created_at) VALUES ($id,$requestId,$applicant,$dataScope,$reason,$status,$createdAt)', item);
      return json(res, 200, item);
    }

    if (path.startsWith('/api/admin/')) {
      const admin = requireAdmin(req, res);
      if (!admin) return;
      if (req.method === 'GET' && path === '/api/admin/dashboard') return json(res, 200, { stats: [
        { label: '公开点位', value: all('SELECT id FROM places').length, hint: '三类点位已入库' },
        { label: '待审 UGC', value: all('SELECT id FROM ugc_submissions WHERE status="pending"').length, hint: '进入审核队列' },
        { label: '导出申请', value: all('SELECT id FROM export_requests WHERE status="pending"').length, hint: '等待审批' },
        { label: '来源条目', value: all('SELECT id FROM sources').length, hint: '可追溯引用' },
      ] });
      const map = { '/api/admin/places': 'places', '/api/admin/events': 'events', '/api/admin/persons': 'persons', '/api/admin/regions': 'regions', '/api/admin/media': 'media', '/api/admin/sources': 'sources' };
      if (req.method === 'GET' && map[path]) return json(res, 200, tableRows(map[path]));
      if (req.method === 'GET' && path === '/api/admin/ugc/submissions') return json(res, 200, all('SELECT id,submission_type as submissionType,title,submitter,source_note as sourceNote,status,created_at as createdAt FROM ugc_submissions'));
      if (req.method === 'POST' && path.includes('/api/admin/ugc/') && path.endsWith('/approve')) { const id = path.split('/')[4]; run('UPDATE ugc_submissions SET status="approved" WHERE id=$id', { id }); return json(res, 200, { id, status: 'approved' }); }
      if (req.method === 'POST' && path.includes('/api/admin/ugc/') && path.endsWith('/reject')) { const id = path.split('/')[4]; run('UPDATE ugc_submissions SET status="rejected" WHERE id=$id', { id }); return json(res, 200, { id, status: 'rejected' }); }
      if (req.method === 'GET' && path === '/api/admin/export-requests') return json(res, 200, all('SELECT id,request_id as requestId,applicant,data_scope as dataScope,reason,status,created_at as createdAt FROM export_requests'));
      if (req.method === 'POST' && path.includes('/api/admin/export-requests/') && path.endsWith('/approve')) { const id = path.split('/')[4]; run('UPDATE export_requests SET status="approved" WHERE id=$id', { id }); return json(res, 200, { id, status: 'approved' }); }
      if (req.method === 'POST' && path.includes('/api/admin/export-requests/') && path.endsWith('/reject')) { const id = path.split('/')[4]; run('UPDATE export_requests SET status="rejected" WHERE id=$id', { id }); return json(res, 200, { id, status: 'rejected' }); }
      if (req.method === 'GET' && path === '/api/admin/logs') return json(res, 200, all('SELECT id,operator,action,target,created_at as createdAt FROM admin_logs'));
      if (req.method === 'GET' && path === '/api/admin/config') { const cfg = get('SELECT value FROM system_configs WHERE key="map"'); return json(res, 200, cfg ? JSON.parse(cfg.value) : {}); }
      if (req.method === 'PUT' && path === '/api/admin/config') { const data = await body(req); run('INSERT OR REPLACE INTO system_configs (id,key,value) VALUES ($id,$key,$value)', { id: 'cfg-map', key: 'map', value: JSON.stringify(data) }); return json(res, 200, data); }
    }

    return json(res, 404, { code: 'NOT_FOUND' });
  } catch (error) {
    return json(res, 500, { code: 'SERVER_ERROR', message: String(error?.message || error) });
  }
});

server.listen(PORT, () => console.log(`山鉴本地 API 已启动：http://127.0.0.1:${PORT}`));
