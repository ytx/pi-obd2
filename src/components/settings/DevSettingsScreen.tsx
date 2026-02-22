import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { StubProfileName } from '@/types';

function DevSettingsScreen() {
  const { setScreen } = useAppStore();
  const {
    isStubMode,
    availablePids,
    currentProfile,
    profiles,
    setStubMode,
    setAvailablePids,
    setProfiles,
    setCurrentProfile,
  } = useOBDStore();
  const [stubConfig, setStubConfig] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!window.obd2API) return;
    window.obd2API.obdIsStubMode().then(setStubMode);
    window.obd2API.obdGetAvailablePids().then(setAvailablePids);
    window.obd2API.stubGetProfiles().then(setProfiles);
    window.obd2API.stubGetConfig().then(setStubConfig);
  }, [setStubMode, setAvailablePids, setProfiles]);

  const handleProfileChange = async (name: string) => {
    await window.obd2API.stubSetProfile(name);
    setCurrentProfile(name as StubProfileName);
    window.obd2API.stubGetConfig().then(setStubConfig);
  };

  const handlePidBaseChange = async (pid: string, base: number) => {
    await window.obd2API.stubSetPidConfig(pid, { pattern: 'random-walk', base, step: 5, min: base * 0.5, max: base * 1.5 });
    window.obd2API.stubGetConfig().then(setStubConfig);
  };

  const pidConfigs = (stubConfig as { pidConfigs?: Record<string, { base?: number; value?: number }> })?.pidConfigs;

  return (
    <div className="h-full flex flex-col bg-obd-dark p-6">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setScreen('dashboard')}
          className="px-4 py-2 text-obd-primary border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors"
        >
          &larr; Back
        </button>
        <h1 className="text-2xl font-bold text-white">Dev Settings</h1>
        <div className="w-20" />
      </div>

      <div className="flex-1 overflow-auto space-y-4">
        {!isStubMode ? (
          <div className="bg-obd-surface rounded-lg p-4">
            <p className="text-obd-dim">Stub mode is not active. Start the app in STUB mode to use these settings.</p>
          </div>
        ) : (
          <div className="bg-obd-surface rounded-lg p-4">
            <h2 className="text-lg font-semibold text-obd-primary mb-3">Stub Simulator</h2>

            {/* Profile selection */}
            <div className="mb-4">
              <label className="text-sm text-obd-dim block mb-2">Profile</label>
              <div className="flex gap-2">
                {profiles.map((p) => (
                  <button
                    key={p}
                    onClick={() => handleProfileChange(p)}
                    className={`px-3 py-1 rounded text-sm transition-colors ${
                      currentProfile === p
                        ? 'bg-obd-primary text-obd-dark font-bold'
                        : 'bg-obd-dark text-obd-dim border border-obd-dim hover:bg-obd-dim/30'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* PID value sliders */}
            <div className="space-y-3">
              <label className="text-sm text-obd-dim block">PID Base Values</label>
              {availablePids.map((pid) => {
                const cfg = pidConfigs?.[pid.id];
                const currentBase = cfg?.base ?? cfg?.value ?? (pid.min + pid.max) / 2;
                return (
                  <div key={pid.id} className="flex items-center gap-3">
                    <span className="text-xs text-obd-dim w-36 truncate">{pid.name}</span>
                    <input
                      type="range"
                      min={pid.min}
                      max={pid.max}
                      step={(pid.max - pid.min) / 100}
                      value={currentBase}
                      onChange={(e) => handlePidBaseChange(pid.id, parseFloat(e.target.value))}
                      className="flex-1 accent-obd-primary"
                    />
                    <span className="text-xs text-white w-16 text-right">
                      {currentBase.toFixed(1)} {pid.unit}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DevSettingsScreen;
