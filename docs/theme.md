# Torque テーマ仕様

Torque (Android OBD2 アプリ) のテーマファイル仕様と、本プロジェクトでの対応状況をまとめる。

公式 Wiki: https://wiki.torque-bhp.com/view/Themes (2026-02-27 確認)

## テーマパッケージ構成

ZIP ファイルに以下を格納:

| ファイル | 説明 | 本アプリ対応 |
|---|---|---|
| `properties.txt` | Key=Value 設定（`#` コメント） | 対応 |
| `background.jpg` | ダッシュボード全体背景（任意サイズ） | 対応 |
| `dial_background.png` | 円形メーター背景（480x480 RGBA） | 対応 |
| `display_background.png` | 数値/グラフ表示背景（480x480 RGBA） | 対応 |
| `needle.png` | 針画像（480x480 RGBA、12時方向） | 対応 |
| `font.ttf` | カスタムフォント（`font=` 指定を上書き） | 対応 |
| `valueFont.ttf` | 値表示専用フォント | **未対応** |
| `logo.png` | ロゴ画像 | **未対応** |
| `screenshot.png` | プレビュー画像 | 対応 |
| `dial_background_<pid>.png` | PID 別メーター背景 | **未対応** |

## 角度システム

- **基準点**: 6時方向（真下 = 0°）
- **方向**: 時計回りに増加
- `dialStartAngle` / `dialStopAngle` = 真下からの除外角度（度）
- 例: 両方 45° → 有効範囲 = 360 - 45 - 45 = 270°（一般的な自動車メーター）
- 制限: start/stop angle を使うダイアルは負の値を表示できない

**PID 別オーバーライド:**
- `dialStartAngle_<pid>` / `dialStopAngle_<pid>` （PID は小文字 hex、例: `0d` = 速度）

**本アプリでの実装:**
```
sweepDeg = 360 - startAngle - stopAngle
arcStartRad = π/2 + stopAngle (ラジアン)
```
→ Wiki の仕様と**一致**。

## 半径系プロパティ

| プロパティ | 説明 | 実テーマ値例 | 本アプリ対応 |
|---|---|---|---|
| `dialTickInnerRadius` | 目盛り線の内径 | 1.50 | 対応 (× 0.65) |
| `dialTickOuterRadius` | 目盛り線の外径 | 1.55 | 対応 (× 0.65) |
| `dialNeedleLength` | 針の長さ | 1.20 | 対応 (× 0.65) |
| `globalTextRadius` | スケール数値の配置半径 | 0.85 | 対応 (× 0.65) |
| `textRadius_<pid>` | PID 別テキスト半径 | — | **未対応** |
| `dialMeterValueOuterRadius` | Meter 型インジケータ半径（デフォルト 1） | — | **未対応** |

### 座標系の問題（未解決）

Wiki では "Multipliers/proportional values" と記載されるのみで、**何に対する倍率かが不明**。

実テーマで `dialTickInnerRadius=1.50` のように 1.0 を超える値が使われているため、Canvas 半径の直接倍率ではない。Torque 内部で画像半径より小さいベース値が使われていると推測される。

**暫定対応:** `theme-parser.ts` で `TORQUE_RADIUS_SCALE = 0.65` の変換係数を適用。

```
Torque値 × 0.65 → Canvas 半径に対する倍率
例: 1.50 × 0.65 = 0.975（ほぼ外周）
    0.85 × 0.65 = 0.5525（中間付近）
```

red-sport テーマのスクリーンショットとの目視比較で近似的に合う値だが、正確な変換式は不明。

## 針（Needle）プロパティ

### ビットマップ針（needle.png あり）

| プロパティ | 説明 | 本アプリ対応 |
|---|---|---|
| `dialNeedleOffset` | ピボットポイントオフセット | **未対応** |
| `dialNeedleSizeRatio` | ダイアル内サイズ倍率（デフォルト 1、0.5 = 半分） | 対応 |
| `dialNeedleColour` | 針の色（#rrggbb / #aarrggbb） | 対応 |

**本アプリの描画:**
- 480x480 画像を パネルサイズにスケーリング
- 12時方向（上向き）を基準に回転
- 回転中心 = 画像中心

### フォールバック針（needle.png なし）

| プロパティ | 説明 | 本アプリ対応 |
|---|---|---|
| `dialNeedleLength` | 針の長さ | 対応 |
| `displayIndicatorColour` | 針・インジケータ色 | 対応（needleColor フォールバック） |

**本アプリの描画:** 三角形 + 中心ドット。Torque の正確な形状は不明。

## フォントプロパティ

| プロパティ | 説明 | 本アプリ対応 |
|---|---|---|
| `font=<string>` | Android システムフォント名 | 無視（TTF ファイル優先） |
| `font.ttf` | カスタムフォントファイル | 対応 |
| `valueFont.ttf` | 値表示専用フォント | **未対応** |
| `globalFontScale` | 全フォントサイズ倍率（デフォルト 1） | 対応 |
| `dialMeterValueFontScale` | Meter 型値フォント倍率 | **未対応** |
| `dialNeedleValueFontScale` | Needle 型値フォント倍率 | **未対応** |

## テキストオフセットプロパティ

Torque は **Meter 型**（円弧インジケータ）と **Needle 型**（針）で別プロパティを持つ。本アプリは Needle 型のみ実装。

| プロパティ | 説明 | 本アプリ対応 |
|---|---|---|
| `dialNeedleTitleTextOffset` | Needle 型タイトル位置 | 対応 (`titleOffset`) |
| `dialNeedleValueTextOffset` | Needle 型値位置 | 対応 (`valueOffset`) |
| `dialNeedleUnitTextOffset` | Needle 型単位位置 | 対応 (`unitOffset`) |
| `dialNeedleScaleTextOffset` | Needle 型スケール位置 | **未対応** |
| `dialMeterTitleTextOffset` | Meter 型タイトル位置 | **未対応** |
| `dialMeterValueTextOffset` | Meter 型値位置 | **未対応** |
| `dialMeterUnitTextOffset` | Meter 型単位位置 | **未対応** |
| `dialMeterScaleTextOffset` | Meter 型スケール位置 | **未対応** |

## 色プロパティ

フォーマット: `#rrggbb`, `#aarrggbb`, named colors (例: `green`)

| プロパティ | 説明 | 本アプリ対応 |
|---|---|---|
| `displayTextValueColour` | 値テキスト色 | 対応 |
| `displayTextTitleColour` | タイトルテキスト色 | 対応 |
| `displayTickColour` | 目盛り色 | 対応 |
| `displayIndicatorColour` | インジケータ / 針色 | 対応 |
| `dialNeedleColour` | 針色 | 対応 |
| `graphLineColour` | グラフ線色 | 対応 |
| `graphLineColour_<pid>` | PID 別グラフ線色 | **未対応** |
| `updateFlasherColour` | 更新フラッシュ色 | **未対応** |

**色フォーマット変換:** `#AARRGGBB` → `#RRGGBBAA` (CSS 形式) は `theme-parser.ts` の `parseColor()` で対応。Named colors は未対応（実テーマでは未使用）。

## 表示オプション

| プロパティ | 説明 | 本アプリ対応 |
|---|---|---|
| `globalHideTicks` | 全目盛り非表示 | 対応 |
| `hideTicks_<pid>` | PID 別目盛り非表示 | 対応 |
| `globalTitleTextCurved` | タイトルをダイアル上部に曲線配置（0/1） | **未対応** |
| `dialTickStyle` | 目盛りスタイル（0=通常、1=代替） | **未対応** |
| `dialStepsDivisor` | サブ目盛り数（style=1 時） | **未対応** |
| `renameTitle_<pid>` | PID 別タイトル上書き | **未対応** |
| `hideScaleLabels` | スケールラベル非表示 | **未対応** |
| `forceRPMScale` | RPM スケール強制（1000, 100 等） | **未対応** |
| `backgroundScrolls` | 背景スクロール有効/無効 | **未対応** |
| `showUpdateFlasher` | 更新フラッシュ表示 | **未対応** |
| `dialMeterValueThickness` | Meter 型インジケータ太さ（デフォルト 1） | **未対応** |

## ロゴ配置

| プロパティ | 説明 | 本アプリ対応 |
|---|---|---|
| `logo.png` | ロゴ画像ファイル | **未対応** |
| `logoHorizontalOffset` | 水平位置（%、50 = 中央） | **未対応** |
| `logoVerticalOffset` | 垂直位置（%、50 = 中央） | **未対応** |

## 同梱テーマの properties.txt

### red-sport

```properties
dialTickInnerRadius=1.50
dialTickOuterRadius=1.55
dialNeedleLength=1.20
globalHideTicks=false
globalTextRadius=.85
globalFontScale=.7
displayTextValueColour=#FF0808
displayTextTitleColour=#E60F00
displayTickColour=#FF160C
displayIndicatorColour=#000000
globalDialStartAngle=43
globalDialStopAngle=40
```

### blue-orange

```properties
dialTickInnerRadius=1.50
dialTickOuterRadius=1.55
dialNeedleLength=1.20
globalHideTicks=false
globalTextRadius=
globalFontScale=.7
displayTextValueColour=#E67B00
displayTextTitleColour=#00B9B9
displayTickColour=#D57A00
displayIndicatorColour=#00D1C8
globalDialStartAngle=45
globalDialStopAngle=45
```

## 対応状況まとめ

### 対応済み（実用上問題なし）

- 角度システム（globalDialStartAngle / globalDialStopAngle、PID 別オーバーライド）
- 半径系プロパティ（暫定変換係数 0.65 で近似）
- 針描画（ビットマップ / フォールバック三角形）
- 色プロパティ（#RRGGBB / #AARRGGBB）
- フォント（font.ttf、globalFontScale）
- 目盛り表示/非表示
- グラフ線色（フォールバックチェーン）
- 背景画像（全体 / メーター / 数値・グラフ）

### 未対応（優先度中）

- PID 別背景画像（`dial_background_<pid>.png`）
- `globalTitleTextCurved`（タイトル曲線配置）
- `textRadius_<pid>`（PID 別テキスト半径）
- `dialNeedleValueFontScale` / `dialMeterValueFontScale`

### 未対応（優先度低）

- `valueFont.ttf`（値専用フォント）
- `dialNeedleOffset`（針ピボットオフセット）
- `dialTickStyle` / `dialStepsDivisor`（目盛りスタイル）
- `renameTitle_<pid>` / `hideScaleLabels` / `forceRPMScale`
- `logo.png` / ロゴ配置
- `backgroundScrolls` / `showUpdateFlasher`
- Meter 型ゲージ全般（円弧インジケータ）
- `graphLineColour_<pid>`（PID 別グラフ色）
- Named colors（`green` 等）

### 未解決

- **`TORQUE_RADIUS_SCALE = 0.65`**: Wiki からも正確な変換式は確認できず。暫定値のまま。
- **針の描画仕様**: Torque のフォールバック針の正確な形状・サイズ比は不明。
