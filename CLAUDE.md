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

- `main.ts` - Electron 初期化、IPC ハンドラ、システム操作、自動接続、USB マウント、SIGINT/SIGTERM クリーンアップ
- `logger.ts` - リングバッファ方式ログモジュール（max 500 エントリ、USB 書出し対応）
- `preload.ts` - contextBridge によるセキュア IPC
- `obd/data-source.ts` - DataSource 抽象インターフェース（`connect(devicePath?)` でデバイスパス指定）
- `obd/stub-source.ts` - スタブデータソース（開発用シミュレーター）
- `obd/elm327-source.ts` - ELM327 データソース（実機用、任意のシリアルデバイスパスに対応）
- `obd/pids.ts` - PID 定義テーブル（名前、単位、計算式、min/max）
- `themes/theme-loader.ts` - テーマディレクトリのスキャン・読込（複数ディレクトリ対応、USB テーマ `usb:` プレフィックス）
- `bluetooth/bluetooth-manager.ts` - BT スキャン・ペアリング・接続・rfcomm bind（bluetoothctl ラッパー）
- `network/wifi-manager.ts` - WiFi スキャン・接続（nmcli ラッパー）
- `gpio/gpio-manager.ts` - GPIO 監視（gpiomon/gpioget/gpioset ラッパー、edge 検出、デバウンス 50ms、非対応環境ではスタブ）

### React レンダラ (`src/`)

- `components/DashboardScreen.tsx` - メイン画面（フルスクリーンボード + 左上タップでメニュー + 接続ドットオーバーレイ）
- `components/settings/SystemSettingsScreen.tsx` - システム設定（WiFi・USB・GPIO・システム情報・アクション）
- `components/settings/BluetoothScreen.tsx` - Bluetooth 設定画面（スキャン・ペアリング・rfcomm bind）
- `components/settings/OBD2Screen.tsx` - OBD2 接続画面（シリアルデバイス選択・Simulator・接続/切断）
- `components/settings/DisplaySettingsScreen.tsx` - 表示設定（テーマ・ボード編集）
- `components/settings/DevSettingsScreen.tsx` - 開発設定（スタブシミュレーター、ログビューア）
- `components/boards/BoardContainer.tsx` - ボード切替コンテナ（スワイプ + キーボード）
- `components/MenuScreen.tsx` - 3x3 メニュー画面（Bluetooth・OBD2・各設定画面への遷移）
- `components/boards/BoardView.tsx` - 64x36 グリッド absolute positioning ボードビュー
- `components/boards/useSwipe.ts` - タッチスワイプ検出フック
- `components/panels/PanelSlot.tsx` - パネル種別ルーティング + スロットオーバーライド適用
- `components/panels/NumericPanel.tsx` - 数値パネル（HTML、等幅桁表示）
- `components/panels/MeterPanel.tsx` - メーターパネル（Canvas）
- `components/panels/GraphPanel.tsx` - グラフパネル（Canvas、TimeBuffer）
- `components/panels/useCanvasSize.ts` - ResizeObserver + devicePixelRatio フック
- `components/settings/BoardEditSection.tsx` - ボード編集（追加・削除・名前変更・レイアウト変更・パネル割当・詳細設定）
- `components/settings/BluetoothSection.tsx` - BT 設定（スキャン・ペアリング）
- `components/settings/WiFiSection.tsx` - WiFi 設定
- `components/settings/UsbSection.tsx` - USB メモリ（検出・マウント・設定エクスポート/インポート）
- `components/settings/GpioSection.tsx` - GPIO 設定（イルミ・リバース ピン/論理/テーマ/ボード選択、USB リセットピン）
- `components/settings/LogSection.tsx` - ログビューア（フィルター、自動スクロール、2秒ポーリング）
- `components/settings/LayoutEditorScreen.tsx` - レイアウトエディタ（64x36 グリッド、スロット追加/削除/位置変更/z-order）
- `components/settings/ThemeSection.tsx` - テーマ選択（スクリーンショット付き）
- `components/settings/ThemeEditorScreen.tsx` - テーマエディタ（プロパティ編集・プレビュー・アセット管理・テーマ CRUD）
- `canvas/meter-renderer.ts` - メーター Canvas 描画（純粋関数）
- `canvas/graph-renderer.ts` - グラフ Canvas 描画（純粋関数）
- `canvas/time-buffer.ts` - 時系列循環バッファ（maxSize=300、PID 別共有バッファ）
- `canvas/theme-parser.ts` - Torque properties → MeterConfig(needle/arc)/NumericConfig/GraphConfig 変換
- `canvas/mono-text.ts` - Canvas 等幅数字描画ヘルパー
- `stores/useAppStore.ts` - アプリ状態（画面、ホスト名、システム情報）
- `stores/useOBDStore.ts` - OBD2 データ状態（接続、値、PID 情報）
- `stores/hydration.ts` - `waitForHydration(store)` ユーティリティ（Zustand persist 非同期ハイドレーション待ち）
- `stores/useBoardStore.ts` - ボード・レイアウト・パネル定義管理
- `stores/useThemeStore.ts` - テーマ状態（設定、アセット URL、フォント）
- `stores/useGpioStore.ts` - GPIO 状態（ピン設定、アクティブ論理、イルミ/リバース連動設定、USB リセットピン）
- `config/defaults.ts` - デフォルト設定（メーター・グラフ・数値・レイアウト・ボード）
- `types/index.ts` - 全型定義

### データモデル

- **Board** - ボード（名前、レイアウト参照、`panels: (BoardSlot | null)[]`）
- **BoardSlot** - スロット（`panelDefId` 表示テンプレート + `pid` データソース + オーバーライド）
- **Layout** - レイアウト（`slots: LayoutSlot[]` — 64x36 グリッド上の自由配置）
- **LayoutSlot** - スロット位置・サイズ（`x`, `y`, `w`, `h` — 64x36 グリッド座標）
- **PanelDef** - パネル定義（`id`, `kind`, `config` — PID 非依存の表示テンプレート）
- **PanelKind** - `'numeric' | 'meter' | 'graph'`
- **MeterType** - `'needle' | 'arc'`（MeterConfig 内で指定）

データソース（PID）と表示形式（PanelDef）は分離されており、任意の組み合わせが可能。
メーターは2種類: needle（回転針）と arc（プログレスリング）。PanelDef `meter` = needle、`meter-arc` = arc。

### レイアウトシステム

64x36 グリッド（16:9）による自由配置。レイアウトはユーザーが作成・編集可能。

- グリッド: 64 列 x 36 行（各セルが均等）
- スロット: `{ x, y, w, h }` で位置とサイズを指定
- z-order: `slots` 配列の順序（後が上）
- 描画: absolute positioning（`left/top/width/height` を % で計算）

**デフォルトレイアウト（7種）:**

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
- `addLayout` / `removeLayout` / `updateLayout` / `duplicateLayout` — レイアウト CRUD
- `addLayoutSlot` / `removeLayoutSlot` / `updateLayoutSlot` / `reorderLayoutSlot` — スロット操作

### BoardSlot オーバーライド

各スロットで PID デフォルト値を上書き可能:
- `title` / `unit` - 表示名・単位
- `min` / `max` - メーター・グラフの範囲（例: 速度 0-240）
- `decimals` - 小数点桁数（数値・メーター）
- `step` - メーター目盛り分割数
- `timeWindowMs` - グラフ時間窓

PanelSlot.tsx でフォールバックチェーン: スロットオーバーライド → PID デフォルト → ハードコード値

### OBD2 通信

- Bluetooth SPP または USB シリアル（ELM327）
- `bluetoothctl` でスキャン・ペアリング・接続（`electron/bluetooth/bluetooth-manager.ts`）
- シリアルデバイス（`/dev/rfcomm*`, `/dev/ttyUSB*`, `/dev/ttyACM*`, `/dev/ttyS*`）→ fs.openSync/readSync/writeSync でデータ通信
- 表示中ボードの使用 PID のみポーリング（優先度付き）
- 起動時自動接続（既に接続済みならスキップ、`cancelled` フラグで StrictMode 二重呼出し防止）
- `sudo rfcomm bind` は Bluetooth 画面（`BluetoothManager.rfcommBind()`）で実行、`sudo chown` で所有権変更
- OBD2 画面でデバイス選択 → 接続、Simulator も選択可能
- IPC `obd-connect` / `obd-connect-stub` は fire-and-forget（接続進捗は `obd-connection-change` IPC イベントで通知）
- 接続エラー時、`usbResetPin` が設定されていれば GPIO で USB 電源リセット（1秒 LOW → HIGH）→ 2秒待ち → 自動再接続（1回のみ、成功でリセット）

**ELM327 シリアルポートライフサイクル:**
```
open (O_RDWR | O_NONBLOCK)
  → stty (stdin に fd を渡す、-hupcl clocal)
  → close + re-open (O_NONBLOCK 復元)
  → elmInit → pollLoop
  → cleanup (close、hupcl 復元なし)
  → dispose 時のみ stty hupcl -clocal → close (DTR drop で ELM327 リセット)
```

**重要な設計判断:**
- **O_NONBLOCK**: `fs.readSync` が Node.js イベントループをブロックしないために必須。ttyACM ではキャリア検出待ちも回避
- **stty は stdin 経由**: `stty -F <path>` はデバイスを内部で open するため ttyACM でブロックする。代わりに `execFileSync('stty', [...], { stdio: [this.fd, 'pipe', 'pipe'] })` で既存 fd を stdin として渡す
- **stty 後の re-open**: `execFileSync` が子プロセスに fd を渡すと O_NONBLOCK フラグがクリアされる。stty 後に close → re-open で O_NONBLOCK を復元
- **`-hupcl clocal`**: 通常 close 時に DTR を落とさない（ELM327 がリセットされず再接続が速い）
- **`hupcl -clocal` の復元は `dispose()` のみ**: プログラム終了時に DTR を落として ELM327 をリセット。これにより `screen` 等の他プログラムから正常にアクセス可能
- **SIGINT/SIGTERM ハンドラ**: `main.ts` で `process.on('SIGINT'/'SIGTERM')` → `cleanupAndQuit()` → `dataSource.dispose()` で確実に DTR リセット

**generation カウンターパターン:**
- `connect()` のたびに `++this.generation` でインクリメント
- 全非同期操作（`elmInit`, `sendCommand`, `drainUntilQuiet`, `pollLoop`）が `gen` 引数を受け取り、`gen !== this.generation` で中断
- `disconnect()` / `dispose()` も `generation++` で進行中の操作を無効化
- 同一 ELM327Source インスタンスの再利用時に、古い非同期操作が新しい接続の fd を汚染するのを防止

**OBD2 接続の二重接続防止:**
- main プロセス側: `obd-connect` ハンドラが `dataSource.getState() !== 'disconnected'` のとき先に `disconnect()` してから接続
- renderer 側: `obdGetState()` で現在の状態を確認し、`disconnected` か `error` のときだけ `obdConnect()` を呼ぶ
- 画面遷移（ダッシュボード → 設定 → ダッシュボード）中に接続中（`connecting`）であればスキップされ二重接続にならない

### Torque テーマ

テーマ配置: `themes/<テーマ名>/` ディレクトリ（APK から展開済み）

**テーマディレクトリ構成:**
```
themes/<theme-name>/
├── properties.txt           # Java properties 形式 (key=value, # コメント)
├── dial_background.png      # 480x480 RGBA メーター背景
├── needle.png               # 480x480 RGBA 針画像 (12時方向、オプション)
├── display_background.png   # 480x480 RGBA 数値表示背景
├── background.jpg           # ダッシュボード全体背景 (任意サイズ)
├── font.ttf                 # カスタムフォント (オプション)
└── screenshot.png           # プレビュー画像
```

**同梱テーマ:** `themes/red-sport/`, `themes/blue-orange/`

**properties.txt の主要プロパティ (実データ確認済み):**
- `globalDialStartAngle` / `globalDialStopAngle` - 6時方向基準の除外角度
- `dialStartAngle_<pid>` / `dialStopAngle_<pid>` - PID別角度オーバーライド
- `dialTickInnerRadius` / `dialTickOuterRadius` - 目盛り線の内径/外径 (倍率、ティック位置)
- `dialNeedleLength` / `dialNeedleSizeRatio` / `dialNeedleColour` - 針の長さ/太さ/色
- `dialNeedleValueFontScale` - needle メーターの値フォントスケール
- `dialNeedleTitleTextOffset` / `dialNeedleValueTextOffset` / `dialNeedleUnitTextOffset` - needle テキスト位置オフセット
- `dialMeterValueOuterRadius` / `dialMeterValueThickness` - arc メーターのバリューアーク外径/太さ
- `dialMeterValueFontScale` - arc メーターの値フォントスケール
- `dialMeterTitleTextOffset` / `dialMeterValueTextOffset` / `dialMeterUnitTextOffset` - arc テキスト位置オフセット
- `globalFontScale` - 全体フォントスケール
- `globalTextRadius` - スケール数値の配置半径 (倍率)
- `globalHideTicks` / `hideTicks_<pid>` - 目盛り非表示フラグ
- `displayTextValueColour` / `displayTextTitleColour` - テキスト色 (#RRGGBB or #AARRGGBB)
- `displayTickColour` / `displayIndicatorColour` - 目盛り/インジケータ色
- `graphLineColour` - グラフ線色（なければ `displayTextValueColour` にフォールバック）

**テーマ適用範囲:**
- メーター (needle): 背景画像、角度、目盛り、針、テキスト色・位置、フォント
- メーター (arc): 背景画像、角度、目盛り、バリューアーク（プログレスリング）、テキスト色・位置、フォント
- 数値パネル: 背景画像、テキスト色、フォント
- グラフ: 背景画像（`display_background.png`）、線色・塗り色（`graphLineColour` → `displayTextValueColour` → デフォルト）、テキスト色
- ダッシュボード: 全体背景画像

**Canvas レイヤー合成順 (meter-renderer.ts):**
1. `dial_background.png` (480x480 をパネルサイズにスケーリング)
2. 目盛り線 (テーマ背景がある場合はスキップ — 背景画像に含まれるため)
3. スケール数値 (min〜max, textRadius に沿って配置 — 常に表示)
4. meterType 分岐:
   - **needle**: 針 (`needle.png` がある場合は画像を回転描画、なければ三角形 + 中心ドット)
   - **arc**: バリューアーク（arcInnerRadius〜arcOuterRadius 間の円弧塗りつぶし）
5. テキスト (タイトル、値（valueFontScale 適用）、単位 - オフセット付き)

**針画像 (needle.png):**
- 480x480 RGBA、12時方向（上向き）に針を描画した画像
- 回転中心 = 画像中心（メーターの中心に合わせてスケーリング・回転）
- needle.png がない場合は従来の三角形 + 中心ドットで描画

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
- 左上タップゾーン（100x100px）→ メニュー画面

**メニュー画面（3x3 グリッド）:**
- Bluetooth / OBD2 / Display Settings / Layout Editor / Theme Editor / System Settings / Dev Settings
- 背景タップでダッシュボードに戻る

**Bluetooth 画面:**
- BT デバイススキャン・ペアリング
- ペアリング成功後に即座に `rfcomm bind` → `/dev/rfcommN` 作成
- Back ボタンでメニューに戻る

**OBD2 画面:**
- シリアルデバイス一覧（`/dev/rfcomm*`, `/dev/ttyUSB*`, `/dev/ttyACM*`, `/dev/ttyS*`）
- 各デバイスに Connect/Disconnect ボタン
- Simulator（スタブ接続）も選択可能
- 接続成功 → `obdDevicePath` に保存（起動時自動接続に使用）
- Refresh ボタンでデバイス再スキャン

**テーマエディタ画面:**
- 左半分: プレビュー（テーマ選択、PID/パネル種別切替（Meter Needle/Arc/Graph/Numeric）、Canvas プレビュー、値スライダー、テーマ CRUD）
- 右半分: プロパティエディタ（角度・ティック・スケールテキスト・Needle・Arc・色・フォント）+ アセット管理
- プレビューは `renderMeter()` / `renderGraph()` を直接呼び出し、`useThemeStore` を使わない
- エディタ専用フォント `ThemeEditorFont` でダッシュボードの `TorqueThemeFont` と共存
- PID 選択時は PID 別プロパティを表示、未設定なら Global 値をプレースホルダー表示
- 未保存変更の dirty 検出 + テーマ切替・画面離脱時の確認ダイアログ

**システム設定画面（右上タップ）:**
- WiFi（スキャン・接続）
- USB Memory（検出・マウント/アンマウント・設定エクスポート/インポート）
- GPIO（イルミ: ピン・テーマ選択・状態表示、リバース: ピン・ボード選択・状態表示）
- System（ホスト名、CPU、メモリ、稼働時間）
- System Actions（Save Config・Save Logs（USB マウント時）・Reboot・Shutdown）

**表示設定画面（右下タップ）:**
- Theme（スクリーンショット付きテーマ選択）
- Board Editor（ボード追加/削除/名前変更、レイアウト選択+ミニプレビュー、スロット毎の表示種別・PID・詳細設定）

**開発設定画面（左下タップ）:**
- Stub Simulator（プロファイル切替、PID ベース値スライダー）
- Logs（リングバッファのログ表示、フィルター、自動スクロール、2秒ポーリング）

### 設定永続化 (localStorage)

Zustand `persist` ミドルウェアで以下を永続化:

| ストア | storage key | 永続化する状態 | 永続化しない状態 |
|---|---|---|---|
| `useBoardStore` | `obd2-boards` (v2) | `boards`, `layouts`, `currentBoardId`, `screenPadding` | `panelDefs`（静的デフォルト） |
| `useThemeStore` | `obd2-theme` | `currentThemeId` | テーマデータ・派生状態（base64 が巨大） |
| `useOBDStore` | `obd2-bt` | `obdDevicePath` | 接続状態・ライブデータ |
| `useGpioStore` | `obd2-gpio` | `illuminationPin`, `reversePin`, `illuminationThemeId`, `reverseBoardId`, `usbResetPin`, `illuminationActiveHigh`, `reverseActiveHigh` | `illuminationActive`, `reverseActive`（ランタイム） |
| `useAppStore` | — | なし | 全て（ランタイム情報） |

- テーマは `currentThemeId` のみ保存し、起動時に `App.tsx` で `themeLoad()` → `applyTheme()` でファイルから再ロード
- `partialize` で保存対象を限定（巨大な base64 データや静的定義を除外）

**Zustand persist ハイドレーション:**
- `persist` ミドルウェアは非同期で localStorage から復元する
- コンポーネントの `useEffect` が復元前に実行されると初期値（null）を読んでしまう
- `waitForHydration(store)` で `hasHydrated()` / `onFinishHydration()` を使い、復元完了後に `getState()` で読む
- `DashboardScreen`: ハイドレーション後に `obdDevicePath` を取得して自動接続（`cancelled` フラグで StrictMode 二重防止）
- `App.tsx`: ハイドレーション後に `currentThemeId` を取得してテーマ復元

### Bluetooth スキャン

`bluetooth-manager.ts` で `bluetoothctl` をインタラクティブモードで起動:
1. `spawn('bluetoothctl', [], { stdio: ['pipe', 'ignore', 'ignore'] })`
2. stdin に `scan on\n` を送信 → 8秒待機（デバイス発見期間）
3. `scan off\n` → stdin 閉じ → プロセス終了待ち（最大3秒）
4. `bluetoothctl devices` で発見済みデバイス一覧を取得

**注意:** `bluetoothctl` に引数 `scan on` を渡して spawn すると、stdin が閉じられた時点で即終了するため、スキャン時間が確保できない。

### USB メモリ

sonix2 の USB マウントパターンを踏襲:
- `lsblk -J -o NAME,SIZE,TYPE,MOUNTPOINT,TRAN,RM` で USB パーティション検出（`tran === 'usb'` + `rm` でフィルタ）
- マウントポイント: `/mnt/obd2-usb`（vfat、uid/gid 付き）
- デバイスパスバリデーション: `/^\/dev\/sd[a-z]\d+$/`

**USB ファイル構成:**
```
/mnt/obd2-usb/
├── obd2-config.json          # 設定エクスポート/インポート
└── themes/                   # USB テーマディレクトリ
    └── my-custom-theme/
        ├── properties.txt
        └── ...
```

**設定エクスポート/インポート:**
- `obd2-config.json` に `{ version: 2, boards, layouts, currentBoardId, screenPadding, currentThemeId }` を保存
- インポート時は v1（layouts なし）と v2（layouts あり）の両方を処理
- テーマ ID が変わっていれば `themeLoad()` → `applyTheme()` / `clearTheme()`

**USB テーマ:**
- `theme-loader.ts` の `scanThemes(extraDirs?)` / `loadTheme(themeId, extraDirs?)` で複数ディレクトリ対応
- USB テーマの ID は `usb:<name>` プレフィックスで内蔵テーマと区別
- USB マウント中は `theme-list` / `theme-load` が USB `themes/` も対象に追加
- USB アンマウント後は USB テーマへの参照が解決不能になる（clearTheme が必要）

**IPC ハンドラ:**
- `detect-usb` — USB デバイス一覧
- `mount-usb` / `unmount-usb` — マウント/アンマウント
- `usb-export-config` / `usb-import-config` — 設定の読み書き
- `obd-connect` — OBD2 接続（`devicePath?: string` — デバイスパス指定で ELM327、なしで現行モード）
- `obd-connect-stub` — 強制スタブモード接続（既存接続を切断して切替）
- `serial-scan` — シリアルデバイス一覧（`/dev/rfcomm*`, `/dev/ttyUSB*`, `/dev/ttyACM*`, `/dev/ttyS*`）
- `bt-rfcomm-bind` — Bluetooth rfcomm bind（ペアリング済みデバイスの `/dev/rfcommN` 作成）
- `get-logs` — ログエントリ一覧取得
- `save-logs-usb` — USB マウントポイントにログファイル書出し
- `log-settings` — renderer からの設定情報をログに記録
- `is-usb-mounted` — USB マウント状態取得
- `gpio-setup(pins)` — GPIO ピン監視開始（入力、gpiomon）
- `gpio-read(pin)` — GPIO ピン現在値取得（gpioget）
- `gpio-set(pin, value)` — GPIO ピン出力（gpioset）
- `gpio-usb-reset(pin)` — USB 電源リセット（1秒 LOW → HIGH）
- `gpio-change` イベント（main → renderer）— GPIO 変化通知
- `theme-get-dirs` — 書込可能テーマディレクトリ一覧
- `theme-create(name, targetDir?)` — 新規テーマ作成
- `theme-duplicate(sourceId, newName)` — テーマ複製
- `theme-delete(themeId)` — テーマ削除
- `theme-rename(themeId, newName)` — テーマ名変更
- `theme-save-properties(themeId, properties)` — properties.txt 上書き保存
- `theme-pick-file(filters)` — ファイル選択ダイアログ
- `theme-copy-asset(themeId, sourcePath, assetName)` — アセットコピー
- `theme-delete-asset(themeId, assetName)` — アセット削除

### GPIO 連動

車両信号（フォトカプラ経由 12V→3.3V）を GPIO で読み取り、表示を自動切替:

- **イルミ（スモールライト）:** ON → 指定テーマに切替、OFF → 元テーマに復帰
- **リバース（バックギア）:** ON → 指定ボードに切替、OFF → 元ボードに復帰
- **USB リセット:** ELM327 接続エラー時に USB 電源線を GPIO で制御してデバイスをリセット

`gpiomon` (libgpiod v2) で edge 検出（デバウンス 50ms）、`gpioget` で現在値読み取り、`gpioset` で出力制御。`gpiochip0` を使用。`gpiomon` が存在しない環境（開発 Mac 等）では警告ログのみでスタブ動作。

**注意:**
- `onoff` パッケージ（sysfs ベース）はカーネル 6.12 で `EINVAL` エラーが発生するため不使用
- **libgpiod v2 の `gpioset` はプロセスが終了するとライン状態が解放される**ため、値を維持するにはプロセスを生かし続ける必要がある。`execSync` で呼ぶと永久ブロックになるので **`spawn` でプロセスを管理**し、ピンごとに保持。値変更時は前のプロセスを kill → 新プロセス spawn

**アクティブ論理設定:**
- イルミ・リバースそれぞれに `activeHigh: boolean`（デフォルト: `true`）を設定可能
- **Active HIGH** (`true`): GPIO HIGH = ON（エミッタフォロワ等の非反転回路）
- **Active LOW** (`false`): GPIO LOW = ON（オープンコレクタ + プルアップ構成のフォトカプラ）
- 設定画面の Logic ドロップダウンで切替

**USB リセット:**
- USB ケーブルの電源線にスイッチが付いており、GPIO ピン（デフォルト: 26）で制御
- 通常 HIGH、リセット時 1秒 LOW → HIGH でデバイスがリセットされる
- ELM327 接続エラー（"No prompt from ELM327" 等）時に自動実行
- `usbResetAttempted` ref で1回のみに制限（接続成功でリセット、次のエラーで再リトライ可能）
- 起動時に `gpioSet(pin, 1)` で HIGH 初期化

設定画面でピン番号（GPIO 4〜27）・アクティブ論理・連動先テーマ/ボードを選択可能、`useGpioStore` で永続化。

### OBD データフローとグラフ履歴

```
DataSource (main) → obd-data IPC → useOBDStore.updateValues()
                                      ├→ currentValues[pid] 更新（最新値）
                                      └→ getSharedBuffer(pid).push()（時系列蓄積）
                                           ↓
                                    GraphPanel は buffer.getWindow() で読み取りのみ
```

- `TimeBuffer` は PID ごとにモジュールスコープの `Map` で保持（`getSharedBuffer(pid)`）
- ボード切替で GraphPanel がアンマウントされてもバッファは消えない
- 全 PID のデータが常にバッファに蓄積されるため、非表示ボードのグラフも履歴を保持
- ボードに戻ったとき、不在期間のデータも含めてグラフが即座に再描画される

### CSP (Content Security Policy)

`index.html` で設定:
- `img-src 'self' data:` — テーマ画像（base64 data URL）を許可
- `font-src 'self' data:` — テーマフォント（base64 data URL）を許可

## 画面・ハードウェア

- 基準: 1024 x 600、対象: 640x480 〜 1920x1080
- HDMI + USB タッチパネル
- タッチ操作: フリックでボード切替、設定画面操作
- ロギング: `electron/logger.ts` リングバッファ（max 500）、USB メモリに書出し可能

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

**ウィンドウサイズ指定:** `--window-size=W,H` で開発時のウィンドウサイズを変更可能（デフォルト: 1024x600）
```bash
npm run electron -- --window-size=1024,576
```

**注意:** `electron/` 配下の変更は Vite HMR では反映されない。`npm run electron:dev` の再起動が必要。

## コーディング規約

- Sonix2 のパターンを踏襲（IPC、preload、ストア構成）
- preload で contextBridge を使用し、renderer から Node.js API を直接使用しない
- センサー追加を考慮し、データソースを抽象化（現時点は OBD2 のみ）
- Canvas 描画は純粋関数（`renderMeter()`, `renderGraph()`）、コンポーネントから分離
- テーマ設定は parser で変換し、`useThemeStore` に `themeMeterNeedleConfig` / `themeMeterArcConfig` の2種類を保持。MeterPanel は `config.meterType` で切替
- BoardView の CSS Grid セルは `key={boardId-layoutId-index}` でボード/レイアウト切替時に DOM を再生成（`key={i}` だと前レイアウトの gridRow/gridColumn スタイルが残るバグ）
- `bluetoothctl` はインタラクティブシェルなので `stdio: 'ignore'` で spawn すると即終了する。stdin を pipe で開き、コマンドを書き込む方式にすること
- `/boot/firmware/config/save.sh` や `rfcomm bind`、`mount` など root 権限が必要な操作は `sudo` 付きで `execSync` する
- `console.log/error` は使わず `electron/logger.ts` の `logger.info/warn/error(tag, message)` を使用する
- `useEffect` 内の fire-and-forget Promise（`waitForHydration().then(...)` 等）には `cancelled` フラグを設け、cleanup で `cancelled = true` にする。React StrictMode が dev モードでコンポーネントを二重マウントするため、フラグなしだと副作用が2回実行される

## 開発ツール (`scripts/`)

- `scripts/obd2_capture.py` — ELM327 Bluetooth SPP 経由の OBD2 データ取得ツール（Python）
- Raspberry Pi 上で venv を使って実行（Mac では BT SPP 接続に問題あり）
- `bluetoothctl` でペアリング → `rfcomm bind` で `/dev/rfcomm0` 作成 → `--port /dev/rfcomm0` で接続
- 詳細は `scripts/README.md` 参照

## TODO / 未解決事項

### Torque テーマ座標系の正確な仕様確認

**状況:** Torque の properties.txt における半径系プロパティの座標系が不明。公式 Wiki (https://wiki.torque-bhp.com/view/Themes) が 503 で確認できなかった（2026-02-23 時点）。

**暫定対応:** `theme-parser.ts` で `TORQUE_RADIUS_SCALE = 0.65` の変換係数を適用中。red-sport テーマのスクリーンショットとの目視比較で近似的に合う値。

**対象プロパティ:**
- `globalTextRadius` — 目盛り数値の配置半径（red-sport: 0.85 → 0.55 で合う）
- `dialTickInnerRadius` / `dialTickOuterRadius` — ティック位置の内径/外径（red-sport: 1.50/1.55）
- `dialMeterValueOuterRadius` / `dialMeterValueThickness` — arc メーターのバリューアーク
- `dialNeedleLength` — 針の長さ（red-sport: 1.20）

**未対応:**
- 針の描画仕様が Torque と異なる（形状・サイズ比の解釈が不明）

**アクション:** Torque Wiki が復活したら正確な座標系を確認し、`TORQUE_RADIUS_SCALE` と針の描画ロジックを修正する
