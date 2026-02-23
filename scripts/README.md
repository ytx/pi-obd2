# OBD2 Data Capture Tool

ELM327 Bluetooth アダプタ経由で車両の OBD2 データを取得・記録するツール。

## 動作環境

- Raspberry Pi 4 (Raspberry Pi OS)
- Python 3.9+
- Bluetooth SPP 接続の ELM327 アダプタ

## セットアップ

```bash
cd ~/git/pi-obd2/scripts
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Bluetooth ペアリング (Raspberry Pi)

### 1. BlueZ の確認

```bash
# Bluetooth サービスが動作していることを確認
sudo systemctl status bluetooth

# 起動していなければ
sudo systemctl start bluetooth
sudo systemctl enable bluetooth
```

### 2. ELM327 のスキャン・ペアリング

```bash
# bluetoothctl で対話操作
bluetoothctl

# スキャン開始
[bluetooth]# scan on

# ELM327 が見つかったら（例: OBDII, ELM327, Vgate 等の名前）
# MAC アドレスをメモ（例: AA:BB:CC:DD:EE:FF）
[bluetooth]# scan off

# ペアリング（PIN: 通常 1234 or 0000）
[bluetooth]# pair AA:BB:CC:DD:EE:FF
[bluetooth]# trust AA:BB:CC:DD:EE:FF
[bluetooth]# exit
```

### 3. SPP シリアルポートのバインド

```bash
# rfcomm でシリアルポートを作成
sudo rfcomm bind 0 AA:BB:CC:DD:EE:FF

# /dev/rfcomm0 が作成される
ls -l /dev/rfcomm0
```

> **注意:** `rfcomm` が無い場合は `sudo apt install bluez` で入る。
> Raspberry Pi OS Bookworm 以降では `rfcomm` が非推奨のため、
> パッケージに含まれていない場合がある。その場合は以下で対応:
>
> ```bash
> # bluez-tools で代替、または直接ソースからビルド
> sudo apt install bluez-tools
> # もしくは python-obd の自動ポート検出を試す（--port 省略）
> ```

### 4. ポート確認

```bash
ls -l /dev/rfcomm*
```

### 5. 権限設定

```bash
# pi ユーザーを dialout グループに追加（初回のみ、再ログイン要）
sudo usermod -aG dialout $USER
```

## 使い方

### scan — サポート PID スキャン

車両がサポートする PID の一覧と、車両情報（VIN 等）を表示する。

```bash
python obd2_capture.py scan --port /dev/rfcomm0
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
python obd2_capture.py record --port /dev/rfcomm0

# PID を指定して記録
python obd2_capture.py record --port /dev/rfcomm0 --pids 010C,010D,0105

# ポーリング間隔を指定（秒）
python obd2_capture.py record --port /dev/rfcomm0 --interval 0.5
```

### 共通オプション

```bash
# --port を省略すると python-obd が自動検出を試みる
python obd2_capture.py scan
```

## 出力ファイル

```
scripts/output/
├── supported_pids.csv              # scan で生成: pid, name, description
└── capture_20260223_143000.csv     # record で生成: timestamp, pid, name, value, unit
```

## rfcomm の解放

```bash
# 使用後にポートを解放
sudo rfcomm release 0
```

## 活用

- **パネル選択肢の拡充** — `supported_pids.csv` から車両固有の PID を確認し、`pids.ts` に追加
- **ESP32 シミュレータ** — `capture_*.csv` の実データパターンを ESP32 の ELM327 エミュレータに組み込む
