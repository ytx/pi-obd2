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
- **electron-store** (設定永続化)
- **Tailwind CSS** (スタイリング)
- **HTML5 Canvas** (メーター・グラフ描画)

## 参照プロジェクト

- `../Sonix/sonix2` - 同形式の Electron キオスクアプリ (React + Vite + Zustand + Tailwind)
- `../pi-setup/ansible/sonix-sc.yml` - Ansible セットアップのベース
- `../pi-setup/ansible/roles/config-persistence` - overlay FS 上の設定永続化

## アーキテクチャ

### Electron メインプロセス (`electron/`)

- `main.ts` - Electron 初期化、IPC ハンドラ、システム操作
- `preload.ts` - contextBridge によるセキュア IPC
- `obd/elm327.ts` - ELM327 AT コマンド・初期化シーケンス
- `obd/obd-protocol.ts` - OBD2 PID リクエスト・レスポンスデコード
- `obd/pids.ts` - PID 定義テーブル（名前、単位、計算式）
- `bluetooth.ts` - BlueZ D-Bus → SPP rfcomm 接続管理

### React レンダラ (`src/`)

- `components/boards/` - ボード切替コンテナ、ボードビュー
- `components/panels/` - 数値、メーター(Canvas)、グラフ(Canvas)
- `components/settings/` - BT/WiFi/ボード編集 設定画面
- `canvas/` - メーター・グラフ描画エンジン、Torque テーマローダー
- `stores/` - Zustand ストア（データ、ボード設定、接続状態）

### データモデル

- **Board** - ボード（名前、レイアウト参照、スロットごとのパネル割当）
- **Layout** - レイアウト（CSS Grid 定義、独立管理）
- **PanelDef** - パネル定義（種類、データソース、描画設定、独立管理）

### OBD2 通信

- Bluetooth SPP のみ（ELM327）
- BlueZ D-Bus API でスキャン・ペアリング・接続
- SPP rfcomm → serialport でデータ通信
- 表示中ボードの使用 PID のみポーリング（優先度付き）

### Torque テーマ

テーマソース: `themes/` に APK 形式で格納（`assets/themeN.zip` を展開して使用）

**テーマ ZIP の2パターン:**
- **自己完結型**: `properties.txt` + PNG画像 + フォント等 → これのみサポート
- **参照型**: `package.txt`（別APKパッケージ名）+ スクリーンショットのみ → 非対応

**自己完結型テーマの構成:**
```
theme.zip/
├── properties.txt           # Java properties 形式 (key=value, # コメント)
├── dial_background.png      # 480x480 RGBA メーター背景
├── display_background.png   # 480x480 RGBA 数値表示背景
├── background.jpg           # ダッシュボード全体背景 (任意サイズ)
├── font.ttf                 # カスタムフォント (オプション)
├── dial_background_XX.png   # PID別メーター背景 (オプション, XX=PID hex)
└── screenshot.png           # プレビュー画像
```

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
- `dialTickStyle` - 目盛りスタイル (0=デフォルト, 1=代替)
- `dialNeedleTitleTextOffset` / `dialNeedleValueTextOffset` / `dialNeedleUnitTextOffset` / `dialNeedleScaleTextOffset` - テキスト位置オフセット
- `logoHorizontalOffset` / `logoVerticalOffset` - ロゴ位置 (%)

**Canvas レイヤー合成順:**
1. `dial_background.png` (480x480 をパネルサイズにスケーリング)
2. 目盛り線 (Tick: innerRadius〜outerRadius, colour)
3. スケール数値 (min〜max, textRadius に沿って配置)
4. テキスト (タイトル、値、単位 - オフセット付き)
5. 針 (colour, length, sizeRatio で描画)

**角度システム:**
- 基準点 = 6時方向 (真下, 180°)
- startAngle/stopAngle = 真下からの除外角度
- 例: 両方45° → 360-45-45 = 270° の一般的な自動車メーター

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

1. プロジェクト骨格 + Electron + React + ビルド環境
2. ELM327 Bluetooth 接続 + OBD2 PID 取得
3. パネル描画（数値 → メーター → グラフ）
4. Torque テーマ読込・描画
5. ボード・レイアウト管理 + フリック切替
6. 設定画面（BT/WiFi/ボード編集）
7. Ansible セットアップ + overlay 対応

## ビルド・実行

```bash
npm run dev           # Vite 開発サーバー
npm run electron:dev  # Electron + Vite 同時起動（開発）
npm run build         # プロダクションビルド
npm run package       # Electron パッケージング (Linux ARM64)
```

## コーディング規約

- Sonix2 のパターンを踏襲（IPC、preload、ストア構成）
- preload で contextBridge を使用し、renderer から Node.js API を直接使用しない
- センサー追加を考慮し、データソースを抽象化（現時点は OBD2 のみ）
