import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { layers, namedTheme } from 'protomaps-themes-base';
import { ensurePmtilesProtocol } from '@/lib/pmtiles-protocol';
import { useAppStore } from '@/stores/useAppStore';
import { useMapStore, Destination, DestinationIcon } from '@/stores/useMapStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { useGpioStore } from '@/stores/useGpioStore';

const DEST_ICONS: DestinationIcon[] = ['home_pin', 'map_pin_heart', 'location_on'];

type MapTheme = 'light' | 'dark';

function makeStyle(tilesUrl: string, theme: MapTheme): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: '/fonts/{fontstack}/{range}.pbf',
    sprite: `/sprites/${theme}`,
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

function DestinationScreen() {
  const { setScreen } = useAppStore();
  const {
    destinations,
    activeDestinationId,
    addDestination,
    removeDestination,
    updateDestination,
    setActiveDestination,
  } = useMapStore();
  const illuminationActive = useGpioStore((s) => s.illuminationActive);
  const mapTheme: MapTheme = illuminationActive ? 'dark' : 'light';

  // GPS position for route line
  const currentValues = useOBDStore((s) => s.currentValues);
  const lat = currentValues['GPS_LAT']?.value;
  const lon = currentValues['GPS_LON']?.value;

  const activeDest = destinations.find((d) => d.id === activeDestinationId) ?? null;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const currentMarkerRef = useRef<maplibregl.Marker | null>(null);
  const destMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [tilesUrl, setTilesUrl] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState<DestinationIcon>('location_on');
  const [destName, setDestName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Download state
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [tilesMounted, setTilesMounted] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState('');
  const [downloadMaxZoom, setDownloadMaxZoom] = useState(14);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Discover tiles + auto-mount tiles USB
  useEffect(() => {
    let cancelled = false;
    window.obd2API.tilesAutoMount().then((res) => {
      if (cancelled) return;
      setTilesMounted(res.success);
    });
    window.obd2API.mapListTiles().then((files) => {
      if (cancelled) return;
      if (files.length > 0) {
        setTilesUrl(`local-tiles://${files[0].path}`);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Download progress listener
  useEffect(() => {
    const cleanup = window.obd2API.onTilesDownloadProgress((message) => {
      setDownloadProgress(message);
    });
    return cleanup;
  }, []);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || !tilesUrl) return;

    ensurePmtilesProtocol();
    const map = new maplibregl.Map({
      container: containerRef.current,
      zoom: 12,
      center: [139.6917, 35.6895],
      style: makeStyle(tilesUrl, mapTheme),
      attributionControl: false,
    });
    mapRef.current = map;

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

  // Resize
  useEffect(() => {
    const container = containerRef.current;
    const map = mapRef.current;
    if (!container || !map) return;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container);
    return () => ro.disconnect();
  }, [tilesUrl]);

  // Current location marker
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

  // Destination marker
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

  // Route line between current location and active destination
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

  // Fly to destination when editing
  const flyTo = useCallback((destLat: number, destLon: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [destLon, destLat], zoom: 14, duration: 500 });
  }, []);

  const getMapCenter = useCallback((): { lat: number; lon: number } | null => {
    const map = mapRef.current;
    if (!map) return null;
    const c = map.getCenter();
    return { lat: c.lat, lon: c.lng };
  }, []);

  const getMapBounds = useCallback((): [number, number, number, number] | null => {
    const map = mapRef.current;
    if (!map) return null;
    const b = map.getBounds();
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  }, []);

  const handleDownload = async () => {
    const bbox = getMapBounds();
    if (!bbox) return;
    setDownloading(true);
    setDownloadError(null);
    setDownloadProgress('Starting download...');
    const result = await window.obd2API.tilesDownload(bbox, downloadMaxZoom);
    setDownloading(false);
    if (result.success) {
      setDownloadProgress('Download complete!');
      // Refresh tiles list (cache-bust to force PMTiles protocol to re-read)
      const files = await window.obd2API.mapListTiles();
      if (files.length > 0) {
        setTilesUrl(`local-tiles://${files[0].path}?t=${Date.now()}`);
      }
    } else {
      setDownloadError(result.error || 'Download failed');
      setDownloadProgress('');
    }
  };

  const handleDownloadCancel = async () => {
    await window.obd2API.tilesDownloadCancel();
    setDownloading(false);
    setDownloadProgress('Cancelled');
  };

  const handleSave = () => {
    const center = getMapCenter();
    if (!center || !destName.trim()) return;

    if (editingId) {
      updateDestination(editingId, {
        name: destName.trim(),
        lat: center.lat,
        lon: center.lon,
        icon: selectedIcon,
      });
      setEditingId(null);
    } else {
      addDestination({
        name: destName.trim(),
        lat: center.lat,
        lon: center.lon,
        icon: selectedIcon,
      });
    }
    setDestName('');
    setSelectedIcon('location_on');
    setFormOpen(false);
  };

  const handleEdit = (dest: Destination) => {
    setEditingId(dest.id);
    setDestName(dest.name);
    setSelectedIcon(dest.icon);
    setFormOpen(true);
    flyTo(dest.lat, dest.lon);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setDestName('');
    setSelectedIcon('location_on');
    setFormOpen(false);
  };

  const handleDelete = (id: string) => {
    removeDestination(id);
    if (editingId === id) {
      handleCancelEdit();
    }
  };

  const handleSelect = (dest: Destination) => {
    setActiveDestination(activeDestinationId === dest.id ? null : dest.id);
  };

  return (
    <div className="h-full flex flex-col bg-obd-dark p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setScreen('menu')}
          className="px-4 py-2 text-obd-primary border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors"
        >
          &larr; Back
        </button>
        <h1 className="text-2xl font-bold text-white">Destination</h1>
        <div className="w-20" />
      </div>

      {/* Content: map left, list right */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left: Map with crosshair */}
        <div className="flex-1 relative rounded-lg overflow-hidden">
          <div ref={containerRef} className="h-full w-full" />
          {/* Crosshair */}
          {mapReady && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative w-24 h-24">
                <div className="absolute top-1/2 left-0 w-full -mt-px" style={{ height: '3px', background: 'linear-gradient(90deg, transparent 0%, rgba(255,70,70,0.9) 30%, transparent 45%, transparent 55%, rgba(255,70,70,0.9) 70%, transparent 100%)' }} />
                <div className="absolute left-1/2 top-0 h-full -ml-px" style={{ width: '3px', background: 'linear-gradient(180deg, transparent 0%, rgba(255,70,70,0.9) 30%, transparent 45%, transparent 55%, rgba(255,70,70,0.9) 70%, transparent 100%)' }} />
                <div className="absolute top-1/2 left-1/2 w-2.5 h-2.5 rounded-full border-2 border-red-400/90" style={{ marginTop: '-5px', marginLeft: '-5px' }} />
              </div>
            </div>
          )}
          {mapReady && <CenterCoords mapRef={mapRef} />}
        </div>

        {/* Right: List + Form */}
        <div className="w-80 flex flex-col gap-3 min-h-0">
          {/* New Destination toggle header */}
          <button
            onClick={() => {
              if (formOpen && editingId) {
                handleCancelEdit();
              } else {
                setFormOpen(!formOpen);
                if (!formOpen) {
                  setEditingId(null);
                  setDestName('');
                  setSelectedIcon('location_on');
                }
              }
            }}
            className="bg-obd-surface rounded-lg px-3 py-2 flex items-center justify-between text-sm font-semibold text-obd-primary hover:bg-obd-dim/30 transition-colors"
          >
            <span>{editingId ? 'Edit Destination' : 'New Destination'}</span>
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
              {formOpen ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {/* Collapsible form */}
          {formOpen && (
            <div className="bg-obd-surface rounded-lg p-3 space-y-3">
              {/* Icon selection */}
              <div className="flex gap-2">
                {DEST_ICONS.map((icon) => (
                  <button
                    key={icon}
                    onClick={() => setSelectedIcon(icon)}
                    className={`w-10 h-10 rounded flex items-center justify-center transition-colors ${
                      selectedIcon === icon
                        ? 'bg-rose-700 text-white'
                        : 'bg-obd-dark text-gray-400 hover:bg-obd-dim/30'
                    }`}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>{icon}</span>
                  </button>
                ))}
              </div>
              {/* Name input */}
              <input
                type="text"
                value={destName}
                onChange={(e) => setDestName(e.target.value)}
                placeholder="Name"
                className="w-full bg-obd-dark rounded px-3 py-2 text-white text-sm border border-obd-dim focus:outline-none focus:border-obd-primary"
              />
              {/* Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={!destName.trim()}
                  className="flex-1 px-3 py-2 bg-rose-700 text-white rounded text-sm hover:bg-rose-600 disabled:opacity-50 transition-colors"
                >
                  {editingId ? 'Update' : 'Save'}
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-2 bg-obd-dark text-obd-dim border border-obd-dim rounded text-sm hover:bg-obd-dim/30 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Destination list */}
          <div className="flex-1 overflow-auto space-y-1">
            {destinations.length === 0 && (
              <p className="text-sm text-obd-dim py-4 text-center">No destinations</p>
            )}
            {destinations.map((dest) => {
              const isActive = activeDestinationId === dest.id;
              const isEditing = editingId === dest.id;
              return (
                <div
                  key={dest.id}
                  className={`rounded p-2 flex items-center gap-2 ${
                    isEditing
                      ? 'bg-rose-900/30 border border-rose-700'
                      : isActive
                        ? 'bg-green-900/30 border border-green-700'
                        : 'bg-obd-surface'
                  }`}
                >
                  <button
                    onClick={() => handleSelect(dest)}
                    className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${
                      isActive ? 'text-green-400' : 'text-gray-500 hover:text-gray-300'
                    }`}
                    title={isActive ? 'Deactivate' : 'Set as destination'}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                      {isActive ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                  </button>
                  <span className="material-symbols-outlined text-rose-400 shrink-0" style={{ fontSize: '20px' }}>
                    {dest.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{dest.name}</div>
                    <div className="text-xs text-obd-dim">
                      {dest.lat.toFixed(4)}, {dest.lon.toFixed(4)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleEdit(dest)}
                    className="w-7 h-7 rounded flex items-center justify-center text-gray-500 hover:text-white shrink-0"
                    title="Edit"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span>
                  </button>
                  <button
                    onClick={() => handleDelete(dest.id)}
                    className="w-7 h-7 rounded flex items-center justify-center text-gray-500 hover:text-red-400 shrink-0"
                    title="Delete"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Download Tiles toggle */}
          <button
            onClick={() => setDownloadOpen(!downloadOpen)}
            className="bg-obd-surface rounded-lg px-3 py-2 flex items-center justify-between text-sm font-semibold text-obd-primary hover:bg-obd-dim/30 transition-colors"
          >
            <span>Download Tiles</span>
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
              {downloadOpen ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {downloadOpen && (
            <div className="bg-obd-surface rounded-lg p-3 space-y-2">
              {!tilesMounted && (
                <p className="text-xs text-yellow-400">No USB with tiles/ folder found. Insert a USB drive with a tiles/ folder.</p>
              )}
              {/* Max zoom */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-obd-dim">Max Zoom:</label>
                <select
                  value={downloadMaxZoom}
                  onChange={(e) => setDownloadMaxZoom(Number(e.target.value))}
                  disabled={downloading}
                  className="bg-obd-dark text-white text-sm rounded px-2 py-1 border border-obd-dim"
                >
                  {[10, 11, 12, 13, 14, 15].map((z) => (
                    <option key={z} value={z}>z{z}</option>
                  ))}
                </select>
                <span className="text-xs text-obd-dim flex-1">Visible area will be downloaded</span>
              </div>
              {/* Buttons */}
              <div className="flex gap-2">
                {!downloading ? (
                  <button
                    onClick={handleDownload}
                    disabled={!tilesMounted}
                    className="flex-1 px-3 py-2 bg-blue-700 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span>
                    Download
                  </button>
                ) : (
                  <button
                    onClick={handleDownloadCancel}
                    className="flex-1 px-3 py-2 bg-red-700 text-white rounded text-sm hover:bg-red-600 transition-colors flex items-center justify-center gap-1"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>cancel</span>
                    Cancel
                  </button>
                )}
              </div>
              {/* Progress */}
              {downloadProgress && (
                <p className="text-xs text-gray-300 font-mono break-all">{downloadProgress}</p>
              )}
              {downloadError && (
                <p className="text-xs text-red-400">{downloadError}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CenterCoords({ mapRef }: { mapRef: React.RefObject<maplibregl.Map | null> }) {
  const [coords, setCoords] = useState('');

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = () => {
      const c = map.getCenter();
      setCoords(`${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`);
    };
    update();
    map.on('move', update);
    return () => { map.off('move', update); };
  }, [mapRef]);

  return (
    <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded font-mono z-10">
      {coords}
    </div>
  );
}

export default DestinationScreen;
