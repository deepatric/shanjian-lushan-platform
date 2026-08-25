export type PlaceType = 'battle' | 'event' | 'heritage';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type UserRole = 'guest' | 'user' | 'admin';
export type BasemapKey = 'terrain' | 'satellite' | 'archive';
export type UiTheme = 'light' | 'dark';

export interface Region {
  id: string;
  name: string;
  parentId?: string;
  count?: number;
  geometry?: unknown;
}

export interface Source {
  id: string;
  title: string;
  sourceType: string;
  citation: string;
  note?: string;
}

export interface Media {
  id: string;
  mediaType: 'image' | 'archive' | 'ai_restoration';
  url?: string;
  title: string;
  caption: string;
  isAiGenerated: boolean;
  sourceId?: string;
}

export interface Event {
  id: string;
  title: string;
  startTimeRaw: string;
  normalizedStart: string;
  year: number;
  month?: number;
  day?: number;
  summary: string;
  region: string;
  regionId?: string;
  placeId?: string;
}

export interface TimelineAct {
  actNo: number;
  title: string;
  startDate: string;
  endDate: string;
}

export interface Person {
  id: string;
  name: string;
  aliases: string[];
  summary: string;
}

export interface Place {
  id: string;
  pointSource?: 'place' | 'event_site';
  sourceId?: string;
  name: string;
  slug: string;
  placeType: PlaceType;
  longitude: number;
  latitude: number;
  altitude?: number;
  regionId: string;
  region: string;
  startYear: number;
  endYear: number;
  highlightLevel: 1 | 2 | 3;
  summary: string;
  baseInfo: string;
  tags: string[];
  eventCount?: number;
  eventIds?: string[];
  actNumbers?: number[];
  actTitles?: string[];
}

export interface PlaceDetail extends Place {
  timelineEvents: Event[];
  media: Media[];
  relatedPlaces: Place[];
  relatedEvents: Event[];
  sources: Source[];
  notes: string[];
}

export interface TimelineKeyframe {
  id: string;
  title: string;
  placeId: string;
  year: number;
  month?: number;
  description: string;
}

export interface TimelineBucket {
  timeBucket: string;
  year: number;
  visiblePlaces: string[];
  keyframes: TimelineKeyframe[];
}

export interface UgcSubmission {
  id: string;
  submissionType: 'place' | 'text' | 'media';
  title: string;
  submitter: string;
  sourceNote: string;
  status: ReviewStatus;
  createdAt: string;
}

export interface ExportRequest {
  id: string;
  requestId: string;
  applicant: string;
  dataScope: string;
  reason: string;
  status: ReviewStatus;
  createdAt: string;
  fileUrl?: string;
  downloadExpiresAt?: string;
}

export interface AdminLog {
  id: string;
  operator: string;
  action: string;
  target: string;
  createdAt: string;
}

export interface MapFilters {
  types: PlaceType[];
  regionId?: string;
  keyword: string;
  timeFrom?: number;
  timeTo?: number;
}

export interface UserProfile {
  id: string;
  nickname: string;
  email: string;
  role: 'user' | 'admin';
  avatarUrl?: string;
  favorites: string[];
  notifications: string[];
}

export interface AuthResult {
  token: string;
  user: UserProfile;
}
