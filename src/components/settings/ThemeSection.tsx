import { useEffect } from 'react';
import { useThemeStore } from '@/stores/useThemeStore';
import { ThemeData } from '@/types';

function ThemeSection() {
  const { availableThemes, currentThemeId, setAvailableThemes, applyTheme, clearTheme } =
    useThemeStore();

  useEffect(() => {
    window.obd2API?.themeList().then(setAvailableThemes);
  }, [setAvailableThemes]);

  const handleChange = async (themeId: string) => {
    if (themeId === '') {
      clearTheme();
      return;
    }
    const data = await window.obd2API.themeLoad(themeId);
    if (data) {
      applyTheme(data as ThemeData);
    }
  };

  return (
    <div className="bg-obd-surface rounded-lg p-4">
      <h2 className="text-lg font-semibold text-obd-primary mb-3">Theme</h2>
      {availableThemes.length === 0 ? (
        <p className="text-sm text-obd-dim">No themes found in themes/ directory.</p>
      ) : (
        <div>
          <select
            value={currentThemeId ?? ''}
            onChange={(e) => handleChange(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-obd-dark text-white border border-obd-dim rounded mb-3"
          >
            <option value="">Default (No Theme)</option>
            {availableThemes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {/* Theme previews */}
          <div className="grid grid-cols-3 gap-2">
            {availableThemes.map((t) => (
              <button
                key={t.id}
                onClick={() => handleChange(t.id)}
                className={`rounded overflow-hidden border-2 transition-colors ${
                  currentThemeId === t.id ? 'border-obd-primary' : 'border-transparent'
                }`}
              >
                {t.screenshotBase64 ? (
                  <img src={t.screenshotBase64} alt={t.name} className="w-full h-auto" />
                ) : (
                  <div className="bg-obd-dark h-16 flex items-center justify-center">
                    <span className="text-xs text-obd-dim">{t.name}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ThemeSection;
