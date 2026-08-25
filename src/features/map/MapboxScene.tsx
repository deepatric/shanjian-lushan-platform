import mapboxgl, { type GeoJSONSource, type Map as MapboxMap } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LUSHAN_VIEW, MAPBOX_STYLES, MAPBOX_TOKEN, markerIconByType } from '../../config/map';
import type { BasemapKey, Place } from '../../types/domain';

interface MapboxSceneProps {
  places: Place[];
  selectedId?: string;
  focusRequest?: { id: string; token: number };
  activeYear: number;
  basemap: BasemapKey;
  labelDensity: 'simple' | 'standard' | 'detailed';
  onSelect: (id: string) => void;
}

const PLACE_SOURCE = 'shanjian-places';
const ROUTE_SOURCE = 'shanjian-routes';
const PIN_LAYER = 'shanjian-place-pins';
const SELECTED_LAYER = 'shanjian-place-selected';
const CLUSTER_LAYER = 'shanjian-place-clusters';
const CLUSTER_COUNT_LAYER = 'shanjian-place-cluster-count';
const ROUTE_LAYER = 'shanjian-history-routes';
const HILLSHADE_LAYER = 'shanjian-cultural-hillshade';
const TERRAIN_SOURCE = 'shanjian-terrain-dem';
const HILLSHADE_SOURCE = 'shanjian-hillshade-dem';
const TERRAIN_VECTOR_SOURCE = 'shanjian-terrain-vector';
const FINE_CONTOUR_LAYER = 'shanjian-fine-contours';
const CULTURAL_LAYER_PREFIX = 'shanjian-';
const HIDDEN_BASE_LAYER_KEYWORDS = [
  'aerialway',
  'airport',
  'bridge',
  'building',
  'ferry',
  'motorway',
  'place',
  'poi',
  'road',
  'settlement',
  'street',
  'structure',
  'transit',
  'tunnel',
];

function fitAllPlaces(map: MapboxMap, places: Place[], duration = 700) {
  if (!places.length) return;
  const bounds = new mapboxgl.LngLatBounds();
  places.forEach((place) => bounds.extend([place.longitude, place.latitude]));
  const compact = map.getContainer().clientWidth <= 760;
  map.fitBounds(bounds, {
    padding: compact
      ? { top: 86, right: 28, bottom: 142, left: 28 }
      : { top: 120, right: 500, bottom: 170, left: 390 },
    pitch: LUSHAN_VIEW.pitch,
    bearing: LUSHAN_VIEW.bearing,
    duration,
    maxZoom: compact ? 9.6 : 10.6,
    essential: true,
  });
}

function placesToGeoJson(places: Place[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: places.map((place) => ({
      type: 'Feature',
      id: place.id,
      properties: {
        id: place.id,
        title: place.name,
        placeType: place.placeType,
        regionId: place.regionId,
        highlightLevel: place.highlightLevel,
        startYear: place.startYear,
        endYear: place.endYear,
        eventCount: place.eventCount ?? 0,
        actLabel: place.actNumbers?.length ? `第${place.actNumbers.join('、')}幕` : '常设景观',
      },
      geometry: { type: 'Point', coordinates: [place.longitude, place.latitude] },
    })),
  };
}

function routeGeoJson(): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { id: 'guling-cultural-chain' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [115.970854, 29.561355],
            [115.971353, 29.561571],
            [115.973092, 29.566782],
            [115.978481, 29.568221],
            [115.978519, 29.566942],
            [115.985582, 29.579013],
            [115.985803, 29.578073],
            [115.954304, 29.562742],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { id: 'wanjialing-memory-chain' },
        geometry: { type: 'LineString', coordinates: [[115.759216, 29.341483], [115.757452, 29.350132]] },
      },
    ],
  };
}

async function addMarkerImages(map: MapboxMap) {
  await Promise.all(Object.entries(markerIconByType).map(([type, url]) => new Promise<void>((resolve) => {
    const imageId = `${type}-marker`;
    if (map.hasImage(imageId)) return resolve();
    map.loadImage(url, (error, image) => {
      if (!error && image && !map.hasImage(imageId)) map.addImage(imageId, image, { pixelRatio: 2 });
      resolve();
    });
  })));
}

function hideModernMapLayers(map: MapboxMap) {
  const style = map.getStyle();
  style.layers?.forEach((layer) => {
    if (layer.id.startsWith(CULTURAL_LAYER_PREFIX)) return;
    const sourceLayer = 'source-layer' in layer ? String(layer['source-layer'] ?? '') : '';
    const searchable = `${layer.id} ${sourceLayer}`.toLowerCase();
    const isModernSymbol = layer.type === 'symbol';
    const isModernFeature = HIDDEN_BASE_LAYER_KEYWORDS.some((keyword) => searchable.includes(keyword));
    if (isModernSymbol || isModernFeature) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  });
}

function findFirstCulturalLayerId(map: MapboxMap) {
  return map.getStyle().layers?.find((layer) => layer.id.startsWith(CULTURAL_LAYER_PREFIX))?.id;
}

function installMiddleButtonRotate(map: MapboxMap) {
  const canvas = map.getCanvas();
  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();

  let longPressTimer: number | undefined;
  let rotating = false;
  let raf = 0;
  let startX = 0;
  let startY = 0;
  let startBearing = 0;
  let startPitch = 0;
  let nextBearing = 0;
  let nextPitch = 0;

  const clearLongPress = () => {
    if (longPressTimer !== undefined) window.clearTimeout(longPressTimer);
    longPressTimer = undefined;
  };

  const stopRotate = () => {
    clearLongPress();
    rotating = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    canvas.classList.remove('middle-rotate-active');
  };

  const applyRotate = () => {
    raf = 0;
    map.setBearing(nextBearing);
    map.setPitch(nextPitch);
  };

  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
  };

  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 1) return;
    event.preventDefault();
    startX = event.clientX;
    startY = event.clientY;
    startBearing = map.getBearing();
    startPitch = map.getPitch();
    clearLongPress();
    longPressTimer = window.setTimeout(() => {
      rotating = true;
      canvas.classList.add('middle-rotate-active');
    }, 180);
  };

  const onMouseMove = (event: MouseEvent) => {
    if (!rotating) return;
    event.preventDefault();
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    nextBearing = startBearing - dx * 0.24;
    nextPitch = Math.max(22, Math.min(78, startPitch - dy * 0.16));
    if (!raf) raf = window.requestAnimationFrame(applyRotate);
  };

  const onAuxClick = (event: MouseEvent) => {
    if (event.button === 1) event.preventDefault();
  };

  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('auxclick', onAuxClick);
  window.addEventListener('mousemove', onMouseMove, { passive: false });
  window.addEventListener('mouseup', stopRotate);
  window.addEventListener('blur', stopRotate);

  return () => {
    stopRotate();
    canvas.removeEventListener('contextmenu', onContextMenu);
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('auxclick', onAuxClick);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', stopRotate);
    window.removeEventListener('blur', stopRotate);
  };
}

function addCulturalLayers(map: MapboxMap, data: GeoJSON.FeatureCollection<GeoJSON.Point>, selectedId?: string, labelDensity: MapboxSceneProps['labelDensity'] = 'standard') {
  hideModernMapLayers(map);

  if (!map.getSource(TERRAIN_SOURCE)) {
    map.addSource(TERRAIN_SOURCE, { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
  }
  if (!map.getSource(HILLSHADE_SOURCE)) {
    map.addSource(HILLSHADE_SOURCE, { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
  }
  if (!map.getSource(TERRAIN_VECTOR_SOURCE)) {
    map.addSource(TERRAIN_VECTOR_SOURCE, { type: 'vector', url: 'mapbox://mapbox.mapbox-terrain-v2' });
  }

  map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: 1.92 });
  map.setFog({ color: '#171513', 'high-color': '#6f6a57', 'horizon-blend': 0.32, 'space-color': '#080706', 'star-intensity': 0.02 });

  if (!map.getLayer(HILLSHADE_LAYER)) {
    map.addLayer({
      id: HILLSHADE_LAYER,
      type: 'hillshade',
      source: HILLSHADE_SOURCE,
      paint: {
        'hillshade-accent-color': '#8B3D2E',
        'hillshade-exaggeration': 0.84,
        'hillshade-highlight-color': '#d2c095',
        'hillshade-illumination-anchor': 'viewport',
        'hillshade-illumination-direction': 315,
        'hillshade-shadow-color': '#0f0d0b',
      },
    }, findFirstCulturalLayerId(map));
  }

  if (!map.getLayer(FINE_CONTOUR_LAYER)) {
    map.addLayer({
      id: FINE_CONTOUR_LAYER,
      type: 'line',
      source: TERRAIN_VECTOR_SOURCE,
      'source-layer': 'contour',
      minzoom: 9,
      paint: {
        'line-color': '#a59877',
        'line-opacity': 0.28,
        'line-width': 0.55,
      },
    });
  }

  if (!map.getSource(ROUTE_SOURCE)) map.addSource(ROUTE_SOURCE, { type: 'geojson', data: routeGeoJson() });
  if (!map.getLayer(ROUTE_LAYER)) {
    map.addLayer({
      id: ROUTE_LAYER,
      type: 'line',
      source: ROUTE_SOURCE,
      paint: {
        'line-color': '#8B3D2E',
        'line-width': 2.4,
        'line-opacity': 0.72,
        'line-dasharray': [1.2, 1.2],
      },
    });
  }

  if (!map.getSource(PLACE_SOURCE)) map.addSource(PLACE_SOURCE, {
    type: 'geojson',
    data,
    cluster: true,
    clusterMaxZoom: 11,
    clusterRadius: 42,
  });
  else (map.getSource(PLACE_SOURCE) as GeoJSONSource).setData(data);

  const iconSize = 0.06;
  const selectedIconSize = 0.09;
  const textSize = labelDensity === 'simple' ? 10 : labelDensity === 'detailed' ? 14 : 12;

  if (!map.getLayer(CLUSTER_LAYER)) {
    map.addLayer({
      id: CLUSTER_LAYER,
      type: 'circle',
      source: PLACE_SOURCE,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': ['step', ['get', 'point_count'], '#7d6d50', 8, '#8b3d2e', 18, '#5a2c27'],
        'circle-radius': ['step', ['get', 'point_count'], 13, 8, 17, 18, 21],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ead0a3',
        'circle-opacity': 0.9,
      },
    });
  }

  if (!map.getLayer(CLUSTER_COUNT_LAYER)) {
    map.addLayer({
      id: CLUSTER_COUNT_LAYER,
      type: 'symbol',
      source: PLACE_SOURCE,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-size': 11,
      },
      paint: { 'text-color': '#fff2d2' },
    });
  }

  if (!map.getLayer(PIN_LAYER)) {
    map.addLayer({
      id: PIN_LAYER,
      type: 'symbol',
      source: PLACE_SOURCE,
      filter: ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'id'], selectedId ?? '__none__']],
      layout: {
        'icon-image': ['concat', ['get', 'placeType'], '-marker'],
        'icon-size': iconSize,
        'icon-anchor': 'bottom',
        'icon-allow-overlap': false,
        'icon-ignore-placement': false,
        'text-field': ['get', 'title'],
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        'text-size': textSize,
        'text-anchor': 'left',
        'text-offset': [0.62, -0.72],
        'text-max-width': 9,
        'text-allow-overlap': false,
        'text-optional': true,
        'symbol-sort-key': ['get', 'highlightLevel'],
      },
      paint: {
        'icon-opacity': ['match', ['get', 'highlightLevel'], 1, 0.56, 2, 0.76, 3, 0.98, 0.72],
        'text-color': '#F2EBDD',
        'text-halo-color': '#171513',
        'text-halo-width': 1.4,
        'text-opacity': labelDensity === 'simple' ? 0.72 : 0.92,
      },
    });
  }

  if (!map.getLayer(SELECTED_LAYER)) {
    map.addLayer({
      id: SELECTED_LAYER,
      type: 'symbol',
      source: PLACE_SOURCE,
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], selectedId ?? '__none__']],
      layout: {
        'icon-image': ['concat', ['get', 'placeType'], '-marker'],
        'icon-size': selectedIconSize,
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'text-field': ['get', 'title'],
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-size': 14,
        'text-anchor': 'left',
        'text-offset': [0.72, -0.82],
        'text-allow-overlap': true,
      },
      paint: { 'icon-opacity': 1, 'text-color': '#F2EBDD', 'text-halo-color': '#171513', 'text-halo-width': 2 },
    });
  }
}

export function MapboxScene({ places, selectedId, focusRequest, activeYear, basemap, labelDensity, onSelect }: MapboxSceneProps) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const sourceData = useMemo(() => placesToGeoJson(places), [places]);
  const latestData = useRef(sourceData);
  const latestPlaces = useRef(places);
  const latestSelected = useRef(selectedId);
  const latestDensity = useRef(labelDensity);
  const appliedBasemap = useRef(basemap);
  const hasInitialFit = useRef(false);

  useEffect(() => {
    latestData.current = sourceData;
    latestPlaces.current = places;
  }, [places, sourceData]);
  useEffect(() => { latestSelected.current = selectedId; }, [selectedId]);
  useEffect(() => { latestDensity.current = labelDensity; }, [labelDensity]);

  useEffect(() => {
    if (!nodeRef.current || mapRef.current) return;
    let disposed = false;
    setStatus('loading');
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: nodeRef.current,
      style: MAPBOX_STYLES[basemap],
      center: LUSHAN_VIEW.center,
      zoom: LUSHAN_VIEW.zoom,
      pitch: LUSHAN_VIEW.pitch,
      bearing: LUSHAN_VIEW.bearing,
      antialias: true,
      attributionControl: false,
      projection: 'mercator',
    });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __SHANJIAN_MAP__?: MapboxMap }).__SHANJIAN_MAP__ = map;
    const disposeMiddleButtonRotate = installMiddleButtonRotate(map);
    const resizeMap = () => map.resize();
    const resizeObserver = new ResizeObserver(resizeMap);
    resizeObserver.observe(nodeRef.current);
    window.addEventListener('resize', resizeMap);
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.on('style.load', async () => {
      if (disposed) return;
      await addMarkerImages(map);
      addCulturalLayers(map, latestData.current, latestSelected.current, latestDensity.current);
      if (!hasInitialFit.current && latestData.current.features.length) {
        fitAllPlaces(map, latestPlaces.current, 0);
        hasInitialFit.current = true;
      }
      setStatus('ready');
    });
    map.on('error', () => setStatus('error'));
    map.on('click', PIN_LAYER, (event) => {
      const id = event.features?.[0]?.properties?.id;
      if (id) onSelect(id);
    });
    map.on('click', SELECTED_LAYER, (event) => {
      const id = event.features?.[0]?.properties?.id;
      if (id) onSelect(id);
    });
    map.on('click', CLUSTER_LAYER, (event) => {
      const feature = event.features?.[0];
      const clusterId = Number(feature?.properties?.cluster_id);
      const coordinates = feature?.geometry.type === 'Point' ? feature.geometry.coordinates as [number, number] : undefined;
      const source = map.getSource(PLACE_SOURCE) as GeoJSONSource | undefined;
      if (!source || !coordinates || !Number.isFinite(clusterId)) return;
      source.getClusterExpansionZoom(clusterId, (error, zoom) => {
        if (!error && zoom != null) map.easeTo({ center: coordinates, zoom, duration: 520, essential: true });
      });
    });
    map.on('mouseenter', PIN_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', PIN_LAYER, () => { map.getCanvas().style.cursor = ''; });
    map.on('mouseenter', CLUSTER_LAYER, () => { map.getCanvas().style.cursor = 'zoom-in'; });
    map.on('mouseleave', CLUSTER_LAYER, () => { map.getCanvas().style.cursor = ''; });
    return () => {
      disposed = true;
      resizeObserver.disconnect();
      window.removeEventListener('resize', resizeMap);
      disposeMiddleButtonRotate();
      map.remove();
      mapRef.current = null;
      if (import.meta.env.DEV) delete (window as unknown as { __SHANJIAN_MAP__?: MapboxMap }).__SHANJIAN_MAP__;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedBasemap.current === basemap) return;
    appliedBasemap.current = basemap;
    map.setStyle(MAPBOX_STYLES[basemap]);
  }, [basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource(PLACE_SOURCE) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(sourceData);
    if (!hasInitialFit.current && places.length) {
      fitAllPlaces(map, places);
      hasInitialFit.current = true;
    }
  }, [sourceData, activeYear]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer(PIN_LAYER)) return;
    map.setFilter(PIN_LAYER, ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'id'], selectedId ?? '__none__']]);
    map.setFilter(SELECTED_LAYER, ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], selectedId ?? '__none__']]);
  }, [selectedId, places]);

  useEffect(() => {
    const map = mapRef.current;
    const target = focusRequest ? latestPlaces.current.find((place) => place.id === focusRequest.id) : undefined;
    if (!map || !target) return;

    const focusTarget = () => {
      map.easeTo({
        center: [target.longitude, target.latitude],
        zoom: Math.max(map.getZoom(), 13.2),
        duration: 820,
        essential: true,
      });
    };

    if (map.isStyleLoaded()) {
      focusTarget();
      return;
    }

    map.once('style.load', focusTarget);
    return () => { map.off('style.load', focusTarget); };
  }, [focusRequest]);

  return (
    <div className="mapbox-scene">
      <div ref={nodeRef} className="mapbox-canvas" />
      <div className="map-grain" aria-hidden="true" />
      {status === 'loading' && <div className="map-status">正在连接 Mapbox 三维地形与点位图层…</div>}
      {status === 'error' && <div className="map-status error">Mapbox GL JS 加载或底图请求失败，请检查 token / 网络后刷新。</div>}
    </div>
  );
}
