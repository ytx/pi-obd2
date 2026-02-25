import fs from 'fs';
import path from 'path';

export interface ThemeInfo {
  id: string;
  name: string;
  screenshotBase64?: string;
}

export interface ThemeAssets {
  dialBackground?: string;    // base64 data URL
  displayBackground?: string; // base64 data URL
  background?: string;        // base64 data URL
  needle?: string;            // base64 data URL (480x480, needle pointing 12 o'clock)
  fontBase64?: string;        // base64 raw (for @font-face)
}

export interface ThemeProperties {
  [key: string]: string;
}

export interface ThemeData {
  info: ThemeInfo;
  properties: ThemeProperties;
  assets: ThemeAssets;
}

/**
 * themes/ ディレクトリ構造:
 *   themes/
 *     red-sport/
 *       properties.txt
 *       dial_background.png
 *       display_background.png
 *       background.jpg
 *       font.ttf (optional)
 *       screenshot.png (optional)
 *     blue-orange/
 *       ...
 *
 * 各サブディレクトリが1テーマ。properties.txt 必須。
 */
function getThemesDir(): string {
  // dist-electron/themes/ → ../../themes/
  return path.join(__dirname, '..', '..', 'themes');
}

function parseProperties(text: string): ThemeProperties {
  const props: ThemeProperties = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();
    if (key) props[key] = value;
  }
  return props;
}

function fileToDataUrl(filePath: string, mimeType: string): string {
  const data = fs.readFileSync(filePath);
  return `data:${mimeType};base64,${data.toString('base64')}`;
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.ttf': return 'font/ttf';
    case '.otf': return 'font/otf';
    default: return 'application/octet-stream';
  }
}

function findFile(dir: string, names: string[]): string | null {
  for (const name of names) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function scanDir(dir: string, idPrefix: string): ThemeInfo[] {
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const themes: ThemeInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const themeDir = path.join(dir, entry.name);
    const propsFile = path.join(themeDir, 'properties.txt');
    if (!fs.existsSync(propsFile)) continue;

    let screenshotBase64: string | undefined;
    const ssFile = findFile(themeDir, ['screenshot.png', 'Screenshot.png', 'screenshot.jpg']);
    if (ssFile) {
      screenshotBase64 = fileToDataUrl(ssFile, getMimeType(ssFile));
    }

    themes.push({
      id: idPrefix + entry.name,
      name: entry.name,
      screenshotBase64,
    });
  }

  return themes;
}

/** Scan themes/ for valid theme directories. extraDirs are scanned with usb: prefix. */
export function scanThemes(extraDirs?: string[]): ThemeInfo[] {
  const themes = scanDir(getThemesDir(), '');
  if (extraDirs) {
    for (const dir of extraDirs) {
      themes.push(...scanDir(dir, 'usb:'));
    }
  }
  return themes;
}

/** Resolve theme directory from themeId (handles usb: prefix) */
function resolveThemeDir(themeId: string, extraDirs?: string[]): string | null {
  if (themeId.startsWith('usb:') && extraDirs) {
    const name = themeId.slice(4);
    for (const dir of extraDirs) {
      const themeDir = path.join(dir, name);
      if (fs.existsSync(path.join(themeDir, 'properties.txt'))) return themeDir;
    }
    return null;
  }
  const themeDir = path.join(getThemesDir(), themeId);
  if (fs.existsSync(path.join(themeDir, 'properties.txt'))) return themeDir;
  return null;
}

/** Load full theme data */
export function loadTheme(themeId: string, extraDirs?: string[]): ThemeData | null {
  const themeDir = resolveThemeDir(themeId, extraDirs);
  if (!themeDir) return null;

  const propsFile = path.join(themeDir, 'properties.txt');
  const properties = parseProperties(fs.readFileSync(propsFile, 'utf-8'));
  const assets: ThemeAssets = {};

  const dialBg = findFile(themeDir, ['dial_background.png']);
  if (dialBg) assets.dialBackground = fileToDataUrl(dialBg, 'image/png');

  const displayBg = findFile(themeDir, ['display_background.png']);
  if (displayBg) assets.displayBackground = fileToDataUrl(displayBg, 'image/png');

  const bg = findFile(themeDir, ['background.jpg', 'background.png', 'background.jpeg']);
  if (bg) assets.background = fileToDataUrl(bg, getMimeType(bg));

  const needle = findFile(themeDir, ['needle.png']);
  if (needle) assets.needle = fileToDataUrl(needle, 'image/png');

  const font = findFile(themeDir, ['font.ttf', 'font.otf']);
  if (font) assets.fontBase64 = fs.readFileSync(font).toString('base64');

  return {
    info: { id: themeId, name: properties.themeName || themeId.replace(/^usb:/, '') },
    properties,
    assets,
  };
}
