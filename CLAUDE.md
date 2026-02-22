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

- `components/DashboardScreen.tsx` - メイン画面（フルスクリーンボード + タップゾーンナビ + 接続ドットオーバーレイ）
- `components/settings/SystemSettingsScreen.tsx` - システム設定（接続・BT・WiFi・システム情報・アクション）
- `components/settings/DisplaySettingsScreen.tsx` - 表示設定（テーマ・ボード編集）
- `components/settings/DevSettingsScreen.tsx` - 開発設定（スタブシミュレーター）
- `components/boards/BoardContainer.tsx` - ボード切替コンテナ（スワイプ + キーボード）
- `components/boards/BoardView.tsx` - CSS Grid ボードビュー
- `components/boards/useSwipe.ts` - タッチスワイプ検出フック
- `components/panels/PanelSlot.tsx` - パネル種別ルーティング + スロットオーバーライド適用
- `components/panels/NumericPanel.tsx` - 数値パネル（HTML、等幅桁表示）
- `components/panels/MeterPanel.tsx` - メーターパネル（Canvas）
- `components/panels/GraphPanel.tsx` - グラフパネル（Canvas、TimeBuffer）
- `components/panels/useCanvasSize.ts` - ResizeObserver + devicePixelRatio フック
- `components/settings/BoardEditSection.tsx` - ボード編集（追加・削除・名前変更・レイアウト変更・パネル割当・詳細設定）
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
- **Layout** - レイアウト（CSS Grid 定義: columns, rows, gap, cells）— プリセット7種
- **PanelDef** - パネル定義（`id`, `kind`, `config` — PID 非依存の表示テンプレート）
- **PanelKind** - `'numeric' | 'meter' | 'graph'`

データソース（PID）と表示形式（PanelDef）は分離されており、任意の組み合わせが可能。

### プリセットレイアウト

| ID | 名前 | スロット数 | 構成 |
|---|---|---|---|
| `default` | Default | 5 | 2大 + 1横長 + 2小 |
| `detail` | 1+4+Wide | 6 | 1大 + 4小 + 1横長 |
| `quad` | 2x2 | 4 | 4等分 |
| `big1` | 1+3 | 4 | 1大 + 1横長 + 2小 |
| `grid6` | 3x2 | 6 | 6等分 |
| `wide-top` | Wide+4 | 3 | 1横長 + 2大 |
| `single` | Single | 1 | フルスクリーン1枚 |

### ボード管理

`useBoardStore` で管理:
- `addBoard` / `removeBoard` / `renameBoard` — ボード追加・削除・名前変更
- `changeBoardLayout` — レイアウト変更（パネル配列を自動リサイズ: 既存保持、不足分は null）
- `nextBoard` / `prevBoard` — キー/スワイプでのボード切替

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
- 固定 em 値ではなくフォントごとに実測が必要（フォントにより桁幅が大きく異なる）

**テーマフォントのロードタイミング:**
- `useThemeStore.applyTheme()` はテーマ設定を `fontLoaded: false` で即座に反映
- `FontFace.load()` の Promise 完了後に `set({ fontLoaded: true })` で更新
- NumericPanel の `useDigitWidth` は `document.fonts.ready` 後に再測定
- 同期的に `fontLoaded = true` にすると、フォント未ロード時の幅で測定されて数字が重なるバグが起きる

### UI 構成

**ダッシュボード画面:**
- ヘッダーなし、フルスクリーンボード表示、起動時自動接続
- 接続状態ドット: 右上にオーバーレイ（pointer-events-none）
- ボード切替: 左右フリック / 左右キー、インジケータドット表示
- タップゾーンナビ（角100x100px）: 右上→システム設定、右下→表示設定、左下→開発設定

**システム設定画面（右上タップ）:**
- OBD2 接続（状態、接続/切断、STUB モード表示）
- Bluetooth（スキャン・ペアリング）
- WiFi（スキャン・接続）
- System（ホスト名、CPU、メモリ、稼働時間）
- System Actions（Save Config・Reboot・Shutdown）

**表示設定画面（右下タップ）:**
- Theme（スクリーンショット付きテーマ選択）
- Board Editor（ボード追加/削除/名前変更、レイアウト選択+ミニプレビュー、スロット毎の表示種別・PID・詳細設定）

**開発設定画面（左下タップ）:**
- Stub Simulator（プロファイル切替、PID ベース値スライダー）

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
- BoardView の CSS Grid セルは `key={boardId-layoutId-index}` でボード/レイアウト切替時に DOM を再生成（`key={i}` だと前レイアウトの gridRow/gridColumn スタイルが残るバグ）

## TODO / 未解決事項

### Torque テーマ座標系の正確な仕様確認

**状況:** Torque の properties.txt における半径系プロパティの座標系が不明。公式 Wiki (https://wiki.torque-bhp.com/view/Themes) が 503 で確認できなかった（2026-02-23 時点）。

**暫定対応:** `theme-parser.ts` で `TORQUE_RADIUS_SCALE = 0.65` の変換係数を適用中。red-sport テーマのスクリーンショットとの目視比較で近似的に合う値。

**対象プロパティ:**
- `globalTextRadius` — 目盛り数値の配置半径（red-sport: 0.85 → 0.55 で合う）
- `dialTickInnerRadius` / `dialTickOuterRadius` — 目盛り線の内径/外径（red-sport: 1.50/1.55）
- `dialNeedleLength` — 針の長さ（red-sport: 1.20）

**未対応:**
- 針の描画仕様が Torque と異なる（形状・サイズ比の解釈が不明）

**アクション:** Torque Wiki が復活したら正確な座標系を確認し、`TORQUE_RADIUS_SCALE` と針の描画ロジックを修正する
