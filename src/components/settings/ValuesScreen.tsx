import { useState, useCallback } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { usePidConfigStore } from '@/stores/usePidConfigStore';
import { OBDPidInfo } from '@/types';

function getPidType(pid: string): 'OBD2' | 'GPS' {
  return pid.startsWith('GPS_') ? 'GPS' : 'OBD2';
}

interface PidRowProps {
  pid: OBDPidInfo;
  value: number | undefined;
  isExpanded: boolean;
  onToggle: () => void;
}

function PidRow({ pid, value, isExpanded, onToggle }: PidRowProps) {
  const config = usePidConfigStore((s) => s.configs[pid.id]);
  const setConfig = usePidConfigStore((s) => s.setConfig);
  const resetConfig = usePidConfigStore((s) => s.resetConfig);

  const pidType = getPidType(pid.id);
  const useEnabled = config?.use !== false;

  const displayName = config?.name ?? pid.name;
  const displayUnit = config?.unit ?? pid.unit;
  const displayMin = config?.min ?? pid.min;
  const displayMax = config?.max ?? pid.max;

  const hasOverrides = config && (
    config.name !== undefined ||
    config.unit !== undefined ||
    config.min !== undefined ||
    config.max !== undefined
  );

  const handleUseToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfig(pid.id, { ...config, use: useEnabled ? false : undefined });
  };

  const handleFieldChange = (field: keyof typeof config, rawValue: string) => {
    const current = config ?? {};
    if (field === 'name' || field === 'unit') {
      const val = rawValue || undefined;
      // If value matches default, clear override
      const defaultVal = field === 'name' ? pid.name : pid.unit;
      setConfig(pid.id, { ...current, [field]: val === defaultVal ? undefined : val });
    } else if (field === 'min' || field === 'max') {
      const n = parseFloat(rawValue);
      const defaultVal = field === 'min' ? pid.min : pid.max;
      if (isNaN(n)) {
        setConfig(pid.id, { ...current, [field]: undefined });
      } else {
        setConfig(pid.id, { ...current, [field]: n === defaultVal ? undefined : n });
      }
    }
  };

  const handleReset = () => {
    resetConfig(pid.id);
  };

  const formattedValue = value !== undefined
    ? (Number.isInteger(value) ? value.toString() : value.toFixed(1))
    : '--';

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-obd-dim/10 transition-colors ${
          isExpanded ? 'bg-obd-dim/20' : ''
        } ${!useEnabled ? 'opacity-50' : ''}`}
        onClick={onToggle}
      >
        {/* Type badge */}
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded w-10 text-center ${
          pidType === 'GPS' ? 'bg-cyan-900 text-cyan-300' : 'bg-green-900 text-green-300'
        }`}>
          {pidType}
        </span>

        {/* Name */}
        <span className={`flex-1 text-sm truncate ${hasOverrides ? 'text-obd-accent' : 'text-white'}`}>
          {displayName}
        </span>

        {/* Value */}
        <span className="w-20 text-right text-sm font-mono text-obd-primary">
          {formattedValue}
        </span>

        {/* Unit */}
        <span className="w-16 text-xs text-obd-dim truncate">
          {displayUnit}
        </span>

        {/* Min/Max */}
        <span className="w-24 text-xs text-obd-dim text-center">
          {displayMin} ~ {displayMax}
        </span>

        {/* Use checkbox */}
        <button
          onClick={handleUseToggle}
          className={`w-6 h-6 rounded border flex items-center justify-center transition-colors ${
            useEnabled
              ? 'bg-green-700 border-green-600 text-white'
              : 'bg-obd-dark border-obd-dim text-obd-dim'
          }`}
        >
          {useEnabled ? '\u2713' : ''}
        </button>
      </div>

      {/* Expanded edit form */}
      {isExpanded && (
        <div className="px-3 py-2 bg-obd-dark/50 border-t border-obd-dim/20">
          <div className="flex gap-3 items-end flex-wrap">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-obd-dim">Name</span>
              <input
                type="text"
                placeholder={pid.name}
                value={config?.name ?? ''}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                className="w-40 px-2 py-1 text-xs bg-obd-surface text-white border border-obd-dim rounded"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-obd-dim">Unit</span>
              <input
                type="text"
                placeholder={pid.unit}
                value={config?.unit ?? ''}
                onChange={(e) => handleFieldChange('unit', e.target.value)}
                className="w-20 px-2 py-1 text-xs bg-obd-surface text-white border border-obd-dim rounded"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-obd-dim">Min</span>
              <input
                type="number"
                placeholder={String(pid.min)}
                value={config?.min ?? ''}
                onChange={(e) => handleFieldChange('min', e.target.value)}
                className="w-20 px-2 py-1 text-xs bg-obd-surface text-white border border-obd-dim rounded"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-obd-dim">Max</span>
              <input
                type="number"
                placeholder={String(pid.max)}
                value={config?.max ?? ''}
                onChange={(e) => handleFieldChange('max', e.target.value)}
                className="w-20 px-2 py-1 text-xs bg-obd-surface text-white border border-obd-dim rounded"
              />
            </label>
            {hasOverrides && (
              <button
                onClick={handleReset}
                className="px-2 py-1 text-xs text-obd-warn border border-obd-dim rounded hover:bg-obd-dim/30 transition-colors"
              >
                Reset
              </button>
            )}
          </div>
          <div className="mt-1 text-[10px] text-obd-dim">
            PID: {pid.id}
          </div>
        </div>
      )}
    </div>
  );
}

function ValuesScreen() {
  const { setScreen } = useAppStore();
  const availablePids = useOBDStore((s) => s.availablePids);
  const currentValues = useOBDStore((s) => s.currentValues);
  const configs = usePidConfigStore((s) => s.configs);

  const [expandedPid, setExpandedPid] = useState<string | null>(null);
  const [useOnlyFilter, setUseOnlyFilter] = useState(false);
  const [, setRefreshTick] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  const filteredPids = useOnlyFilter
    ? availablePids.filter((p) => configs[p.id]?.use !== false)
    : availablePids;

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
        <h1 className="text-2xl font-bold text-white">Values</h1>
        <div className="w-20" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={handleRefresh}
          className="px-3 py-1 text-sm bg-obd-surface text-obd-accent border border-obd-dim rounded hover:bg-obd-dim/30 transition-colors"
        >
          Refresh
        </button>
        <button
          onClick={() => setUseOnlyFilter(!useOnlyFilter)}
          className={`px-3 py-1 text-sm rounded border transition-colors ${
            useOnlyFilter
              ? 'bg-green-700 border-green-600 text-white'
              : 'bg-obd-surface border-obd-dim text-obd-dim'
          }`}
        >
          {useOnlyFilter ? 'Use Only' : 'All'}
        </button>
        <span className="text-xs text-obd-dim ml-auto">
          {filteredPids.length} / {availablePids.length} PIDs
        </span>
      </div>

      {/* Table header */}
      <div className="flex items-center gap-2 px-3 py-1 text-[10px] text-obd-dim uppercase tracking-wider border-b border-obd-dim/30">
        <span className="w-10 text-center">Type</span>
        <span className="flex-1">Name</span>
        <span className="w-20 text-right">Value</span>
        <span className="w-16">Unit</span>
        <span className="w-24 text-center">Min ~ Max</span>
        <span className="w-6 text-center">Use</span>
      </div>

      {/* PID list */}
      <div className="flex-1 overflow-auto">
        {filteredPids.length === 0 ? (
          <p className="text-sm text-obd-dim py-4 text-center">No PIDs available.</p>
        ) : (
          filteredPids.map((pid) => (
            <PidRow
              key={pid.id}
              pid={pid}
              value={currentValues[pid.id]?.value}
              isExpanded={expandedPid === pid.id}
              onToggle={() => setExpandedPid(expandedPid === pid.id ? null : pid.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default ValuesScreen;
