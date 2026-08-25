import type { BasemapKey } from '../types/domain';

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? '';

export const MAPBOX_GL_JS_URL = 'https://api.mapbox.com/mapbox-gl-js/v3.10.0/mapbox-gl.js';
export const MAPBOX_GL_CSS_URL = 'https://api.mapbox.com/mapbox-gl-js/v3.10.0/mapbox-gl.css';

export const MAPBOX_STYLES: Record<BasemapKey, string> = {
  terrain: 'mapbox://styles/mapbox/outdoors-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  archive: 'mapbox://styles/mapbox/dark-v11',
};

export const LUSHAN_VIEW = {
  center: [115.982, 29.566] as [number, number],
  zoom: 11.2,
  pitch: 62,
  bearing: -24,
};

export const MAPBOX_PADDING = { top: 112, right: 360, bottom: 168, left: 330 };

const publicAsset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

export const markerIconByType = {
  battle: publicAsset('assets/markers/battle-marker-map.png'),
  event: publicAsset('assets/markers/event-marker-map.png'),
  heritage: publicAsset('assets/markers/heritage-marker-map.png'),
} as const;

export const svgMarkerByType = {
  battle: publicAsset('assets/markers/battle-marker.svg'),
  event: publicAsset('assets/markers/event-marker.svg'),
  heritage: publicAsset('assets/markers/heritage-marker.svg'),
} as const;
