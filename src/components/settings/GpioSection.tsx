import { useGpioStore } from '@/stores/useGpioStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { useBoardStore } from '@/stores/useBoardStore';

const GPIO_PIN_OPTIONS: (number | null)[] = [
  null, 4, 5, 6, 12, 13, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
];

function GpioSection() {
  const {
    illuminationPin,
    reversePin,
    usbResetPin,
    illuminationThemeId,
    reverseBoardId,
    illuminationActiveHigh,
    reverseActiveHigh,
    illuminationActive,
    reverseActive,
    setIlluminationPin,
    setReversePin,
    setUsbResetPin,
    setIlluminationThemeId,
    setReverseBoardId,
    setIlluminationActiveHigh,
    setReverseActiveHigh,
  } = useGpioStore();

  const { availableThemes } = useThemeStore();
  const { boards } = useBoardStore();

  const handlePinChange = (setter: (pin: number | null) => void, value: string) => {
    const pin = value === '' ? null : Number(value);
    setter(pin);
    // Re-setup GPIO pins
    const gpioState = useGpioStore.getState();
    const pins: number[] = [];
    // Use updated value for the changed pin
    const illPin = setter === setIlluminationPin ? pin : gpioState.illuminationPin;
    const revPin = setter === setReversePin ? pin : gpioState.reversePin;
    if (illPin !== null) pins.push(illPin);
    if (revPin !== null) pins.push(revPin);
    window.obd2API?.gpioSetup(pins);
  };

  return (
    <div className="bg-obd-surface rounded-lg p-4">
      <h2 className="text-lg font-semibold text-obd-primary mb-3">GPIO</h2>

      {/* Illumination */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-medium text-obd-accent">Illumination</h3>
          {illuminationActive && (
            <span className="text-xs bg-yellow-800 text-yellow-200 px-2 py-0.5 rounded">ON</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-obd-dim block mb-1">GPIO Pin</label>
            <select
              value={illuminationPin ?? ''}
              onChange={(e) => handlePinChange(setIlluminationPin, e.target.value)}
              className="w-full px-2 py-1.5 text-sm bg-obd-dark text-white border border-obd-dim rounded"
            >
              {GPIO_PIN_OPTIONS.map((p) => (
                <option key={p ?? 'off'} value={p ?? ''}>
                  {p === null ? 'Disabled' : `GPIO ${p}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-obd-dim block mb-1">Logic</label>
            <select
              value={illuminationActiveHigh ? 'high' : 'low'}
              onChange={(e) => setIlluminationActiveHigh(e.target.value === 'high')}
              className="w-full px-2 py-1.5 text-sm bg-obd-dark text-white border border-obd-dim rounded"
            >
              <option value="high">Active HIGH</option>
              <option value="low">Active LOW</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-obd-dim block mb-1">Theme (ON)</label>
            <select
              value={illuminationThemeId ?? ''}
              onChange={(e) => setIlluminationThemeId(e.target.value || null)}
              className="w-full px-2 py-1.5 text-sm bg-obd-dark text-white border border-obd-dim rounded"
            >
              <option value="">Not Set</option>
              {availableThemes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Reverse */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-medium text-obd-accent">Reverse</h3>
          {reverseActive && (
            <span className="text-xs bg-blue-800 text-blue-200 px-2 py-0.5 rounded">ON</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-obd-dim block mb-1">GPIO Pin</label>
            <select
              value={reversePin ?? ''}
              onChange={(e) => handlePinChange(setReversePin, e.target.value)}
              className="w-full px-2 py-1.5 text-sm bg-obd-dark text-white border border-obd-dim rounded"
            >
              {GPIO_PIN_OPTIONS.map((p) => (
                <option key={p ?? 'off'} value={p ?? ''}>
                  {p === null ? 'Disabled' : `GPIO ${p}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-obd-dim block mb-1">Logic</label>
            <select
              value={reverseActiveHigh ? 'high' : 'low'}
              onChange={(e) => setReverseActiveHigh(e.target.value === 'high')}
              className="w-full px-2 py-1.5 text-sm bg-obd-dark text-white border border-obd-dim rounded"
            >
              <option value="high">Active HIGH</option>
              <option value="low">Active LOW</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-obd-dim block mb-1">Board (ON)</label>
            <select
              value={reverseBoardId ?? ''}
              onChange={(e) => setReverseBoardId(e.target.value || null)}
              className="w-full px-2 py-1.5 text-sm bg-obd-dark text-white border border-obd-dim rounded"
            >
              <option value="">Not Set</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* USB Reset */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-medium text-obd-accent">USB Reset</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-obd-dim block mb-1">GPIO Pin</label>
            <select
              value={usbResetPin ?? ''}
              onChange={(e) => {
                const pin = e.target.value === '' ? null : Number(e.target.value);
                setUsbResetPin(pin);
                if (pin !== null) {
                  window.obd2API?.gpioSet(pin, 1);
                }
              }}
              className="w-full px-2 py-1.5 text-sm bg-obd-dark text-white border border-obd-dim rounded"
            >
              {GPIO_PIN_OPTIONS.map((p) => (
                <option key={p ?? 'off'} value={p ?? ''}>
                  {p === null ? 'Disabled' : `GPIO ${p}`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <p className="text-xs text-obd-dim pb-2">HIGH=normal, LOW 1s=reset</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GpioSection;
