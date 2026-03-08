import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { layers, namedTheme } from 'protomaps-themes-base';
import { ensurePmtilesProtocol } from '@/lib/pmtiles-protocol';
import { useOBDStore } from '@/stores/useOBDStore';
import { useGpioStore } from '@/stores/useGpioStore';
import { useMapStore } from '@/stores/useMapStore';
import compassImg from '@/assets/compass.png';
import directionImg from '@/assets/direction.png';

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

function createImageElement(src: string, size: number): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = `width:${size}px;height:${size}px;pointer-events:none;`;
  const img = document.createElement('img');
  img.src = src;
  img.style.cssText = 'width:100%;height:100%;';
  el.appendChild(img);
  return el;
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

/** Jump to follow GPS position. Heading-up places GPS at 3/4 from top.
 *  Sets programmaticMoveRef to prevent interaction handler from firing. */
function jumpToFollow(
  map: maplibregl.Map, lon: number, lat: number, isHeadingUp: boolean,
  hdg: number | undefined, programmaticMoveRef: React.MutableRefObject<boolean>,
) {
  programmaticMoveRef.current = true;
  if (isHeadingUp) {
    const bearing = hdg !== undefined ? hdg : 0;
    map.jumpTo({ center: [lon, lat], bearing });
    const h = map.getContainer().clientHeight;
    const w = map.getContainer().clientWidth;
    const offsetCenter = map.unproject(new maplibregl.Point(w / 2, h * 0.25));
    map.jumpTo({ center: offsetCenter, bearing });
  } else {
    map.jumpTo({ center: [lon, lat], bearing: 0 });
  }
  // Reset after current microtask (events fire synchronously from jumpTo)
  Promise.resolve().then(() => { programmaticMoveRef.current = false; });
}

function MapPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const currentMarkerRef = useRef<maplibregl.Marker | null>(null);
  const destMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [tilesUrl, setTilesUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [fps, setFps] = useState(0);
  const themeRef = useRef<MapTheme>('dark');
  const followingRef = useRef(true); // true = auto-follow GPS, false = user took control
  const programmaticMoveRef = useRef(false); // true during our own jumpTo calls

  // Store state
  const illuminationActive = useGpioStore((s) => s.illuminationActive);
  const headingUp = useMapStore((s) => s.headingUp);
  const setHeadingUp = useMapStore((s) => s.setHeadingUp);
  const activeDestinationId = useMapStore((s) => s.activeDestinationId);
  const destinations = useMapStore((s) => s.destinations);
  const setActiveDestination = useMapStore((s) => s.setActiveDestination);
  const activeDest = destinations.find((d) => d.id === activeDestinationId) ?? null;

  // GPS values
  const currentValues = useOBDStore((s) => s.currentValues);
  const lat = currentValues['GPS_LAT']?.value;
  const lon = currentValues['GPS_LON']?.value;
  const hdg = currentValues['GPS_HDG']?.value;

  // Determine map theme from illumination (ON = night = dark)
  const mapTheme: MapTheme = illuminationActive ? 'dark' : 'light';

  // Auto-mount tiles USB, then discover available PMTiles files
  useEffect(() => {
    let cancelled = false;
    window.obd2API.tilesAutoMount().then(() => {
      if (cancelled) return;
      window.obd2API.mapListTiles().then((files) => {
        if (cancelled) return;
        if (files.length > 0) {
          setTilesUrl(`local-tiles://${files[0].path}`);
        } else {
          setError('No .pmtiles files found');
        }
      });
    });
    return () => { cancelled = true; };
  }, []);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || !tilesUrl) return;

    ensurePmtilesProtocol();
    themeRef.current = mapTheme;
    followingRef.current = true;
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

    // Pause auto-follow on user interaction (stays paused until "near me")
    const onInteractStart = () => {
      if (programmaticMoveRef.current) return; // ignore events from our own jumpTo
      followingRef.current = false;
    };
    for (const ev of ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'] as const) {
      map.on(ev, onInteractStart);
    }

    // Add route line source/layer after style loads
    map.once('style.load', () => {
      map.addSource('route-line', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'route-line-layer',
        type: 'line',
        source: 'route-line',
        paint: {
          'line-color': '#ff4444',
          'line-width': 3,
          'line-dasharray': [6, 4],
        },
      });
      map.resize();
      setMapReady(true);
    });

    return () => {
      currentMarkerRef.current?.remove();
      currentMarkerRef.current = null;
      destMarkerRef.current?.remove();
      destMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tilesUrl]);

  // Switch theme when illumination changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tilesUrl || themeRef.current === mapTheme) return;
    themeRef.current = mapTheme;
    setMapReady(false);
    map.setStyle(makeStyle(tilesUrl, mapTheme));
    map.once('style.load', () => {
      if (!map.getSource('route-line')) {
        map.addSource('route-line', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: 'route-line-layer',
          type: 'line',
          source: 'route-line',
          paint: {
            'line-color': '#00ff00',
            'line-width': 5,
          },
        });
      }
      setMapReady(true);
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

  // FPS counter
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let frameCount = 0;
    const onRender = () => { frameCount++; };
    map.on('render', onRender);
    const interval = setInterval(() => {
      setFps(frameCount);
      frameCount = 0;
    }, 1000);
    return () => {
      map.off('render', onRender);
      clearInterval(interval);
    };
  }, [tilesUrl]);

  // Update current location marker with direction.png
  useEffect(() => {
    const map = mapRef.current;
    if (!map || lat === undefined || lon === undefined) return;

    if (!currentMarkerRef.current) {
      const el = createImageElement(directionImg, 40);
      currentMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center', rotationAlignment: 'viewport' })
        .setLngLat([lon, lat])
        .addTo(map);
    } else {
      currentMarkerRef.current.setLngLat([lon, lat]);
    }
  }, [lat, lon, tilesUrl]);

  // Rotate direction marker to match heading
  useEffect(() => {
    if (!currentMarkerRef.current) return;
    // In heading-up mode the map rotates, so marker rotation = 0 (always points up = forward)
    // In north-up mode, rotate marker by heading so it points in travel direction
    const rotation = headingUp ? 0 : (hdg ?? 0);
    currentMarkerRef.current.setRotation(rotation);
  }, [hdg, headingUp]);

  // GPS follow: scroll + rotate when following
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || lat === undefined || lon === undefined) return;
    if (!followingRef.current) return;

    jumpToFollow(map, lon, lat, headingUp, hdg, programmaticMoveRef);
  }, [lat, lon, hdg, headingUp, mapReady]);

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
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
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
        type: 'FeatureCollection',
        features: [],
      });
    }
  }, [lat, lon, activeDest, mapReady]);

  // Control handlers
  const handleCenterMe = useCallback(() => {
    const map = mapRef.current;
    if (!map || lat === undefined || lon === undefined) return;
    followingRef.current = true;
    jumpToFollow(map, lon, lat, headingUp, hdg, programmaticMoveRef);
  }, [lat, lon, hdg, headingUp]);

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

  const handleZoomIn = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    programmaticMoveRef.current = true;
    map.zoomIn();
    Promise.resolve().then(() => { programmaticMoveRef.current = false; });
  }, []);

  const handleZoomOut = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    programmaticMoveRef.current = true;
    map.zoomOut();
    Promise.resolve().then(() => { programmaticMoveRef.current = false; });
  }, []);

  const handleCycleDestination = useCallback(() => {
    if (destinations.length === 0) return;
    if (!activeDestinationId) {
      setActiveDestination(destinations[0].id);
    } else {
      const idx = destinations.findIndex((d) => d.id === activeDestinationId);
      const nextIdx = (idx + 1) % (destinations.length + 1);
      setActiveDestination(nextIdx < destinations.length ? destinations[nextIdx].id : null);
    }
  }, [destinations, activeDestinationId, setActiveDestination]);

  // Compass rotation: in heading-up mode, rotate compass to show north direction
  const compassRotation = headingUp && hdg !== undefined ? -hdg : 0;

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
      {/* FPS */}
      <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded font-mono z-10">
        {fps} FPS
      </div>
      {/* Top center: compass button (heading up / north up toggle) */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
        <button
          onClick={handleToggleHeading}
          title={headingUp ? 'Heading up' : 'North up'}
          className="w-14 h-14 rounded-full bg-black/50 flex items-center justify-center shadow-md"
        >
          <img
            src={compassImg}
            alt="compass"
            className="w-10 h-10 transition-transform duration-200"
            style={{ transform: `rotate(${compassRotation}deg)` }}
          />
        </button>
      </div>
      {/* Top right: zoom buttons */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
        <MapButton icon="zoom_in" title="Zoom in" onClick={handleZoomIn} />
        <MapButton icon="zoom_out" title="Zoom out" onClick={handleZoomOut} />
      </div>
      {/* Left bottom: destination selector + distance */}
      <div className="absolute bottom-2 left-2 flex flex-col items-start gap-1 z-10">
        {destinations.length > 0 && (
          <MapButton
            icon={activeDest?.icon || 'pin_drop'}
            title={activeDest ? activeDest.name : 'Select destination'}
            onClick={handleCycleDestination}
            active={!!activeDest}
          />
        )}
        {activeDest && (
          <div className="bg-black/60 text-white text-sm px-2 py-1 rounded">
            <div className="truncate max-w-[200px]">{activeDest.name}</div>
            {lat !== undefined && lon !== undefined && (
              <div className="font-mono">{formatDistance(haversineDistance(lat, lon, activeDest.lat, activeDest.lon))}</div>
            )}
          </div>
        )}
      </div>
      {/* Right bottom: control buttons */}
      <div className="absolute bottom-2 right-2 flex flex-col gap-1 z-10">
        <MapButton icon="near_me" title="Center on current location" onClick={handleCenterMe} />
        {activeDest && (
          <MapButton icon="explore" title="Fit current + destination" onClick={handleFitBounds} />
        )}
      </div>
    </div>
  );
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  const km = meters / 1000;
  if (km < 100) return `${km.toPrecision(2)} km`;
  return `${Math.round(km)} km`;
}

function MapButton({ icon, title, onClick, active }: {
  icon: string;
  title: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-12 h-12 rounded flex items-center justify-center shadow-md
        ${active ? 'bg-blue-600 text-white' : 'bg-black/60 text-gray-200 hover:bg-black/80'}`}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: '30px' }}
      >{icon}</span>
    </button>
  );
}

export default MapPanel;
