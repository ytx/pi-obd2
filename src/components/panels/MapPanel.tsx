import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { layers, namedTheme } from 'protomaps-themes-base';
import { useOBDStore } from '@/stores/useOBDStore';
import { useGpioStore } from '@/stores/useGpioStore';
import { useMapStore } from '@/stores/useMapStore';

// Register pmtiles protocol once
const pmtilesProtocol = new Protocol();
maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);

type MapTheme = 'light' | 'dark';

function makeStyle(tilesUrl: string, theme: MapTheme): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: `https://protomaps.github.io/basemaps-assets/sprites/v4/${theme}`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${tilesUrl}`,
        attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: layers('protomaps', namedTheme(theme), { lang: 'ja' }),
  };
}

function createIconElement(iconName: string, color: string, size: number): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'material-symbols-outlined';
  el.textContent = iconName;
  el.style.cssText = `font-size:${size}px;color:${color};line-height:1;cursor:default;`
    + 'text-shadow:0 0 4px rgba(0,0,0,0.8),0 0 8px rgba(0,0,0,0.5);'
    + 'filter:drop-shadow(0 0 2px rgba(255,255,255,0.6));'
    + 'pointer-events:none;';
  return el;
}

function MapPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const currentMarkerRef = useRef<maplibregl.Marker | null>(null);
  const destMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [tilesUrl, setTilesUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const themeRef = useRef<MapTheme>('dark');
  const userInteractingRef = useRef(false);
  const interactTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store state
  const illuminationActive = useGpioStore((s) => s.illuminationActive);
  const headingUp = useMapStore((s) => s.headingUp);
  const setHeadingUp = useMapStore((s) => s.setHeadingUp);
  const activeDestinationId = useMapStore((s) => s.activeDestinationId);
  const destinations = useMapStore((s) => s.destinations);
  const activeDest = destinations.find((d) => d.id === activeDestinationId) ?? null;

  // GPS values
  const currentValues = useOBDStore((s) => s.currentValues);
  const lat = currentValues['GPS_LAT']?.value;
  const lon = currentValues['GPS_LON']?.value;
  const hdg = currentValues['GPS_HDG']?.value;

  // Determine map theme from illumination (ON = night = dark)
  const mapTheme: MapTheme = illuminationActive ? 'dark' : 'light';

  // Discover available PMTiles files
  useEffect(() => {
    let cancelled = false;
    window.obd2API.mapListTiles().then((files) => {
      if (cancelled) return;
      if (files.length > 0) {
        setTilesUrl(`local-tiles://${files[0].path}`);
      } else {
        setError('No .pmtiles files found');
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || !tilesUrl) return;

    themeRef.current = mapTheme;
    const map = new maplibregl.Map({
      container: containerRef.current,
      zoom: 12,
      center: [139.6917, 35.6895],
      style: makeStyle(tilesUrl, mapTheme),
      bearing: 0,
      pitch: 0,
      attributionControl: false,
    });
    mapRef.current = map;

    // Pause auto-follow during user interaction
    const onInteractStart = () => {
      userInteractingRef.current = true;
      if (interactTimeoutRef.current) clearTimeout(interactTimeoutRef.current);
    };
    const onInteractEnd = () => {
      if (interactTimeoutRef.current) clearTimeout(interactTimeoutRef.current);
      interactTimeoutRef.current = setTimeout(() => {
        userInteractingRef.current = false;
      }, 3000);
    };
    for (const ev of ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'] as const) {
      map.on(ev, onInteractStart);
    }
    for (const ev of ['dragend', 'zoomend', 'rotateend', 'pitchend'] as const) {
      map.on(ev, onInteractEnd);
    }

    // Add route line source/layer after load
    map.on('load', () => {
      map.addSource('route-line', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
      });
      map.addLayer({
        id: 'route-line-layer',
        type: 'line',
        source: 'route-line',
        paint: {
          'line-color': '#ff4444',
          'line-width': 2,
          'line-dasharray': [4, 4],
        },
      });
    });

    return () => {
      if (interactTimeoutRef.current) clearTimeout(interactTimeoutRef.current);
      currentMarkerRef.current?.remove();
      currentMarkerRef.current = null;
      destMarkerRef.current?.remove();
      destMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tilesUrl]);

  // Switch theme when illumination changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tilesUrl || themeRef.current === mapTheme) return;
    themeRef.current = mapTheme;
    map.setStyle(makeStyle(tilesUrl, mapTheme));
    // Re-add route line source/layer after style change
    map.once('style.load', () => {
      if (!map.getSource('route-line')) {
        map.addSource('route-line', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
        });
        map.addLayer({
          id: 'route-line-layer',
          type: 'line',
          source: 'route-line',
          paint: {
            'line-color': '#ff4444',
            'line-width': 2,
            'line-dasharray': [4, 4],
          },
        });
      }
      updateRouteLine();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapTheme, tilesUrl]);

  // Resize map when container changes
  useEffect(() => {
    const container = containerRef.current;
    const map = mapRef.current;
    if (!container || !map) return;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container);
    return () => ro.disconnect();
  }, [tilesUrl]);

  // Update current location marker (tilesUrl dep ensures it runs after map init)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || lat === undefined || lon === undefined) return;

    if (!currentMarkerRef.current) {
      const el = createIconElement('my_location', '#4488ff', 28);
      currentMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lon, lat])
        .addTo(map);
    } else {
      currentMarkerRef.current.setLngLat([lon, lat]);
    }
  }, [lat, lon, tilesUrl]);

  // Initial center on GPS position (once, when map loads)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || lat === undefined || lon === undefined) return;
    if (!map.loaded()) {
      const onLoad = () => map.jumpTo({ center: [lon, lat] });
      map.once('load', onLoad);
      return () => { map.off('load', onLoad); };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tilesUrl]);

  // Update bearing only (heading-up rotates around current map center, not GPS position)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded() || userInteractingRef.current) return;

    if (headingUp && hdg !== undefined) {
      map.jumpTo({ bearing: -hdg });
    } else if (!headingUp) {
      map.jumpTo({ bearing: 0 });
    }
  }, [hdg, headingUp, tilesUrl]);

  // Update destination marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (activeDest) {
      const iconName = activeDest.icon || 'flag';
      if (!destMarkerRef.current) {
        const el = createIconElement(iconName, '#ff4444', 32);
        destMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([activeDest.lon, activeDest.lat])
          .addTo(map);
      } else {
        destMarkerRef.current.setLngLat([activeDest.lon, activeDest.lat]);
        destMarkerRef.current.getElement().textContent = iconName;
      }
    } else {
      destMarkerRef.current?.remove();
      destMarkerRef.current = null;
    }
  }, [activeDest, tilesUrl]);

  // Route line between current location and destination
  const updateRouteLine = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource('route-line') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    if (lat !== undefined && lon !== undefined && activeDest) {
      source.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[lon, lat], [activeDest.lon, activeDest.lat]] },
        properties: {},
      });
    } else {
      source.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [] },
        properties: {},
      });
    }
  }, [lat, lon, activeDest]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.loaded() && map.getSource('route-line')) {
      updateRouteLine();
    }
  }, [updateRouteLine]);

  // Control handlers
  const handleCenterMe = useCallback(() => {
    const map = mapRef.current;
    if (!map || lat === undefined || lon === undefined) return;
    // Cancel interaction pause and resume auto-follow
    userInteractingRef.current = false;
    if (interactTimeoutRef.current) clearTimeout(interactTimeoutRef.current);
    map.easeTo({ center: [lon, lat], zoom: map.getZoom(), duration: 500 });
  }, [lat, lon]);

  const handleFitBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map || lat === undefined || lon === undefined || !activeDest) return;
    const bounds = new maplibregl.LngLatBounds();
    bounds.extend([lon, lat]);
    bounds.extend([activeDest.lon, activeDest.lat]);
    map.fitBounds(bounds, { padding: 60, duration: 500 });
  }, [lat, lon, activeDest]);

  const handleToggleHeading = useCallback(() => {
    setHeadingUp(!headingUp);
  }, [headingUp, setHeadingUp]);

  if (error) {
    return (
      <div className="h-full w-full bg-obd-surface/30 rounded-lg flex items-center justify-center text-gray-500 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full rounded-lg overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />
      {/* Control buttons */}
      <div className="absolute bottom-2 right-2 flex flex-col gap-1 z-10">
        <MapButton icon="near_me" title="Center on current location" onClick={handleCenterMe} />
        {activeDest && (
          <MapButton icon="explore" title="Fit current + destination" onClick={handleFitBounds} />
        )}
        <MapButton
          icon="north"
          title={headingUp ? 'Heading up' : 'North up'}
          onClick={handleToggleHeading}
          active={headingUp}
          iconRotation={headingUp && hdg !== undefined ? -hdg : undefined}
        />
      </div>
    </div>
  );
}

function MapButton({ icon, title, onClick, active, iconRotation }: {
  icon: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  iconRotation?: number;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-8 h-8 rounded flex items-center justify-center shadow-md
        ${active ? 'bg-blue-600 text-white' : 'bg-black/60 text-gray-200 hover:bg-black/80'}`}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: '20px', transform: iconRotation !== undefined ? `rotate(${iconRotation}deg)` : undefined }}
      >{icon}</span>
    </button>
  );
}

export default MapPanel;
