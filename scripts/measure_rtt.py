from __future__ import annotations

import argparse
import json
import socket
import statistics
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def percentile(sorted_values: list[float], q: float) -> float:
    if not sorted_values:
        raise ValueError("Cannot compute percentile of empty data.")
    if len(sorted_values) == 1:
        return sorted_values[0]

    pos = (len(sorted_values) - 1) * q
    lower = int(pos)
    upper = min(lower + 1, len(sorted_values) - 1)
    weight = pos - lower
    return sorted_values[lower] * (1.0 - weight) + sorted_values[upper] * weight


def measure_tcp_handshake_ms(host: str, port: int, timeout_s: float) -> float:
    start = time.perf_counter()
    sock = socket.create_connection((host, port), timeout=timeout_s)
    try:
        return (time.perf_counter() - start) * 1000.0
    finally:
        sock.close()


def build_summary(
    *,
    label: str,
    host: str,
    port: int,
    count: int,
    timeout_s: float,
    interval_ms: float,
    samples_ms: list[float],
    failed_attempts: int,
) -> dict[str, Any]:
    ordered = sorted(samples_ms)
    return {
        "label": label,
        "host": host,
        "port": port,
        "method": "tcp_handshake_rtt_ms",
        "count_requested": count,
        "count_successful": len(samples_ms),
        "count_failed": failed_attempts,
        "timeout_s": timeout_s,
        "interval_ms": interval_ms,
        "measured_at_utc": datetime.now(timezone.utc).isoformat(),
        "summary_ms": {
            "min": min(ordered),
            "max": max(ordered),
            "mean": statistics.fmean(ordered),
            "median": statistics.median(ordered),
            "p50": percentile(ordered, 0.50),
            "p90": percentile(ordered, 0.90),
        },
        "samples_ms": [round(v, 3) for v in samples_ms],
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Measure TCP round-trip latency by timing repeated TCP handshakes "
            "to a reachable host and port."
        )
    )
    parser.add_argument("--host", required=True, help="Target host or IP address.")
    parser.add_argument("--port", required=True, type=int, help="Target TCP port.")
    parser.add_argument("--count", type=int, default=20, help="Number of RTT samples to collect.")
    parser.add_argument("--timeout-s", type=float, default=3.0, help="Socket timeout in seconds.")
    parser.add_argument(
        "--interval-ms",
        type=float,
        default=200.0,
        help="Delay between consecutive samples in milliseconds.",
    )
    parser.add_argument(
        "--label",
        default="friend_comm_rtt",
        help="Short label stored in the output summary.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional path to write the JSON summary.",
    )
    args = parser.parse_args()

    if args.count <= 0:
        raise ValueError("--count must be greater than zero.")

    samples_ms: list[float] = []
    failed_attempts = 0

    for attempt in range(args.count):
        try:
            samples_ms.append(
                measure_tcp_handshake_ms(args.host, args.port, args.timeout_s)
            )
        except OSError:
            failed_attempts += 1

        if attempt < args.count - 1:
            time.sleep(args.interval_ms / 1000.0)

    if not samples_ms:
        raise RuntimeError(
            f"No successful TCP RTT samples were collected for {args.host}:{args.port}."
        )

    result = build_summary(
        label=args.label,
        host=args.host,
        port=args.port,
        count=args.count,
        timeout_s=args.timeout_s,
        interval_ms=args.interval_ms,
        samples_ms=samples_ms,
        failed_attempts=failed_attempts,
    )

    payload = json.dumps(result, indent=2)
    print(payload)

    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
