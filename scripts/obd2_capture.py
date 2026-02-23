#!/usr/bin/env python3
"""OBD2 data capture tool for ELM327 via Bluetooth SPP.

Usage:
    python obd2_capture.py scan [--port PORT]
    python obd2_capture.py record [--port PORT] [--pids PID1,PID2,...] [--interval SECONDS]

Setup (Raspberry Pi):
    cd ~/git/pi-obd2/scripts
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
"""

import argparse
import csv
import os
import signal
import sys
import time
from datetime import datetime
from pathlib import Path

import obd

OUTPUT_DIR = Path(__file__).parent / "output"


def cmd_pid(cmd) -> str:
    """Get PID hex string from an OBDCommand (e.g., b"0101" -> "0101")."""
    return cmd.command.decode("ascii").upper()


def extract_value(val) -> tuple:
    """Extract (numeric_value, unit_str) from a response value.

    Returns (None, None) for non-numeric types (STATUS, tuples, strings, etc.).
    """
    if hasattr(val, "magnitude"):
        return val.magnitude, str(val.units)
    if isinstance(val, (int, float)):
        return val, ""
    return None, None


# Mode 09 commands to query for vehicle info
MODE09_COMMANDS = [
    "VIN",                    # 0902 - Vehicle Identification Number
    "CALIBRATION_ID",         # 0904 - Calibration ID
    "CVN",                    # 0906 - Calibration Verification Numbers
    "ECU_NAME",               # 090A - ECU Name
]


def connect(port: str | None) -> obd.OBD:
    """Connect to ELM327 adapter."""
    kwargs = {"fast": False, "timeout": 10}
    if port:
        kwargs["portstr"] = port

    print("Connecting to ELM327...")
    conn = obd.OBD(**kwargs)

    if not conn.is_connected():
        print("ERROR: Could not connect to ELM327.")
        print("  - Check Bluetooth pairing and serial port.")
        print("  - On Mac, look for /dev/tty.OBDII* or /dev/tty.OBD*")
        print(f"  - Detected ports: {obd.scan_serial()}")
        sys.exit(1)

    proto = conn.protocol_name()
    print(f"Connected: port={conn.port_name()}, protocol={proto}")
    return conn


def cmd_scan(args: argparse.Namespace) -> None:
    """Scan supported PIDs and show vehicle info (Mode 09)."""
    conn = connect(args.port)

    # --- Mode 09: Vehicle information ---
    print("\n=== Vehicle Information (Mode 09) ===")
    for cmd_name in MODE09_COMMANDS:
        cmd = getattr(obd.commands, cmd_name, None)
        if cmd is None:
            continue
        resp = conn.query(cmd)
        if resp.is_null():
            print(f"  {cmd_name}: (not supported)")
        else:
            print(f"  {cmd_name}: {resp.value}")

    # --- Mode 01: Supported PIDs ---
    supported = conn.supported_commands
    # Filter to Mode 01 (service 01) commands, exclude support-check PIDs
    mode01 = sorted(
        [c for c in supported if c.command[:2] == b"01" and not c.name.startswith("PIDS_")],
        key=lambda c: c.command,
    )

    print(f"\n=== Supported Mode 01 PIDs ({len(mode01)}) ===")
    print(f"  {'PID':<6} {'Name':<35} {'Description'}")
    print(f"  {'---':<6} {'---':<35} {'---'}")
    for cmd in mode01:
        pid_hex = cmd_pid(cmd)
        desc = cmd.desc or cmd.name
        print(f"  {pid_hex:<6} {cmd.name:<35} {desc}")

    # Save to CSV
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    csv_path = OUTPUT_DIR / "supported_pids.csv"
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["pid", "name", "description"])
        for cmd in mode01:
            writer.writerow([cmd_pid(cmd), cmd.name, cmd.desc or ""])

    print(f"\nSaved to {csv_path}")

    # Also query each PID once to show current values
    print(f"\n=== Current Values ===")
    print(f"  {'PID':<6} {'Name':<30} {'Value':<15} {'Unit'}")
    print(f"  {'---':<6} {'---':<30} {'---':<15} {'---'}")
    numeric_count = 0
    for cmd in mode01:
        resp = conn.query(cmd)
        if resp.is_null():
            continue
        pid_hex = cmd_pid(cmd)
        num_val, unit = extract_value(resp.value)
        if num_val is not None:
            print(f"  {pid_hex:<6} {cmd.name:<30} {num_val:<15.2f} {unit}")
            numeric_count += 1
        else:
            print(f"  {pid_hex:<6} {cmd.name:<30} {'(non-numeric)':<15} {str(resp.value)[:50]}")

    print(f"\n  Numeric PIDs: {numeric_count}/{len(mode01)} (usable for recording)")

    conn.close()


def cmd_record(args: argparse.Namespace) -> None:
    """Record PID values to CSV until Ctrl+C."""
    conn = connect(args.port)

    # Determine PIDs to record
    if args.pids:
        pid_names = [p.strip() for p in args.pids.split(",")]
        commands = []
        for name in pid_names:
            cmd = getattr(obd.commands, name, None) if not name.startswith("01") else None
            if cmd is None:
                # Try by hex PID
                try:
                    mode = int(name[:2])
                    pid = int(name[2:], 16)
                    cmd = obd.commands[mode][pid]
                except (ValueError, IndexError, KeyError):
                    print(f"WARNING: Unknown PID '{name}', skipping.")
                    continue
            commands.append(cmd)
    else:
        # Use all supported Mode 01 PIDs
        supported = conn.supported_commands
        commands = sorted(
            [c for c in supported if c.command[:2] == b"01" and not c.name.startswith("PIDS_")],
            key=lambda c: c.command,
        )

    if not commands:
        print("ERROR: No PIDs to record.")
        conn.close()
        sys.exit(1)

    print(f"\nRecording {len(commands)} PIDs (Ctrl+C to stop):")
    for cmd in commands:
        print(f"  {cmd_pid(cmd)} {cmd.name}")

    # Setup CSV output
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    csv_path = OUTPUT_DIR / f"capture_{timestamp_str}.csv"

    # Track stats
    stats: dict[str, dict] = {}
    record_count = 0
    start_time = time.time()

    # Handle Ctrl+C
    stop = False

    def on_signal(_sig, _frame):
        nonlocal stop
        stop = True

    signal.signal(signal.SIGINT, on_signal)

    print(f"Output: {csv_path}\n")

    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["timestamp", "pid", "name", "value", "unit"])

        while not stop:
            for cmd in commands:
                if stop:
                    break

                resp = conn.query(cmd)
                if resp.is_null():
                    continue

                now = datetime.now().isoformat(timespec="milliseconds")
                pid_hex = cmd_pid(cmd)
                num_val, unit = extract_value(resp.value)

                if num_val is None:
                    continue  # Skip non-numeric values

                writer.writerow([now, pid_hex, cmd.name, num_val, unit])
                record_count += 1

                # Update stats
                if pid_hex not in stats:
                    stats[pid_hex] = {
                        "name": cmd.name,
                        "unit": unit,
                        "min": float("inf"),
                        "max": float("-inf"),
                        "sum": 0,
                        "count": 0,
                    }
                s = stats[pid_hex]
                fval = float(num_val)
                s["min"] = min(s["min"], fval)
                s["max"] = max(s["max"], fval)
                s["sum"] += fval
                s["count"] += 1

            # Progress indicator
            elapsed = time.time() - start_time
            sys.stdout.write(f"\r  {record_count} records, {elapsed:.0f}s elapsed")
            sys.stdout.flush()

            if args.interval > 0:
                time.sleep(args.interval)

    # Summary
    elapsed = time.time() - start_time
    print(f"\n\n=== Recording Summary ===")
    print(f"  Duration: {elapsed:.1f}s")
    print(f"  Records:  {record_count}")
    print(f"  File:     {csv_path}")

    if stats:
        print(f"\n  {'PID':<6} {'Name':<30} {'Min':>10} {'Max':>10} {'Avg':>10} {'Unit'}")
        print(f"  {'---':<6} {'---':<30} {'---':>10} {'---':>10} {'---':>10} {'---'}")
        for pid_hex, s in sorted(stats.items()):
            if s["count"] > 0:
                avg = s["sum"] / s["count"]
                print(
                    f"  {pid_hex:<6} {s['name']:<30} "
                    f"{s['min']:>10.2f} {s['max']:>10.2f} {avg:>10.2f} {s['unit']}"
                )

    conn.close()


def main():
    parser = argparse.ArgumentParser(
        description="OBD2 data capture tool for ELM327 via Bluetooth SPP",
    )
    parser.add_argument("--port", help="Serial port (e.g., /dev/tty.OBDII-SPPDev)")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("scan", help="Scan supported PIDs and vehicle info")

    rec = sub.add_parser("record", help="Record PID values to CSV")
    rec.add_argument("--pids", help="Comma-separated PID hex codes or names (default: all supported)")
    rec.add_argument("--interval", type=float, default=0, help="Interval between poll cycles in seconds (default: 0)")

    args = parser.parse_args()

    if args.command == "scan":
        cmd_scan(args)
    elif args.command == "record":
        cmd_record(args)


if __name__ == "__main__":
    main()
