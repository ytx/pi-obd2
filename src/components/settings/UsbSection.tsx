import { useState, useCallback } from 'react';
import { UsbDevice } from '@/types';
import { useBoardStore } from '@/stores/useBoardStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { ThemeData } from '@/types';

function UsbSection() {
  const [devices, setDevices] = useState<UsbDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [mounted, setMounted] = useState(false);
  const [mountedDevice, setMountedDevice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    const devs = await window.obd2API.detectUsb();
    setDevices(devs);
    // Check if any device is already mounted at our mount point
    const alreadyMounted = devs.find((d: UsbDevice) => d.mountpoint?.includes('obd2-usb'));
    if (alreadyMounted) {
      setMounted(true);
      setMountedDevice(alreadyMounted.device);
    }
    if (devs.length > 0 && !selectedDevice) {
      setSelectedDevice(devs[0].device);
    }
    return devs;
  }, [selectedDevice]);

  const handleDetect = async () => {
    setBusy(true);
    setMessage(null);
    const devs = await loadDevices();
    if (devs.length === 0) {
      setMessage('USB メモリが見つかりません');
    }
    setBusy(false);
  };

  const handleMount = async () => {
    if (!selectedDevice) {
      setMessage('USB メモリを選択してください');
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await window.obd2API.mountUsb(selectedDevice);
    if (result.success) {
      setMounted(true);
      setMountedDevice(selectedDevice);
      setMessage(`${selectedDevice} をマウントしました`);
    } else {
      setMessage(`マウント失敗: ${result.error}`);
    }
    setBusy(false);
  };

  const handleUnmount = async () => {
    setBusy(true);
    setMessage(null);
    const result = await window.obd2API.unmountUsb();
    if (result.success) {
      setMounted(false);
      setMountedDevice(null);
      setMessage('USB メモリを安全に取り外せます');
    } else {
      setMounted(false);
      setMountedDevice(null);
      setMessage(`取り外し失敗: ${result.error}`);
    }
    setBusy(false);
  };

  const handleExport = async () => {
    setBusy(true);
    setMessage(null);
    const { boards, layouts, currentBoardId, screenPadding } = useBoardStore.getState();
    const { currentThemeId } = useThemeStore.getState();
    const config = {
      version: 2,
      boards,
      layouts,
      currentBoardId,
      screenPadding,
      currentThemeId,
    };
    const result = await window.obd2API.usbExportConfig(JSON.stringify(config, null, 2));
    if (result.success) {
      setMessage('設定をエクスポートしました');
    } else {
      setMessage(`エクスポート失敗: ${result.error}`);
    }
    setBusy(false);
  };

  const handleImport = async () => {
    setBusy(true);
    setMessage(null);
    const result = await window.obd2API.usbImportConfig();
    if (!result.success) {
      setMessage(`インポート失敗: ${result.error}`);
      setBusy(false);
      return;
    }
    try {
      const config = JSON.parse(result.data!);
      if (config.version !== 1 && config.version !== 2) {
        setMessage('未対応の設定ファイルバージョンです');
        setBusy(false);
        return;
      }
      // Apply board config
      const boardStore = useBoardStore.getState();
      if (config.boards) {
        const updates: Record<string, unknown> = {
          boards: config.boards,
          currentBoardId: config.currentBoardId ?? boardStore.currentBoardId,
          screenPadding: config.screenPadding ?? boardStore.screenPadding,
        };
        // v2 includes layouts
        if (config.version >= 2 && config.layouts) {
          updates.layouts = config.layouts;
        }
        useBoardStore.setState(updates);
      }
      // Apply theme
      const themeStore = useThemeStore.getState();
      const newThemeId = config.currentThemeId ?? null;
      if (newThemeId !== themeStore.currentThemeId) {
        if (newThemeId) {
          const data = await window.obd2API.themeLoad(newThemeId);
          if (data) {
            themeStore.applyTheme(data as ThemeData);
          } else {
            themeStore.clearTheme();
            setMessage('設定をインポートしました（テーマが見つかりません）');
            setBusy(false);
            return;
          }
        } else {
          themeStore.clearTheme();
        }
      }
      setMessage('設定をインポートしました');
    } catch {
      setMessage('設定ファイルの解析に失敗しました');
    }
    setBusy(false);
  };

  return (
    <div className="bg-obd-surface rounded-lg p-4">
      <h2 className="text-lg font-semibold text-obd-primary mb-3">USB Memory</h2>

      {/* Status */}
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-3 h-3 rounded-full ${mounted ? 'bg-green-500' : 'bg-gray-500'}`} />
        <span className="text-sm">
          {mounted
            ? `使用中: ${mountedDevice}`
            : '未接続'}
        </span>
      </div>

      {mounted ? (
        <>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={handleExport}
              disabled={busy}
              className="px-4 py-2 bg-obd-surface text-obd-accent border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors disabled:opacity-50"
            >
              設定エクスポート
            </button>
            <button
              onClick={handleImport}
              disabled={busy}
              className="px-4 py-2 bg-obd-surface text-obd-accent border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors disabled:opacity-50"
            >
              設定インポート
            </button>
            <button
              onClick={handleUnmount}
              disabled={busy}
              className="px-4 py-2 bg-obd-surface text-obd-warn border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors disabled:opacity-50"
            >
              取り外す
            </button>
          </div>
        </>
      ) : (
        <div className="flex gap-3 items-center">
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="flex-1 bg-obd-dark rounded-lg px-3 py-2 text-white text-sm border border-obd-dim"
          >
            {devices.length === 0 ? (
              <option value="">USB メモリなし</option>
            ) : (
              devices.map((d) => (
                <option key={d.device} value={d.device}>
                  {d.device.replace('/dev/', '')} ({d.size})
                </option>
              ))
            )}
          </select>
          <button
            onClick={handleDetect}
            disabled={busy}
            className="px-4 py-2 bg-obd-surface text-obd-primary border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors disabled:opacity-50"
          >
            検出
          </button>
          <button
            onClick={handleMount}
            disabled={busy || devices.length === 0}
            className="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
          >
            マウント
          </button>
        </div>
      )}

      {message && (
        <p className="text-obd-dim text-sm mt-3">{message}</p>
      )}
    </div>
  );
}

export default UsbSection;
