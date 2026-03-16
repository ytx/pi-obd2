import { useState, useEffect } from 'react';

interface UsbState {
  state: 'unmounted' | 'ro' | 'rw';
  device: string | null;
}

const stateConfig: Record<UsbState['state'], { color: string; label: string }> = {
  unmounted: { color: 'bg-red-500', label: 'Not connected' },
  ro: { color: 'bg-green-500', label: 'Ready (read-only)' },
  rw: { color: 'bg-yellow-500', label: 'Writing...' },
};

function UsbSection() {
  const [usbState, setUsbState] = useState<UsbState>({ state: 'unmounted', device: null });

  useEffect(() => {
    let cancelled = false;
    window.obd2API.usbGetState().then((s) => {
      if (!cancelled) setUsbState(s);
    });
    const cleanup = window.obd2API.onUsbStateChange((state: string) => {
      if (!cancelled) {
        setUsbState((prev) => ({
          ...prev,
          state: state as UsbState['state'],
        }));
      }
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  const { color, label } = stateConfig[usbState.state];

  return (
    <div className="bg-obd-surface rounded-lg p-4">
      <h2 className="text-lg font-semibold text-obd-primary mb-3">USB Memory</h2>
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${color}`} />
        <span className="text-sm">
          {label}
          {usbState.device && <span className="text-obd-dim ml-2">{usbState.device}</span>}
        </span>
      </div>
    </div>
  );
}

export default UsbSection;
