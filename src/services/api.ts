import {
  adminUser,
  currentUser,
  events,
  exportRequests,
  logs,
  media,
  persons,
  places,
  regions,
  sources,
  submissions,
  timeline,
} from '../data/mock';
import type {
  AuthResult,
  Event,
  ExportRequest,
  MapFilters,
  Media,
  Person,
  Place,
  PlaceDetail,
  Region,
  ReviewStatus,
  Source,
  TimelineAct,
  UgcSubmission,
  UserProfile,
} from '../types/domain';

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';

export function resolveDownloadUrl(fileUrl?: string) {
  if (!fileUrl) return undefined;
  if (/^https?:\/\//.test(fileUrl)) return fileUrl;
  return `${API_BASE}${fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`}`;
}

const wait = <T,>(data: T, delay = 90) =>
  new Promise<T>((resolve) => window.setTimeout(() => resolve(structuredClone(data)), delay));

function mockOrThrow<T>(error: unknown, fallback: () => Promise<T>): Promise<T> {
  if (API_BASE) throw error;
  return fallback();
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_BASE) throw new Error('NO_API_BASE');
  const token = localStorage.getItem('shanjian_token');
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

function filterPlaces(filters: MapFilters): Place[] {
  if (filters.types.length === 0) return [];
  const keyword = filters.keyword.trim().toLowerCase();
  const from = filters.timeFrom ?? 1937;
  const to = filters.timeTo ?? 1945;
  return places.filter((place) => {
    const matchType = filters.types.includes(place.placeType);
    const matchRegion = !filters.regionId || place.regionId === filters.regionId;
    const matchTime = place.startYear <= to && place.endYear >= from;
    const haystack = `${place.name}${place.region}${place.summary}${place.tags.join('')}`.toLowerCase();
    return matchType && matchRegion && matchTime && (!keyword || haystack.includes(keyword));
  });
}

export async function getMapPlaces(filters: MapFilters) {
  if (filters.types.length === 0) return [];
  try {
    return await request<Place[]>(`/api/map/places?${new URLSearchParams({
      keyword: filters.keyword,
      type: filters.types.join(','),
      region_id: filters.regionId ?? '',
      time_from: String(filters.timeFrom ?? ''),
      time_to: String(filters.timeTo ?? ''),
    })}`);
  } catch (error) {
    return mockOrThrow(error, () => wait(filterPlaces(filters)));
  }
}

export async function getPlaceDetail(id: string): Promise<PlaceDetail> {
  try {
    return await request<PlaceDetail>(`/api/map/places/${id}`);
  } catch (error) {
    const place = places.find((item) => item.id === id) ?? places[0];
    const linkedEvents = events.filter((event) => event.year >= place.startYear && event.year <= place.endYear).slice(0, 4);
    return mockOrThrow(error, () => wait({
      ...place,
      timelineEvents: linkedEvents.length ? linkedEvents : events.slice(0, 3),
      media,
      relatedPlaces: places.filter((item) => item.id !== place.id && item.regionId === place.regionId).slice(0, 4),
      relatedEvents: linkedEvents.slice(0, 3),
      sources,
      notes: ['当前为演示数据，正式史料需要进入来源核验流程。', 'UGC 内容不会直接进入公开前台，必须经过后台审核。'],
    }));
  }
}

export async function search(q: string) {
  try {
    return await request<{ places: Place[]; persons: Person[]; events: Event[] }>(`/api/search?q=${encodeURIComponent(q)}`);
  } catch (error) {
    const keyword = q.trim();
    return mockOrThrow(error, () => wait({
      places: filterPlaces({ types: ['battle', 'event', 'heritage'], keyword }),
      persons: persons.filter((item) => !keyword || `${item.name}${item.summary}`.includes(keyword)),
      events: events.filter((item) => !keyword || `${item.title}${item.summary}`.includes(keyword)),
    }));
  }
}

export const getTimeline = async () => {
  try { return await request<typeof timeline>('/api/events/timeline'); } catch (error) { return mockOrThrow(error, () => wait(timeline)); }
};

export const getTimelineActs = async () => {
  try { return await request<TimelineAct[]>('/api/timeline/acts'); }
  catch (error) { return mockOrThrow(error, () => wait([])); }
};

export const getRegions = async () => {
  try { return await request<Region[]>('/api/filters/regions'); } catch (error) { return mockOrThrow(error, () => wait(regions)); }
};

export async function login(email: string, password: string, role: 'user' | 'admin' = 'user'): Promise<AuthResult> {
  try {
    return await request<AuthResult>(role === 'admin' ? '/api/admin/auth/login' : '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  } catch (error) {
    const user = role === 'admin' ? adminUser : { ...currentUser, email };
    return mockOrThrow(error, () => wait({ token: role === 'admin' ? 'mock-admin-token' : 'mock-user-token', user }));
  }
}

export async function register(email: string, nickname: string, password: string): Promise<AuthResult> {
  try {
    return await request<AuthResult>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, nickname, password }) });
  } catch (error) {
    return mockOrThrow(error, () => wait({ token: 'mock-user-token', user: { ...currentUser, id: `user-${Date.now()}`, email, nickname, role: 'user' } }));
  }
}

export async function getMe() {
  try { return await request<UserProfile>('/api/me'); } catch (error) { return mockOrThrow(error, () => wait(currentUser)); }
}

export async function updateMyAvatar(avatarUrl: string) {
  try {
    return await request<UserProfile>('/api/me/avatar', { method: 'PUT', body: JSON.stringify({ avatarUrl }) });
  } catch (error) {
    return mockOrThrow(error, () => wait({ ...currentUser, avatarUrl }));
  }
}

export async function getMyFavorites() {
  try { return await request<Place[]>('/api/me/favorites'); }
  catch (error) { return mockOrThrow(error, () => wait(places.filter((place) => currentUser.favorites.includes(place.id)))); }
}

export async function getMySubmissions() {
  try { return await request<UgcSubmission[]>('/api/me/submissions'); }
  catch (error) { return mockOrThrow(error, () => wait(submissions.filter((item) => item.submitter === currentUser.email))); }
}

export async function getMyExportRequests() {
  try { return await request<ExportRequest[]>('/api/me/export-requests'); }
  catch (error) { return mockOrThrow(error, () => wait(exportRequests.filter((item) => item.applicant === currentUser.email))); }
}

export async function addFavorite(placeId: string) {
  return request<{ favorites: string[] }>('/api/favorites', {
    method: 'POST',
    body: JSON.stringify({ place_id: placeId }),
  });
}

export async function removeFavorite(placeId: string) {
  return request<{ favorites: string[] }>(`/api/favorites/${placeId}`, { method: 'DELETE' });
}

export async function createUgcSubmission(payload: Partial<UgcSubmission> & Record<string, unknown>) {
  return request<UgcSubmission>('/api/ugc/submissions', { method: 'POST', body: JSON.stringify(payload) });
}

export async function createExportRequest(payload: Partial<ExportRequest> & Record<string, unknown>) {
  return request<ExportRequest>('/api/export-requests', { method: 'POST', body: JSON.stringify(payload) });
}
export const adminApi = {
  async getDashboard() {
    try { return await request<{ stats: Array<{ label: string; value: number; hint: string }> }>('/api/admin/dashboard'); }
    catch (error) { return mockOrThrow(error, () => wait({ stats: [
      { label: '公开点位', value: places.length, hint: '三类点位已入库' },
      { label: '待审 UGC', value: submissions.filter((item) => item.status === 'pending').length, hint: '进入审核队列' },
      { label: '导出申请', value: exportRequests.filter((item) => item.status === 'pending').length, hint: '等待审批' },
      { label: '来源条目', value: sources.length, hint: '可追溯引用' },
    ] })); }
  },
  async getSubmissions() { try { return await request<UgcSubmission[]>('/api/admin/ugc/submissions'); } catch (error) { return mockOrThrow(error, () => wait(submissions)); } },
  async approveUgc(id: string) { try { return await request<UgcSubmission>(`/api/admin/ugc/${id}/approve`, { method: 'POST' }); } catch (error) { return mockOrThrow(error, () => wait({ id, status: 'approved' as ReviewStatus })); } },
  async rejectUgc(id: string) { try { return await request<UgcSubmission>(`/api/admin/ugc/${id}/reject`, { method: 'POST' }); } catch (error) { return mockOrThrow(error, () => wait({ id, status: 'rejected' as ReviewStatus })); } },
  async getPlaces() { try { return await request<Place[]>('/api/admin/places'); } catch (error) { return mockOrThrow(error, () => wait(places)); } },
  async getEvents() { try { return await request<Event[]>('/api/admin/events'); } catch (error) { return mockOrThrow(error, () => wait(events)); } },
  async getPersons() { try { return await request<Person[]>('/api/admin/persons'); } catch (error) { return mockOrThrow(error, () => wait(persons)); } },
  async getRegions() { try { return await request<Region[]>('/api/admin/regions'); } catch (error) { return mockOrThrow(error, () => wait(regions)); } },
  async getMedia() { try { return await request<Media[]>('/api/admin/media'); } catch (error) { return mockOrThrow(error, () => wait(media)); } },
  async getSources() { try { return await request<Source[]>('/api/admin/sources'); } catch (error) { return mockOrThrow(error, () => wait(sources)); } },
  async getExportRequests() { try { return await request<ExportRequest[]>('/api/admin/export-requests'); } catch (error) { return mockOrThrow(error, () => wait(exportRequests)); } },
  async approveExport(id: string): Promise<ExportRequest> {
    try { return await request<ExportRequest>(`/api/admin/export-requests/${id}/approve`, { method: 'POST' }); }
    catch (error) { return mockOrThrow(error, () => wait({ id, requestId: id, applicant: currentUser.email, dataScope: '', reason: '', status: 'approved' as ReviewStatus, createdAt: new Date().toISOString() })); }
  },
  async rejectExport(id: string): Promise<ExportRequest> {
    try { return await request<ExportRequest>(`/api/admin/export-requests/${id}/reject`, { method: 'POST' }); }
    catch (error) { return mockOrThrow(error, () => wait({ id, requestId: id, applicant: currentUser.email, dataScope: '', reason: '', status: 'rejected' as ReviewStatus, createdAt: new Date().toISOString() })); }
  },
  async getLogs() { try { return await request<typeof logs>('/api/admin/logs'); } catch (error) { return mockOrThrow(error, () => wait(logs)); } },
  async getConfig() {
    try { return await request<{ defaultBasemap?: string; labelDensity?: 'simple' | 'standard' | 'detailed'; exportApproval?: boolean }>('/api/admin/config'); }
    catch (error) { return mockOrThrow(error, () => wait({ defaultBasemap: 'terrain', labelDensity: 'standard' as const, animationSpeed: 'standard', exportApproval: true })); }
  },
  async updateConfig<T extends object>(config: T) { try { return await request<T>('/api/admin/config', { method: 'PUT', body: JSON.stringify(config) }); } catch (error) { return mockOrThrow(error, () => wait(config)); } },
  async createResource<T extends object>(resource: string, payload: T) {
    return request(`/api/admin/${resource}`, { method: 'POST', body: JSON.stringify(payload) });
  },
  async updateResource<T extends object>(resource: string, id: string, payload: T) {
    return request(`/api/admin/${resource}/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },
  async deleteResource(resource: string, id: string) {
    return request<{ id: string; resource: string; deleted: boolean }>(`/api/admin/${resource}/${id}`, { method: 'DELETE' });
  },
};

