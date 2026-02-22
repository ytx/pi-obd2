# pi-obd2

Raspberry Pi 4 (4GB) 車載 OBD2 ダッシュボードアプリケーション。

## プロジェクト概要

- Bluetooth SPP 接続の ELM327 OBD2 アダプタからデータを取得し、リアルタイム表示する
- 複数のボード（画面）をフリック/キーで切り替える構成
- Android アプリ Torque のテーマファイル（ZIP: properties.txt + PNG）に対応
- overlay ファイルシステムで運用、設定は config-persistence で永続化

## 技術スタック

- **Electron 28+** + **React 18** + **TypeScript**
- **Vite** (ビルド)
- **Zustand** (状態管理)
- **Tailwind CSS** (スタイリング)
- **HTML5 Canvas** (メーター・グラフ描画)

## 参照プロジェクト

- `../Sonix/sonix2` - 同形式の Electron キオスクアプリ (React + Vite + Zustand + Tailwind)
- `../pi-setup/ansible/sonix-sc.yml` - Ansible セットアップのベース
- `../pi-setup/ansible/roles/config-persistence` - overlay FS 上の設定永続化

## アーキテクチャ

### Electron メインプロセス (`electron/`)

- `main.ts` - Electron 初期化、IPC ハンドラ、システム操作、自動接続
- `preload.ts` - contextBridge によるセキュア IPC
- `obd/data-source.ts` - DataSource 抽象インターフェース
- `obd/stub-source.ts` - スタブデータソース（開発用シミュレーター）
- `obd/elm327-source.ts` - ELM327 データソース（実機用）
- `obd/pids.ts` - PID 定義テーブル（名前、単位、計算式、min/max）
- `themes/theme-loader.ts` - テーマディレクトリのスキャン・読込

### React レンダラ (`src/`)

- `components/DashboardScreen.tsx` - メイン画面（コンパクトヘッダー + ボード表示）
- `components/SettingsScreen.tsx` - 設定画面
- `components/boards/BoardContainer.tsx` - ボード切替コンテナ（スワイプ + キーボード）
- `components/boards/BoardView.tsx` - CSS Grid ボードビュー
- `components/boards/useSwipe.ts` - タッチスワイプ検出フック
- `components/panels/PanelSlot.tsx` - パネル種別ルーティング + スロットオーバーライド適用
- `components/panels/NumericPanel.tsx` - 数値パネル（HTML、等幅桁表示）
- `components/panels/MeterPanel.tsx` - メーターパネル（Canvas）
- `components/panels/GraphPanel.tsx` - グラフパネル（Canvas、TimeBuffer）
- `components/panels/useCanvasSize.ts` - ResizeObserver + devicePixelRatio フック
- `components/settings/BoardEditSection.tsx` - ボード編集（パネル割当 + 詳細設定）
- `components/settings/BluetoothSection.tsx` - BT 設定（スキャン・ペアリング）
- `components/settings/WiFiSection.tsx` - WiFi 設定
- `components/settings/ThemeSection.tsx` - テーマ選択（スクリーンショット付き）
- `canvas/meter-renderer.ts` - メーター Canvas 描画（純粋関数）
- `canvas/graph-renderer.ts` - グラフ Canvas 描画（純粋関数）
- `canvas/time-buffer.ts` - 時系列循環バッファ（maxSize=300）
- `canvas/theme-parser.ts` - Torque properties → MeterConfig/NumericConfig/GraphConfig 変換
- `canvas/mono-text.ts` - Canvas 等幅数字描画ヘルパー
- `stores/useAppStore.ts` - アプリ状態（画面、ホスト名、システム情報）
- `stores/useOBDStore.ts` - OBD2 データ状態（接続、値、PID 情報）
- `stores/useBoardStore.ts` - ボード・レイアウト・パネル定義管理
- `stores/useThemeStore.ts` - テーマ状態（設定、アセット URL、フォント）
- `config/defaults.ts` - デフォルト設定（メーター・グラフ・数値・レイアウト・ボード）
- `types/index.ts` - 全型定義

### データモデル

- **Board** - ボード（名前、レイアウト参照、`panels: (BoardSlot | null)[]`）
- **BoardSlot** - スロット（`panelDefId` 表示テンプレート + `pid` データソース + オーバーライド）
- **Layout** - レイアウト（CSS Grid 定義: columns, rows, gap, cells）
- **PanelDef** - パネル定義（`id`, `kind`, `config` — PID 非依存の表示テンプレート）
- **PanelKind** - `'numeric' | 'meter' | 'graph'`

データソース（PID）と表示形式（PanelDef）は分離されており、任意の組み合わせが可能。

### BoardSlot オーバーライド

各スロットで PID デフォルト値を上書き可能:
- `title` / `unit` - 表示名・単位
- `min` / `max` - メーター・グラフの範囲（例: 速度 0-240）
- `decimals` - 小数点桁数（数値・メーター）
- `step` - メーター目盛り分割数
- `timeWindowMs` - グラフ時間窓

PanelSlot.tsx でフォールバックチェーン: スロットオーバーライド → PID デフォルト → ハードコード値

### OBD2 通信

- Bluetooth SPP のみ（ELM327）
- BlueZ D-Bus API でスキャン・ペアリング・接続（TODO: 実装）
- SPP rfcomm → serialport でデータ通信
- 表示中ボードの使用 PID のみポーリング（優先度付き）
- 起動時自動接続（STUB モードでは即座に接続）

### Torque テーマ

テーマ配置: `themes/<テーマ名>/` ディレクトリ（APK から展開済み）

**テーマディレクトリ構成:**
```
themes/<theme-name>/
├── properties.txt           # Java properties 形式 (key=value, # コメント)
├── dial_background.png      # 480x480 RGBA メーター背景
├── display_background.png   # 480x480 RGBA 数値表示背景
├── background.jpg           # ダッシュボード全体背景 (任意サイズ)
├── font.ttf                 # カスタムフォント (オプション)
└── screenshot.png           # プレビュー画像
```

**同梱テーマ:** `themes/red-sport/`, `themes/blue-orange/`

**properties.txt の主要プロパティ (実データ確認済み):**
- `globalDialStartAngle` / `globalDialStopAngle` - 6時方向基準の除外角度
- `dialStartAngle_<pid>` / `dialStopAngle_<pid>` - PID別角度オーバーライド
- `dialTickInnerRadius` / `dialTickOuterRadius` - 目盛り線の内径/外径 (倍率)
- `dialNeedleLength` / `dialNeedleSizeRatio` / `dialNeedleColour` - 針の長さ/太さ/色
- `globalFontScale` / `dialMeterValueFontScale` / `dialNeedleValueFontScale` - フォントサイズ
- `globalTextRadius` - スケール数値の配置半径 (倍率)
- `globalHideTicks` / `hideTicks_<pid>` - 目盛り非表示フラグ
- `displayTextValueColour` / `displayTextTitleColour` - テキスト色 (#RRGGBB or #AARRGGBB)
- `displayTickColour` / `displayIndicatorColour` - 目盛り/インジケータ色
- `graphLineColour` - グラフ線色（なければ `displayTextValueColour` にフォールバック）
- `dialNeedleTitleTextOffset` / `dialNeedleValueTextOffset` / `dialNeedleUnitTextOffset` - テキスト位置オフセット

**テーマ適用範囲:**
- メーター: 背景画像、角度、目盛り、針、テキスト色・位置、フォント
- 数値パネル: 背景画像、テキスト色、フォント
- グラフ: 線色・塗り色（`graphLineColour` → `displayTextValueColour` → デフォルト）、テキスト色
- ダッシュボード: 全体背景画像

**Canvas レイヤー合成順:**
1. `dial_background.png` (480x480 をパネルサイズにスケーリング)
2. 目盛り線 (テーマ背景がある場合はスキップ — 背景画像に含まれるため)
3. スケール数値 (min〜max, textRadius に沿って配置 — 常に表示)
4. テキスト (タイトル、値、単位 - オフセット付き)
5. 針 (colour, length, sizeRatio で描画)

**角度システム:**
- 基準点 = 6時方向 (真下, 180°)
- startAngle/stopAngle = 真下からの除外角度
- 例: 両方45° → 360-45-45 = 270° の一般的な自動車メーター

**等幅数字表示:**
- Canvas: `mono-text.ts` — 0-9 の最大幅を measureText で実測し、各桁を等間隔描画
- HTML (NumericPanel): 各桁を固定幅 `inline-block` span で描画、幅は Canvas measureText で実測
- プロポーショナルフォント（テーマ TTF）でも値がブレない

### UI 構成

**ダッシュボード画面:**
- コンパクトヘッダー: 接続状態ドット + STUB プロファイル切替 + テーマ切替 + 歯車アイコン（設定）
- ボード表示領域を最大化、起動時自動接続
- ボード切替: 左右フリック / 左右キー、インジケータドット表示

**設定画面:**
- System（ホスト名、CPU、メモリ、稼働時間）
- OBD2（接続状態）
- Bluetooth（スキャン・ペアリング）
- WiFi（スキャン・接続）
- Board Editor（ボード選択、スロット毎の表示種別・PID・詳細設定）
- Theme（スクリーンショット付きテーマ選択）
- Stub Simulator（開発用）
- System Actions（再起動・シャットダウン・設定保存）

### CSP (Content Security Policy)

`index.html` で設定:
- `img-src 'self' data:` — テーマ画像（base64 data URL）を許可
- `font-src 'self' data:` — テーマフォント（base64 data URL）を許可

## 画面・ハードウェア

- 基準: 1024 x 600、対象: 640x480 〜 1920x1080
- HDMI + USB タッチパネル
- タッチ操作: フリックでボード切替、設定画面操作
- ロギング機能: なし（リアルタイム表示のみ）

## セットアップ (Ansible)

sonix-sc.yml 踏襲の `obd2-kiosk.yml`:
- overlay-disable → disable-services (BT/WiFi は有効) → config-persistence → rpi-clone → usb-patch → boot-splash → obd2-kiosk → overlay-enable
- obd2-kiosk ロール: X11 + Electron キオスク、BlueZ 有効、NetworkManager 有効

## 実装フェーズ

1. ~~プロジェクト骨格 + Electron + React + ビルド環境~~ ✅
2. ~~OBD2 データ層 + スタブシミュレーター~~ ✅
3. ~~パネル描画（数値・メーター・グラフ）~~ ✅
4. ~~Torque テーマ読込・描画~~ ✅
5. ~~ボード・レイアウト管理 + フリック切替~~ ✅
6. ~~設定画面（BT/WiFi/ボード編集）~~ ✅
7. Ansible セットアップ + overlay 対応

## ビルド・実行

```bash
npm run dev           # Vite 開発サーバー
npm run electron:dev  # Electron + Vite 同時起動（開発）
npm run build         # プロダクションビルド
npm run package       # Electron パッケージング (Linux ARM64)
```

**注意:** `electron/` 配下の変更は Vite HMR では反映されない。`npm run electron:dev` の再起動が必要。

## コーディング規約

- Sonix2 のパターンを踏襲（IPC、preload、ストア構成）
- preload で contextBridge を使用し、renderer から Node.js API を直接使用しない
- センサー追加を考慮し、データソースを抽象化（現時点は OBD2 のみ）
- Canvas 描画は純粋関数（`renderMeter()`, `renderGraph()`）、コンポーネントから分離
- テーマ設定は parser で変換し、各コンポーネントで `currentThemeId ? themeConfig : defaultConfig` で切替
