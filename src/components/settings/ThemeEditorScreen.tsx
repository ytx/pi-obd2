import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { ThemeInfo, ThemeAssets, PanelKind, MeterType } from '@/types';
import { propertiesToMeterConfig, propertiesToNumericConfig, propertiesToGraphConfig, toTorquePid } from '@/canvas/theme-parser';
import { renderMeter } from '@/canvas/meter-renderer';
import { renderGraph } from '@/canvas/graph-renderer';
import { fillTextMono } from '@/canvas/mono-text';
import { TimePoint } from '@/canvas/time-buffer';

// --- Property group definitions ---

interface PropertyDef {
  key: string;
  label: string;
  type: 'number' | 'color' | 'boolean' | 'text';
  min?: number;
  max?: number;
  step?: number;
  pidSpecific?: boolean;
  pidKeyTemplate?: string;
  pidOnly?: boolean; // only show when a PID is selected
}

interface PropertyGroup {
  name: string;
  properties: PropertyDef[];
}

const PROPERTY_GROUPS: PropertyGroup[] = [
  { name: 'Title', properties: [
    { key: '', label: 'Rename Title', type: 'text', pidSpecific: true, pidOnly: true, pidKeyTemplate: 'renameTitle_${pid}' },
  ]},
  { name: 'Angles', properties: [
    { key: 'globalDialStartAngle', label: 'Start Angle', type: 'number', min: 0, max: 180, pidSpecific: true, pidKeyTemplate: 'dialStartAngle_${pid}' },
    { key: 'globalDialStopAngle', label: 'Stop Angle', type: 'number', min: 0, max: 180, pidSpecific: true, pidKeyTemplate: 'dialStopAngle_${pid}' },
  ]},
  { name: 'Ticks', properties: [
    { key: 'globalHideTicks', label: 'Hide', type: 'boolean', pidSpecific: true, pidKeyTemplate: 'hideTicks_${pid}' },
    { key: 'dialTickInnerRadius', label: 'Inner R', type: 'number', min: 0, max: 3, step: 0.05 },
    { key: 'dialTickOuterRadius', label: 'Outer R', type: 'number', min: 0, max: 3, step: 0.05 },
  ]},
  { name: 'Scale Text', properties: [
    { key: 'globalTextRadius', label: 'Text Radius', type: 'number', min: 0, max: 2, step: 0.05, pidSpecific: true, pidKeyTemplate: 'textRadius_${pid}' },
  ]},
  { name: 'Needle (dialNeedle)', properties: [
    { key: 'dialNeedleLength', label: 'Length', type: 'number', min: 0, max: 3, step: 0.05 },
    { key: 'dialNeedleSizeRatio', label: 'Width', type: 'number', min: 0.01, max: 0.2, step: 0.005 },
    { key: 'dialNeedleColour', label: 'Color', type: 'color' },
    { key: 'dialNeedleValueFontScale', label: 'Value Font', type: 'number', min: 0.3, max: 3, step: 0.1 },
    { key: 'dialNeedleTitleTextOffset', label: 'Title Offset', type: 'number', min: -1, max: 1, step: 0.05 },
    { key: 'dialNeedleValueTextOffset', label: 'Value Offset', type: 'number', min: -1, max: 1, step: 0.05 },
    { key: 'dialNeedleUnitTextOffset', label: 'Unit Offset', type: 'number', min: -1, max: 1, step: 0.05 },
  ]},
  { name: 'Arc (dialMeter)', properties: [
    { key: 'dialMeterValueOuterRadius', label: 'Outer R', type: 'number', min: 0, max: 3, step: 0.05 },
    { key: 'dialMeterValueThickness', label: 'Thickness', type: 'number', min: 0, max: 2, step: 0.05 },
    { key: 'dialMeterValueFontScale', label: 'Value Font', type: 'number', min: 0.3, max: 3, step: 0.1 },
    { key: 'dialMeterTitleTextOffset', label: 'Title Offset', type: 'number', min: -1, max: 1, step: 0.05 },
    { key: 'dialMeterValueTextOffset', label: 'Value Offset', type: 'number', min: -1, max: 1, step: 0.05 },
    { key: 'dialMeterUnitTextOffset', label: 'Unit Offset', type: 'number', min: -1, max: 1, step: 0.05 },
  ]},
  { name: 'Colors', properties: [
    { key: 'displayTextValueColour', label: 'Value', type: 'color' },
    { key: 'displayTextTitleColour', label: 'Title', type: 'color' },
    { key: 'displayTickColour', label: 'Tick', type: 'color' },
    { key: 'displayIndicatorColour', label: 'Indicator', type: 'color' },
    { key: 'graphLineColour', label: 'Graph Line', type: 'color', pidSpecific: true, pidKeyTemplate: 'graphLineColour_${pid}' },
  ]},
  { name: 'Font', properties: [
    { key: 'globalFontScale', label: 'Scale', type: 'number', min: 0.3, max: 2, step: 0.1 },
  ]},
];

// --- Asset definitions ---

interface AssetDef {
  name: string;
  label: string;
  mime: string;
  filters: { name: string; extensions: string[] }[];
}

const ASSET_DEFS: AssetDef[] = [
  { name: 'dial_background.png', label: 'Dial Background', mime: 'image/png', filters: [{ name: 'PNG', extensions: ['png'] }] },
  { name: 'display_background.png', label: 'Display Background', mime: 'image/png', filters: [{ name: 'PNG', extensions: ['png'] }] },
  { name: 'background.jpg', label: 'Background', mime: 'image/jpeg', filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }] },
  { name: 'needle.png', label: 'Needle', mime: 'image/png', filters: [{ name: 'PNG', extensions: ['png'] }] },
  { name: 'font.ttf', label: 'Font', mime: 'font', filters: [{ name: 'Fonts', extensions: ['ttf', 'otf'] }] },
  { name: 'screenshot.png', label: 'Screenshot', mime: 'image/png', filters: [{ name: 'PNG', extensions: ['png'] }] },
];

// --- PID options for preview ---
const PID_OPTIONS = [
  { id: '', label: 'Global' },
  { id: '010C', label: 'RPM (010C)' },
  { id: '010D', label: 'Speed (010D)' },
  { id: '0105', label: 'Coolant (0105)' },
  { id: '0104', label: 'Load (0104)' },
  { id: '0111', label: 'Throttle (0111)' },
];

// --- Generate preview graph data ---
function generatePreviewPoints(center: number, min: number, max: number): TimePoint[] {
  const now = Date.now();
  const count = 100;
  return Array.from({ length: count }, (_, i) => ({
    timestamp: now - (count - 1 - i) * 300,
    value: center + (max - min) * 0.3 * Math.sin(i * 0.15),
  }));
}

// --- Resolve property key for PID (uses Torque lowercase hex format) ---
function getPropertyKey(def: PropertyDef, pid: string): string {
  if (pid && def.pidSpecific && def.pidKeyTemplate) {
    return def.pidKeyTemplate.replace('${pid}', toTorquePid(pid));
  }
  return def.key;
}

// --- Color helpers ---
function normalizeColorForInput(val: string): string {
  if (!val) return '#ffffff';
  const hex = val.replace('#', '');
  if (hex.length === 8) {
    // #RRGGBBAA → #RRGGBB for input
    return '#' + hex.substring(0, 6);
  }
  if (hex.length === 6) return '#' + hex;
  return '#ffffff';
}

// --- Inline dialog types ---
type DialogState =
  | null
  | { type: 'prompt'; title: string; defaultValue: string; onOk: (value: string) => void }
  | { type: 'confirm'; message: string; onOk: () => void };

// --- ThemeEditorScreen ---
function ThemeEditorScreen() {
  const { setScreen } = useAppStore();
  const api = window.obd2API;

  // Inline dialog
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dialogInput, setDialogInput] = useState('');

  // Theme list & selection
  const [themes, setThemes] = useState<ThemeInfo[]>([]);
  const [selectedThemeId, setSelectedThemeId] = useState<string>('');

  // Properties (working copy & saved snapshot)
  const [properties, setProperties] = useState<Record<string, string>>({});
  const [savedProperties, setSavedProperties] = useState<Record<string, string>>({});

  // Assets
  const [assets, setAssets] = useState<ThemeAssets>({});
  const [assetExists, setAssetExists] = useState<Record<string, boolean>>({});

  // Pending asset changes (staged until Save)
  const [pendingAdds, setPendingAdds] = useState<Map<string, string>>(new Map());
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());

  // Preview settings (meter-needle and meter-arc share PanelKind 'meter' but differ in MeterType)
  type PreviewKind = PanelKind | 'meter-arc';
  const [previewKind, setPreviewKind] = useState<PreviewKind>('meter');
  const [previewPid, setPreviewPid] = useState('');
  const [previewValue, setPreviewValue] = useState(50);
  const [previewTitle, setPreviewTitle] = useState('RPM');
  const [previewMin, setPreviewMin] = useState(0);
  const [previewMax, setPreviewMax] = useState(8000);
  const [previewUnit, setPreviewUnit] = useState('rpm');
  const [previewDecimals, setPreviewDecimals] = useState(0);
  const [previewTicks, setPreviewTicks] = useState(20);

  // Editor font state
  const [editorFontLoaded, setEditorFontLoaded] = useState(false);

  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 300, height: 300 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Dirty detection
  const isDirty = useMemo(
    () => JSON.stringify(properties) !== JSON.stringify(savedProperties)
        || pendingAdds.size > 0
        || pendingDeletes.size > 0,
    [properties, savedProperties, pendingAdds, pendingDeletes],
  );

  // --- Load theme list ---
  const loadThemes = useCallback(async () => {
    if (!api) return;
    const list = await api.themeList();
    setThemes(list);
  }, [api]);

  useEffect(() => { loadThemes(); }, [loadThemes]);

  // --- Load theme data when selected ---
  const loadThemeData = useCallback(async (themeId: string) => {
    if (!api || !themeId) return;
    const data = await api.themeLoad(themeId) as {
      properties: Record<string, string>;
      assets: ThemeAssets;
    } | null;
    if (data) {
      setProperties({ ...data.properties });
      setSavedProperties({ ...data.properties });
      setAssets(data.assets);
      // Detect which assets exist
      const exists: Record<string, boolean> = {};
      exists['dial_background.png'] = !!data.assets.dialBackground;
      exists['display_background.png'] = !!data.assets.displayBackground;
      exists['background.jpg'] = !!data.assets.background;
      exists['needle.png'] = !!data.assets.needle;
      exists['font.ttf'] = !!data.assets.fontBase64;
      exists['screenshot.png'] = !!themes.find(t => t.id === themeId)?.screenshotBase64;
      setAssetExists(exists);

      // Load editor font if available
      setEditorFontLoaded(false);
      if (data.assets.fontBase64) {
        const fontUrl = `data:font/ttf;base64,${data.assets.fontBase64}`;
        const face = new FontFace('ThemeEditorFont', `url(${fontUrl})`);
        face.load().then((loaded) => {
          document.fonts.add(loaded);
          setEditorFontLoaded(true);
        }).catch(() => {
          setEditorFontLoaded(false);
        });
      }
    }
  }, [api, themes]);

  useEffect(() => {
    if (selectedThemeId) {
      loadThemeData(selectedThemeId);
    }
  }, [selectedThemeId, loadThemeData]);

  // --- Canvas resize ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // --- Image loading ---
  const [dialBgImg, setDialBgImg] = useState<HTMLImageElement | null>(null);
  const [displayBgImg, setDisplayBgImg] = useState<HTMLImageElement | null>(null);
  const [needleImg, setNeedleImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (assets.dialBackground) {
      const img = new Image();
      img.onload = () => setDialBgImg(img);
      img.src = assets.dialBackground;
    } else {
      setDialBgImg(null);
    }
  }, [assets.dialBackground]);

  useEffect(() => {
    if (assets.displayBackground) {
      const img = new Image();
      img.onload = () => setDisplayBgImg(img);
      img.src = assets.displayBackground;
    } else {
      setDisplayBgImg(null);
    }
  }, [assets.displayBackground]);

  useEffect(() => {
    if (assets.needle) {
      const img = new Image();
      img.onload = () => setNeedleImg(img);
      img.src = assets.needle;
    } else {
      setNeedleImg(null);
    }
  }, [assets.needle]);

  // --- Derive configs from properties ---
  const previewMeterType: MeterType = previewKind === 'meter-arc' ? 'arc' : 'needle';
  const meterConfig = useMemo(
    () => propertiesToMeterConfig(properties, previewPid || undefined, previewMeterType),
    [properties, previewPid, previewMeterType],
  );
  const numericConfig = useMemo(
    () => propertiesToNumericConfig(properties),
    [properties],
  );
  const graphConfig = useMemo(
    () => propertiesToGraphConfig(properties, previewPid || undefined),
    [properties, previewPid],
  );

  // --- Preview points for graph ---
  const graphPoints = useMemo(
    () => generatePreviewPoints((previewMin + previewMax) / 2, previewMin, previewMax),
    [previewMin, previewMax],
  );

  // --- Canvas rendering ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedThemeId) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.width * dpr;
    canvas.height = canvasSize.height * dpr;
    ctx.scale(dpr, dpr);

    const fontFamily = (editorFontLoaded && assets.fontBase64) ? 'ThemeEditorFont' : 'sans-serif';
    const currentValue = previewMin + (previewMax - previewMin) * (previewValue / 100);

    if (previewKind === 'meter' || previewKind === 'meter-arc') {
      const config = { ...meterConfig, tickCount: previewTicks };
      renderMeter({
        ctx,
        width: canvasSize.width,
        height: canvasSize.height,
        value: currentValue,
        min: previewMin,
        max: previewMax,
        title: previewTitle,
        unit: previewUnit,
        config,
        backgroundImage: dialBgImg,
        needleImage: previewKind === 'meter' ? needleImg : null,
        fontFamily,
        decimals: previewDecimals,
      });
    } else if (previewKind === 'graph') {
      renderGraph({
        ctx,
        width: canvasSize.width,
        height: canvasSize.height,
        points: graphPoints,
        min: previewMin,
        max: previewMax,
        title: previewTitle,
        unit: previewUnit,
        config: graphConfig,
        backgroundImage: displayBgImg,
      });
    } else {
      // Numeric preview
      ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
      if (displayBgImg) {
        ctx.drawImage(displayBgImg, 0, 0, canvasSize.width, canvasSize.height);
      }
      const cw = canvasSize.width;
      const ch = canvasSize.height;
      const fontSize = Math.min(cw, ch) * 0.25;

      // Title
      ctx.fillStyle = numericConfig.titleColor;
      ctx.font = `${Math.round(fontSize * 0.4)}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(previewTitle, cw / 2, ch * 0.2);

      // Value
      ctx.fillStyle = numericConfig.valueColor;
      ctx.font = `bold ${Math.round(fontSize)}px ${fontFamily}`;
      const valueText = currentValue.toFixed(previewDecimals);
      fillTextMono(ctx, valueText, cw / 2, ch * 0.5, 'center');

      // Unit
      ctx.fillStyle = numericConfig.unitColor;
      ctx.font = `${Math.round(fontSize * 0.35)}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(previewUnit, cw / 2, ch * 0.78);
    }
  }, [
    canvasSize, selectedThemeId, previewKind, previewPid, previewValue,
    previewTitle, previewMin, previewMax, previewUnit, previewDecimals, previewTicks,
    meterConfig, numericConfig, graphConfig, graphPoints,
    dialBgImg, displayBgImg, needleImg, assets.fontBase64, editorFontLoaded,
  ]);

  // --- Property change handler ---
  const setProp = useCallback((key: string, value: string) => {
    setProperties(prev => {
      if (value === '') {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  }, []);

  // --- Dialog helpers (promise-based, resolved via ref) ---
  const dialogResolveRef = useRef<((v: unknown) => void) | null>(null);

  const showPromptAsync = (title: string, defaultValue: string): Promise<string | null> => {
    return new Promise((resolve) => {
      setDialogInput(defaultValue);
      dialogResolveRef.current = resolve as (v: unknown) => void;
      setDialog({
        type: 'prompt',
        title,
        defaultValue,
        onOk: (value: string) => { setDialog(null); dialogResolveRef.current = null; resolve(value); },
      });
    });
  };

  const showConfirmAsync = (message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      dialogResolveRef.current = resolve as (v: unknown) => void;
      setDialog({
        type: 'confirm',
        message,
        onOk: () => { setDialog(null); dialogResolveRef.current = null; resolve(true); },
      });
    });
  };

  const handleDialogCancel = () => {
    setDialog(null);
    if (dialogResolveRef.current) {
      // For prompt: null, for confirm: false
      dialogResolveRef.current(dialog?.type === 'confirm' ? false : null);
      dialogResolveRef.current = null;
    }
  };

  // --- Theme CRUD ---
  const handleSave = async () => {
    if (!api || !selectedThemeId) return;
    // 1. Save properties
    const result = await api.themeSaveProperties(selectedThemeId, properties);
    if (!result.success) return;
    // 2. Write pending asset additions
    for (const [name, base64] of pendingAdds) {
      await api.themeWriteAsset(selectedThemeId, name, base64);
    }
    // 3. Execute pending asset deletions
    for (const name of pendingDeletes) {
      await api.themeDeleteAsset(selectedThemeId, name);
    }
    // 4. Clear staging & reload
    setPendingAdds(new Map());
    setPendingDeletes(new Set());
    setSavedProperties({ ...properties });
    await loadThemeData(selectedThemeId);
  };

  const handleCreate = async () => {
    if (!api) return;
    const name = await showPromptAsync('New theme name:', '');
    if (!name) return;
    const result = await api.themeCreate(name);
    if (result.success) {
      await loadThemes();
      setSelectedThemeId(name);
    }
  };

  const handleDuplicate = async () => {
    if (!selectedThemeId || !api) return;
    const name = await showPromptAsync('Duplicate name:', selectedThemeId + '-copy');
    if (!name) return;
    const result = await api.themeDuplicate(selectedThemeId, name);
    if (result.success) {
      await loadThemes();
      setSelectedThemeId(name);
    }
  };

  const handleRename = async () => {
    if (!selectedThemeId || !api) return;
    const currentName = themes.find(t => t.id === selectedThemeId)?.name ?? selectedThemeId;
    const newName = await showPromptAsync('Rename to:', currentName);
    if (!newName || newName === currentName) return;
    const result = await api.themeRename(selectedThemeId, newName);
    if (result.success) {
      await loadThemes();
      const isUsb = selectedThemeId.startsWith('usb:');
      setSelectedThemeId(isUsb ? `usb:${newName}` : newName);
    }
  };

  const handleDelete = async () => {
    if (!selectedThemeId || !api) return;
    const ok = await showConfirmAsync(`Delete theme "${selectedThemeId}"?`);
    if (!ok) return;
    const result = await api.themeDelete(selectedThemeId);
    if (result.success) {
      setSelectedThemeId('');
      setProperties({});
      setSavedProperties({});
      setAssets({});
      setPendingAdds(new Map());
      setPendingDeletes(new Set());
      await loadThemes();
    }
  };

  // --- Theme selection with dirty check ---
  const handleThemeSelect = async (themeId: string) => {
    if (isDirty) {
      const ok = await showConfirmAsync('Unsaved changes will be lost. Continue?');
      if (!ok) return;
    }
    setPendingAdds(new Map());
    setPendingDeletes(new Set());
    setSelectedThemeId(themeId);
  };

  // --- Back with dirty check ---
  const handleBack = async () => {
    if (isDirty) {
      const ok = await showConfirmAsync('Unsaved changes will be lost. Continue?');
      if (!ok) return;
    }
    setScreen('menu');
  };

  // --- Asset handlers (stage in memory, write on Save) ---
  const ASSET_KEY_MAP: Record<string, keyof ThemeAssets> = {
    'dial_background.png': 'dialBackground',
    'display_background.png': 'displayBackground',
    'background.jpg': 'background',
    'needle.png': 'needle',
    'font.ttf': 'fontBase64',
  };

  const handleAddAsset = async (assetDef: AssetDef) => {
    if (!api || !selectedThemeId) return;
    const pickResult = await api.themePickFile(assetDef.filters);
    if (!pickResult.success || !pickResult.filePath) return;
    const base64 = await api.themeReadFile(pickResult.filePath, assetDef.mime);
    if (!base64) return;
    // Stage the addition
    setPendingAdds(prev => new Map(prev).set(assetDef.name, base64));
    setPendingDeletes(prev => { const next = new Set(prev); next.delete(assetDef.name); return next; });
    // Update preview immediately
    const assetKey = ASSET_KEY_MAP[assetDef.name];
    if (assetKey) {
      setAssets(prev => ({ ...prev, [assetKey]: base64 }));
    }
    setAssetExists(prev => ({ ...prev, [assetDef.name]: true }));
    // Reload editor font if font was added
    if (assetDef.name === 'font.ttf') {
      setEditorFontLoaded(false);
      const fontUrl = `data:font/ttf;base64,${base64}`;
      const face = new FontFace('ThemeEditorFont', `url(${fontUrl})`);
      face.load().then((loaded) => {
        document.fonts.add(loaded);
        setEditorFontLoaded(true);
      }).catch(() => setEditorFontLoaded(false));
    }
  };

  const handleDeleteAsset = async (assetDef: AssetDef) => {
    if (!api || !selectedThemeId) return;
    const ok = await showConfirmAsync(`Delete ${assetDef.label}?`);
    if (!ok) return;
    // Stage the deletion
    setPendingDeletes(prev => new Set(prev).add(assetDef.name));
    setPendingAdds(prev => { const next = new Map(prev); next.delete(assetDef.name); return next; });
    // Update preview immediately
    const assetKey = ASSET_KEY_MAP[assetDef.name];
    if (assetKey) {
      setAssets(prev => ({ ...prev, [assetKey]: undefined }));
    }
    setAssetExists(prev => ({ ...prev, [assetDef.name]: false }));
  };

  return (
    <div className="h-full bg-obd-dark text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-obd-surface border-b border-obd-dim/30">
        <button onClick={handleBack} className="text-obd-accent hover:text-white">
          &larr; Back
        </button>
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold">Theme Editor</span>
          {isDirty && <span className="text-amber-400 text-sm">&#9679; Unsaved</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCreate} className="px-3 py-1 rounded bg-obd-surface hover:bg-obd-dim/30 border border-obd-dim/30 text-sm">New</button>
          <button
            onClick={handleSave}
            disabled={!isDirty || !selectedThemeId}
            className="px-4 py-1 rounded bg-obd-accent text-black font-semibold disabled:opacity-30"
          >
            Save
          </button>
        </div>
      </div>

      {/* Main content: left preview + right form */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Preview */}
        <div className="w-1/2 flex flex-col p-3 gap-2 overflow-y-auto">
          {/* Theme selector + CRUD buttons */}
          <div className="flex gap-2 items-center">
            <select
              value={selectedThemeId}
              onChange={(e) => handleThemeSelect(e.target.value)}
              className="bg-obd-surface border border-obd-dim/30 rounded px-2 py-1 text-sm flex-1 min-w-0"
            >
              <option value="">-- Select Theme --</option>
              {themes.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button onClick={handleRename} disabled={!selectedThemeId} className="px-2 py-1 rounded bg-obd-surface hover:bg-obd-dim/30 border border-obd-dim/30 text-xs disabled:opacity-30">Rename</button>
            <button onClick={handleDuplicate} disabled={!selectedThemeId} className="px-2 py-1 rounded bg-obd-surface hover:bg-obd-dim/30 border border-obd-dim/30 text-xs disabled:opacity-30">Dup</button>
            <button onClick={handleDelete} disabled={!selectedThemeId} className="px-2 py-1 rounded bg-red-900 hover:bg-red-800 border border-red-700/50 text-xs disabled:opacity-30">Del</button>
          </div>

          {/* PID / Type selectors */}
          <div className="flex gap-2 items-center">
            <select
              value={previewPid}
              onChange={(e) => setPreviewPid(e.target.value)}
              className="bg-obd-surface border border-obd-dim/30 rounded px-2 py-1 text-sm flex-1"
            >
              {PID_OPTIONS.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <select
              value={previewKind}
              onChange={(e) => setPreviewKind(e.target.value as PreviewKind)}
              className="bg-obd-surface border border-obd-dim/30 rounded px-2 py-1 text-sm"
            >
              <option value="meter">Meter (Needle)</option>
              <option value="meter-arc">Meter (Arc)</option>
              <option value="graph">Graph</option>
              <option value="numeric">Numeric</option>
            </select>
          </div>

          {/* Canvas preview */}
          <div
            ref={containerRef}
            className="flex-1 min-h-[200px] bg-black/50 rounded flex items-center justify-center"
          >
            {selectedThemeId ? (
              <canvas
                ref={canvasRef}
                width={canvasSize.width}
                height={canvasSize.height}
                style={{ width: canvasSize.width, height: canvasSize.height }}
              />
            ) : (
              <span className="text-obd-dim">Select a theme to preview</span>
            )}
          </div>

          {/* Preview params */}
          <div className="flex gap-2 items-center flex-wrap text-xs">
            <label>Title:<input value={previewTitle} onChange={e => setPreviewTitle(e.target.value)} className="bg-obd-surface border border-obd-dim/30 rounded px-1 py-0.5 w-16 ml-1" /></label>
            <label>Min:<input type="number" value={previewMin} onChange={e => setPreviewMin(Number(e.target.value))} className="bg-obd-surface border border-obd-dim/30 rounded px-1 py-0.5 w-16 ml-1" /></label>
            <label>Max:<input type="number" value={previewMax} onChange={e => setPreviewMax(Number(e.target.value))} className="bg-obd-surface border border-obd-dim/30 rounded px-1 py-0.5 w-16 ml-1" /></label>
            <label>Unit:<input value={previewUnit} onChange={e => setPreviewUnit(e.target.value)} className="bg-obd-surface border border-obd-dim/30 rounded px-1 py-0.5 w-12 ml-1" /></label>
            <label>Dec:<input type="number" value={previewDecimals} onChange={e => setPreviewDecimals(Number(e.target.value))} min={0} max={4} className="bg-obd-surface border border-obd-dim/30 rounded px-1 py-0.5 w-10 ml-1" /></label>
            <label>Ticks:<input type="number" value={previewTicks} onChange={e => setPreviewTicks(Number(e.target.value))} min={2} max={100} className="bg-obd-surface border border-obd-dim/30 rounded px-1 py-0.5 w-12 ml-1" /></label>
          </div>

          {/* Value slider */}
          <div className="flex items-center gap-2 text-xs">
            <span>Value:</span>
            <input
              type="range"
              min={0}
              max={100}
              value={previewValue}
              onChange={e => setPreviewValue(Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-16 text-right">
              {(previewMin + (previewMax - previewMin) * (previewValue / 100)).toFixed(previewDecimals)}
            </span>
          </div>
        </div>

        {/* Right: Property editor */}
        <div className="w-1/2 overflow-y-auto p-3 border-l border-obd-dim/30">
          {!selectedThemeId ? (
            <div className="text-obd-dim text-center mt-8">Select a theme to edit</div>
          ) : (
            <div className="space-y-4">
              {/* Property groups */}
              {PROPERTY_GROUPS.map(group => (
                <PropertyGroupEditor
                  key={group.name}
                  group={group}
                  properties={properties}
                  pid={previewPid}
                  onChange={setProp}
                />
              ))}

              {/* Assets */}
              <div className="border border-obd-dim/30 rounded p-2">
                <h3 className="text-sm font-semibold mb-2 text-obd-accent">Assets</h3>
                <div className="space-y-1">
                  {ASSET_DEFS.map(ad => (
                    <div key={ad.name} className="flex items-center gap-2 text-xs">
                      <span className={assetExists[ad.name] ? 'text-green-400' : 'text-obd-dim'}>
                        {assetExists[ad.name] ? '\u2713' : '\u2717'}
                      </span>
                      <span className="flex-1">{ad.label}</span>
                      {assetExists[ad.name] ? (
                        <button
                          onClick={() => handleDeleteAsset(ad)}
                          className="px-1.5 py-0.5 rounded bg-red-900/50 hover:bg-red-800 text-red-300"
                        >
                          Del
                        </button>
                      ) : null}
                      <button
                        onClick={() => handleAddAsset(ad)}
                        className="px-1.5 py-0.5 rounded bg-obd-surface hover:bg-obd-dim/30 border border-obd-dim/30"
                      >
                        {assetExists[ad.name] ? 'Replace' : 'Add'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Inline dialog overlay */}
      {dialog && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-obd-surface rounded-lg p-4 min-w-[300px] max-w-[400px] shadow-xl border border-obd-dim/30">
            {dialog.type === 'prompt' ? (
              <>
                <div className="text-sm font-semibold mb-3">{dialog.title}</div>
                <input
                  autoFocus
                  type="text"
                  value={dialogInput}
                  onChange={(e) => setDialogInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && dialogInput.trim()) dialog.onOk(dialogInput.trim());
                    if (e.key === 'Escape') handleDialogCancel();
                  }}
                  className="w-full bg-obd-dark border border-obd-dim/30 rounded px-2 py-1.5 text-sm mb-3"
                />
                <div className="flex justify-end gap-2">
                  <button onClick={handleDialogCancel} className="px-3 py-1 rounded text-sm text-obd-dim hover:text-white">Cancel</button>
                  <button
                    onClick={() => dialogInput.trim() && dialog.onOk(dialogInput.trim())}
                    disabled={!dialogInput.trim()}
                    className="px-3 py-1 rounded bg-obd-accent text-black text-sm font-semibold disabled:opacity-30"
                  >
                    OK
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-sm mb-4">{dialog.message}</div>
                <div className="flex justify-end gap-2">
                  <button onClick={handleDialogCancel} className="px-3 py-1 rounded text-sm text-obd-dim hover:text-white">Cancel</button>
                  <button
                    onClick={dialog.onOk}
                    className="px-3 py-1 rounded bg-obd-accent text-black text-sm font-semibold"
                  >
                    OK
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Property group sub-component ---

function PropertyGroupEditor({
  group,
  properties,
  pid,
  onChange,
}: {
  group: PropertyGroup;
  properties: Record<string, string>;
  pid: string;
  onChange: (key: string, value: string) => void;
}) {
  const visibleProps = group.properties.filter(prop => {
    // pidOnly properties are hidden when no PID is selected
    if (prop.pidOnly && !pid) return false;
    return true;
  });

  if (visibleProps.length === 0) return null;

  return (
    <div className="border border-obd-dim/30 rounded p-2">
      <h3 className="text-sm font-semibold mb-2 text-obd-accent">{group.name}</h3>
      <div className="space-y-1.5">
        {visibleProps.map(prop => {
          const key = getPropertyKey(prop, pid);
          const globalKey = prop.key;
          const value = properties[key] ?? '';
          const globalValue = globalKey ? (properties[globalKey] ?? '') : '';
          const isPidOverride = pid && prop.pidSpecific && key !== globalKey;

          return (
            <div key={key} className="flex items-center gap-2 text-xs">
              <label className="w-24 text-right text-obd-dim shrink-0">
                {prop.label}
                {isPidOverride && <span className="text-amber-400 ml-1">(PID)</span>}
              </label>
              {prop.type === 'boolean' ? (
                <BooleanInput
                  value={value}
                  placeholder={isPidOverride ? globalValue : undefined}
                  onChange={(v) => onChange(key, v)}
                />
              ) : prop.type === 'color' ? (
                <ColorInput
                  value={value}
                  placeholder={isPidOverride ? globalValue : undefined}
                  onChange={(v) => onChange(key, v)}
                />
              ) : prop.type === 'text' ? (
                <TextInput
                  value={value}
                  onChange={(v) => onChange(key, v)}
                />
              ) : (
                <NumberInput
                  value={value}
                  placeholder={isPidOverride ? globalValue : undefined}
                  min={prop.min}
                  max={prop.max}
                  step={prop.step ?? 1}
                  onChange={(v) => onChange(key, v)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Input components ---

function TextInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 bg-obd-surface border border-obd-dim/30 rounded px-1 py-0.5 text-xs"
    />
  );
}

function NumberInput({
  value,
  placeholder,
  min,
  max,
  step,
  onChange,
}: {
  value: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step: number;
  onChange: (v: string) => void;
}) {
  const numVal = value !== '' ? parseFloat(value) : (placeholder ? parseFloat(placeholder) : (min ?? 0));
  return (
    <div className="flex items-center gap-1 flex-1">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={numVal}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 h-4"
      />
      <input
        type="number"
        value={value}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        className="w-16 bg-obd-surface border border-obd-dim/30 rounded px-1 py-0.5 text-xs"
      />
    </div>
  );
}

function ColorInput({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const displayColor = value || placeholder || '#ffffff';
  return (
    <div className="flex items-center gap-1 flex-1">
      <input
        type="color"
        value={normalizeColorForInput(displayColor)}
        onChange={(e) => onChange(e.target.value)}
        className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
      />
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-obd-surface border border-obd-dim/30 rounded px-1 py-0.5 text-xs"
      />
    </div>
  );
}

function BooleanInput({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const checked = value ? value.toLowerCase() === 'true' : (placeholder ? placeholder.toLowerCase() === 'true' : false);
  return (
    <div className="flex items-center gap-2 flex-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
        className="w-4 h-4"
      />
      {value === '' && placeholder && (
        <span className="text-obd-dim text-xs">(Global: {placeholder})</span>
      )}
    </div>
  );
}

export default ThemeEditorScreen;
