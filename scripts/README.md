# OBD2 Data Capture Tool

ELM327 Bluetooth アダプタ経由で車両の OBD2 データを取得・記録するツール。

## 動作環境

- Intel MacBook Pro
- Python 3.9+
- Bluetooth SPP 接続の ELM327 アダプタ

## セットアップ

```bash
cd scripts
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Bluetooth ペアリング

1. ELM327 アダプタを車両の OBD2 ポートに接続
2. Mac の「システム設定 > Bluetooth」でペアリング（PIN: 通常 `1234` or `0000`）
3. ペアリング後、`/dev/tty.OBDII-SPPDev` 等のシリアルポートが現れる

ポート確認:
```bash
ls /dev/tty.*OBD* /dev/tty.*ELM*
```

## 使い方

### scan — サポート PID スキャン

車両がサポートする PID の一覧と、車両情報（VIN 等）を表示する。

```bash
python obd2_capture.py scan
```

出力内容:
- **Mode 09** — VIN、キャリブレーション ID、ECU 名
- **Mode 01 サポート PID 一覧** — `output/supported_pids.csv` にも保存
- **全 PID の現在値** — 各 PID を 1 回クエリして表示

### record — データ記録

サポートされている PID を継続的にポーリングし、CSV に記録する。
Ctrl+C で停止。終了時に各 PID の min/max/avg サマリーを表示。

```bash
# 全サポート PID を記録
python obd2_capture.py record

# PID を指定して記録
python obd2_capture.py record --pids 010C,010D,0105

# ポーリング間隔を指定（秒）
python obd2_capture.py record --interval 0.5
```

### 共通オプション

```bash
# シリアルポートを明示的に指定
python obd2_capture.py --port /dev/tty.OBDII-SPPDev scan
python obd2_capture.py --port /dev/tty.OBDII-SPPDev record
```

## 出力ファイル

```
scripts/output/
├── supported_pids.csv              # scan で生成: pid, name, description
└── capture_20260223_143000.csv     # record で生成: timestamp, pid, name, value, unit
```

## 活用

- **パネル選択肢の拡充** — `supported_pids.csv` から車両固有の PID を確認し、`pids.ts` に追加
- **ESP32 シミュレータ** — `capture_*.csv` の実データパターンを ESP32 の ELM327 エミュレータに組み込む
