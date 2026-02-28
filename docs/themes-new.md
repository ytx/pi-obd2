# テーマ仕様 (Extended)

Torque テーマ仕様をベースに、本プロジェクト用に整理・拡張した仕様。

参照: [Torque Wiki - Themes](https://wiki.torque-bhp.com/view/Themes)

## スコープ

| レイヤー | 説明 | キー規則 |
|---|---|---|
| **Theme** | テーマ全体に紐づく設定・ファイル | 固有名 |
| **Global** | 全 PID 共通のデフォルト値 | `global` プレフィックス or `_<pid>` なし |
| **PID** | 特定 PID のオーバーライド | Global キーから `global` を除去 + 先頭小文字 + `_<pid>` |

PID キーの `<pid>` は OBD PID バイトの**小文字 hex**（モードバイト除去）。
例: Speed = OBD `010D` → Torque PID `0d`

**フォールバック:** PID → Global → デフォルト値

---

## 1. Theme（テーマ固有）

テーマ自体に紐づく設定とファイル。PID スコープなし。

### プロパティ

| キー | 型 | 説明 |
|---|---|---|
| `themeName` | string | テーマ表示名 |

### ファイル

| ファイル | 必須 | 説明 |
|---|---|---|
| `properties.txt` | Yes | Key=Value 設定ファイル（`#` コメント行） |
| `font.ttf` | No | カスタムフォント（全テキストに適用） |
| `valueFont.ttf` | No | 値表示専用フォント（`font.ttf` より優先） |
| `background.jpg` | No | ダッシュボード全体背景（任意サイズ） |
| `screenshot.png` | No | テーマ選択画面用プレビュー画像 |

---

## 2. Global / PID プロパティ

### 2.1 角度

メーターの描画範囲を決定する。基準点 = 6時方向（真下）。

| Global キー | PID キー | 型 | 範囲 | デフォルト | 説明 |
|---|---|---|---|---|---|
| `globalDialStartAngle` | `dialStartAngle_<pid>` | float | 0–180 | 45 | 真下からの除外角度（左側） |
| `globalDialStopAngle` | `dialStopAngle_<pid>` | float | 0–180 | 45 | 真下からの除外角度（右側） |

有効角度 = 360 - startAngle - stopAngle（例: 45/45 → 270° の一般的なメーター）

### 2.2 半径

ダイアル内の要素の配置位置。Torque 内部ベース半径に対する倍率。

| Global キー | PID キー | 型 | デフォルト | 説明 |
|---|---|---|---|---|
| `globalTextRadius` | `textRadius_<pid>` | float | 0.85 | スケール数値の配置半径 |
| `dialTickInnerRadius` | — | float | 1.50 | 目盛り線の内径 |
| `dialTickOuterRadius` | — | float | 1.55 | 目盛り線の外径 |
| `dialNeedleLength` | — | float | 1.20 | 針の長さ |
| `dialNeedleSizeRatio` | — | float | 0.03 | 針の太さ比率 |
| `dialMeterValueOuterRadius` | — | float | 1.0 | Meter 型インジケータ半径 |

**座標変換:** `Torque値 × 0.65 ≈ Canvas半径に対する倍率`（暫定係数）

### 2.3 色

フォーマット: `#RRGGBB` or `#AARRGGBB`（Torque 形式、CSS の `#RRGGBBAA` とは異なる）

| Global キー | PID キー | 型 | 説明 |
|---|---|---|---|
| `displayTextValueColour` | — | color | 値テキスト色 |
| `displayTextTitleColour` | — | color | タイトル・単位テキスト色 |
| `displayTickColour` | — | color | 目盛り色 |
| `displayIndicatorColour` | — | color | メーターインジケータ色 |
| `dialNeedleColour` | — | color | 針色 |
| `graphLineColour` | `graphLineColour_<pid>` | color | グラフ線色 |
| `updateFlasherColour` | — | color | 更新フラッシュ色 |

### 2.4 フォント

| Global キー | PID キー | 型 | デフォルト | 説明 |
|---|---|---|---|---|
| `globalFontScale` | — | float | 1.0 | 全フォントサイズ倍率 |
| `dialNeedleValueFontScale` | — | float | 1.0 | Needle 型値フォント倍率 |
| `dialMeterValueFontScale` | — | float | 1.0 | Meter 型値フォント倍率 |

### 2.5 テキストオフセット

テキスト要素の垂直方向位置調整。Needle 型と Meter 型で別プロパティ。

| Global キー | PID キー | 型 | 範囲 | 説明 |
|---|---|---|---|---|
| `dialNeedleTitleTextOffset` | — | float | -1–1 | Needle 型: タイトル位置 |
| `dialNeedleValueTextOffset` | — | float | -1–1 | Needle 型: 値位置 |
| `dialNeedleUnitTextOffset` | — | float | -1–1 | Needle 型: 単位位置 |
| `dialNeedleScaleTextOffset` | — | float | -1–1 | Needle 型: スケール位置 |
| `dialMeterTitleTextOffset` | — | float | -1–1 | Meter 型: タイトル位置 |
| `dialMeterValueTextOffset` | — | float | -1–1 | Meter 型: 値位置 |
| `dialMeterUnitTextOffset` | — | float | -1–1 | Meter 型: 単位位置 |
| `dialMeterScaleTextOffset` | — | float | -1–1 | Meter 型: スケール位置 |

### 2.6 目盛り

| Global キー | PID キー | 型 | デフォルト | 説明 |
|---|---|---|---|---|
| `globalHideTicks` | `hideTicks_<pid>` | boolean | false | 目盛り非表示 |
| `dialTickStyle` | — | 0/1 | 0 | 目盛りスタイル |
| `dialStepsDivisor` | — | int | — | サブ目盛り分割数（style=1 時） |

### 2.7 ラベル・表示

| Global キー | PID キー | 型 | 説明 |
|---|---|---|---|
| — | `renameTitle_<pid>` | string | PID 別タイトル上書き（PID のみ） |
| `globalTitleTextCurved` | — | 0/1 | タイトルをダイアル上部に曲線配置 |
| `hideScaleLabels` | — | boolean | スケールラベル非表示 |
| `forceRPMScale` | — | number | RPM スケール除数（1000, 100 等） |
| `backgroundScrolls` | — | boolean | 背景スクロール有効/無効 |
| `showUpdateFlasher` | — | boolean | 更新フラッシュ表示 |

### 2.8 Meter 型固有

| Global キー | PID キー | 型 | デフォルト | 説明 |
|---|---|---|---|---|
| `dialMeterValueThickness` | — | float | 1.0 | 円弧インジケータ太さ倍率 |

### 2.9 ロゴ

| Global キー | PID キー | 型 | 説明 |
|---|---|---|---|
| `logoHorizontalOffset` | — | 0–100 | ロゴ水平位置（%） |
| `logoVerticalOffset` | — | 0–100 | ロゴ垂直位置（%） |

### 2.10 針（Needle）

| Global キー | PID キー | 型 | 説明 |
|---|---|---|---|
| `dialNeedleOffset` | — | float | ビットマップ針のピボットオフセット |

---

## 3. Global / PID ファイル（アセット）

メーター・数値パネルの背景画像と針画像。PID 別ファイルが存在する場合はそちらを優先。

| Global ファイル | PID ファイル | サイズ | 説明 |
|---|---|---|---|
| `dial_background.png` | `dial_background_<pid>.png` | 480×480 RGBA | メーター背景 |
| `display_background.png` | `display_background_<pid>.png` | 480×480 RGBA | 数値/グラフ表示背景 |
| `needle.png` | `needle_<pid>.png` | 1:10 比率 RGBA | 針画像（12時方向、透過背景） |

**needle.png 仕様:**
- アスペクト比 1:10（例: 69×690 px）、透過 PNG
- 針は 12時方向（上向き）に描画
- 回転中心 = 画像中心
- `dialNeedleOffset` でピボット位置を微調整
- `dialNeedleSizeRatio` でダイアル内サイズをスケーリング

---

## 4. PID キー命名規則

| Global プロパティ | PID プロパティ | 変換規則 |
|---|---|---|
| `globalDialStartAngle` | `dialStartAngle_0d` | `global` 除去 + 先頭小文字 |
| `globalDialStopAngle` | `dialStopAngle_0d` | `global` 除去 + 先頭小文字 |
| `globalTextRadius` | `textRadius_0d` | `global` 除去 + 先頭小文字 |
| `globalHideTicks` | `hideTicks_0d` | `global` 除去 + 先頭小文字 |
| `graphLineColour` | `graphLineColour_0d` | `_<pid>` を付加 |
| — | `renameTitle_0d` | PID 専用（Global なし） |

### PID 値の変換

```
OBD PID (本アプリ内部)  →  Torque PID キー
  010C (Engine RPM)     →  0c
  010D (Vehicle Speed)  →  0d
  0105 (Coolant Temp)   →  05
  0104 (Engine Load)    →  04
  0111 (Throttle)       →  11
```

変換: モードバイト（先頭 2 文字 `01`）を除去し、残りを小文字化。

---

## 5. 本プロジェクトの対応状況

### 対応済み

- 角度システム（Global + PID オーバーライド）
- 半径系プロパティ（暫定変換係数 `TORQUE_RADIUS_SCALE = 0.65`）
- テキスト半径 PID オーバーライド（`textRadius_<pid>`）
- 針描画（ビットマップ needle.png / フォールバック三角形）
- 色プロパティ（`#RRGGBB` / `#AARRGGBB` 変換）
- グラフ線色（Global + PID オーバーライド）
- フォント（`font.ttf`、`globalFontScale`）
- 目盛り表示/非表示（Global + PID）
- テキストオフセット（Needle 型）
- 背景画像（全体 / メーター / 数値・グラフ）
- `renameTitle_<pid>`（テーマエディタのみ）
- テーマエディタ GUI（プロパティ編集・プレビュー・アセット管理）

### 未対応（実装候補）

| 機能 | 優先度 | 備考 |
|---|---|---|
| PID 別背景画像 | 中 | `dial_background_<pid>.png` 等 |
| PID 別針画像 | 中 | `needle_<pid>.png` |
| `valueFont.ttf` | 中 | 値表示専用フォント |
| `dialNeedleValueFontScale` | 低 | Needle 型値フォント倍率 |
| Meter 型ゲージ | 低 | 円弧インジケータ（別レンダラ必要） |
| `globalTitleTextCurved` | 低 | タイトル曲線配置 |
| `dialNeedleOffset` | 低 | 針ピボット微調整 |
| `dialTickStyle` / `dialStepsDivisor` | 低 | 目盛りスタイルバリエーション |
| `logo.png` / ロゴ配置 | 低 | |
| Named colors | 低 | 実テーマでは未使用 |

### 未解決

- **`TORQUE_RADIUS_SCALE = 0.65`**: Torque 内部のベース半径の正確な値は Wiki にも記載なし。暫定値。
- **フォールバック針の形状**: Torque のデフォルト針の正確な形状・サイズ比は不明。
