import { create } from 'zustand';
import type { BasemapKey, MapFilters, Place, PlaceDetail, PlaceType, Region, TimelineAct, TimelineBucket, UiTheme, UserProfile } from '../types/domain';
import { getMapPlaces, getPlaceDetail, getRegions, getTimeline, getTimelineActs, login as apiLogin, register as apiRegister } from '../services/api';

interface AppState {
  filters: MapFilters;
  places: Place[];
  regions: Region[];
  selectedPlace?: PlaceDetail;
  timeline: TimelineBucket[];
  acts: TimelineAct[];
  typeTotals: Record<PlaceType, number>;
  activeYear: number;
  basemap: BasemapKey;
  labelDensity: 'simple' | 'standard' | 'detailed';
  uiTheme: UiTheme;
  isPlaying: boolean;
  token?: string;
  user?: UserProfile;
  authReady: boolean;
  loadInitial: () => Promise<void>;
  hydrateAuth: () => void;
  setKeyword: (keyword: string) => void;
  setTypes: (types: PlaceType[]) => void;
  toggleType: (type: PlaceType) => void;
  setRegion: (regionId?: string) => void;
  setTimeRange: (from: number, to: number) => void;
  selectPlace: (id: string) => Promise<void>;
  setBasemap: (basemap: BasemapKey) => void;
  setLabelDensity: (density: AppState['labelDensity']) => void;
  setUiTheme: (theme: UiTheme) => void;
  setActiveYear: (year: number) => void;
  setPlaying: (value: boolean) => void;
  setUserFavorites: (favorites: string[]) => void;
  setUserProfile: (user: UserProfile) => void;
  login: (email: string, password: string, role: 'user' | 'admin') => Promise<UserProfile>;
  register: (email: string, nickname: string, password: string) => Promise<UserProfile>;
  logout: () => void;
}

const persistAuth = (token?: string, user?: UserProfile) => {
  if (token && user) {
    localStorage.setItem('shanjian_token', token);
    localStorage.setItem('shanjian_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('shanjian_token');
    localStorage.removeItem('shanjian_user');
  }
};

export const useAppStore = create<AppState>((set, get) => ({
  filters: { types: ['battle', 'event', 'heritage'], keyword: '', timeFrom: 1937, timeTo: 1945 },
  places: [],
  regions: [],
  timeline: [],
  acts: [],
  typeTotals: { battle: 0, event: 0, heritage: 0 },
  activeYear: 1937,
  basemap: 'terrain',
  labelDensity: 'standard',
  uiTheme: typeof window !== 'undefined' && localStorage.getItem('shanjian_ui_theme') === 'light' ? 'light' : 'dark',
  isPlaying: false,
  authReady: false,
  async loadInitial() {
    const [loadedPlaces, loadedTimeline, loadedActs, loadedRegions] = await Promise.all([getMapPlaces(get().filters), getTimeline(), getTimelineActs(), getRegions()]);
    const typeTotals = loadedPlaces.reduce<Record<PlaceType, number>>((counts, place) => {
      counts[place.placeType] += 1;
      return counts;
    }, { battle: 0, event: 0, heritage: 0 });
    set({ places: loadedPlaces, timeline: loadedTimeline, acts: loadedActs, regions: loadedRegions, typeTotals });
    if (!get().selectedPlace && loadedPlaces[0]) await get().selectPlace(loadedPlaces[0].id);
  },
  hydrateAuth() {
    const token = localStorage.getItem('shanjian_token') ?? undefined;
    const raw = localStorage.getItem('shanjian_user');
    const user = raw ? (JSON.parse(raw) as UserProfile) : undefined;
    set({ token, user, authReady: true });
  },
  setKeyword(keyword) {
    const filters = { ...get().filters, keyword };
    set({ filters });
    void getMapPlaces(filters).then((places) => set((state) => ({
      places,
      selectedPlace: state.selectedPlace && places.some((place) => place.id === state.selectedPlace?.id) ? state.selectedPlace : undefined,
    })));
  },
  setTypes(types) {
    const filters = { ...get().filters, types };
    set({ filters, ...(types.length === 0 ? { selectedPlace: undefined } : {}) });
    void getMapPlaces(filters).then((places) => set((state) => ({
      places,
      selectedPlace: state.selectedPlace && places.some((place) => place.id === state.selectedPlace?.id) ? state.selectedPlace : undefined,
    })));
  },
  toggleType(type) {
    const current = get().filters.types;
    const types = current.includes(type) ? current.filter((item) => item !== type) : [...current, type];
    const filters = { ...get().filters, types };
    set({ filters, ...(types.length === 0 ? { selectedPlace: undefined } : {}) });
    void getMapPlaces(filters).then((places) => set((state) => ({
      places,
      selectedPlace: state.selectedPlace && places.some((place) => place.id === state.selectedPlace?.id) ? state.selectedPlace : undefined,
    })));
  },
  setRegion(regionId) {
    const filters = { ...get().filters, regionId };
    set({ filters });
    void getMapPlaces(filters).then((places) => set((state) => ({
      places,
      selectedPlace: state.selectedPlace && places.some((place) => place.id === state.selectedPlace?.id) ? state.selectedPlace : undefined,
    })));
  },
  setTimeRange(timeFrom, timeTo) {
    const filters = { ...get().filters, timeFrom, timeTo };
    set({ filters });
    void getMapPlaces(filters).then((places) => set((state) => ({
      places,
      selectedPlace: state.selectedPlace && places.some((place) => place.id === state.selectedPlace?.id) ? state.selectedPlace : undefined,
    })));
  },
  async selectPlace(id) { set({ selectedPlace: await getPlaceDetail(id) }); },
  setBasemap: (basemap) => set({ basemap }),
  setLabelDensity: (labelDensity) => set({ labelDensity }),
  setUiTheme: (uiTheme) => {
    localStorage.setItem('shanjian_ui_theme', uiTheme);
    set({ uiTheme });
  },
  setActiveYear: (activeYear) => set({ activeYear }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setUserFavorites(favorites) {
    const user = get().user;
    if (!user) return;
    const nextUser = { ...user, favorites };
    persistAuth(get().token, nextUser);
    set({ user: nextUser });
  },
  setUserProfile(user) {
    persistAuth(get().token, user);
    set({ user });
  },
  async login(email, password, role) {
    const result = await apiLogin(email, password, role);
    persistAuth(result.token, result.user);
    set({ token: result.token, user: result.user, authReady: true });
    return result.user;
  },
  async register(email, nickname, password) {
    const result = await apiRegister(email, nickname, password);
    persistAuth(result.token, result.user);
    set({ token: result.token, user: result.user, authReady: true });
    return result.user;
  },
  logout() {
    persistAuth();
    set({ token: undefined, user: undefined, authReady: true });
  },
}));
