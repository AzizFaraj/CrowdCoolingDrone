# Communication RTT Measurement

This project includes a simple RTT measurement script at:

`scripts/measure_rtt.py`

It measures TCP round-trip latency by timing repeated TCP handshakes to a target host and port. For the friend setup, the most relevant target is the MediaMTX RTMP port on the PC, because that is the same communication path used by the Jetson to publish the annotated stream.

## Recommended Usage

Run this on the Jetson while the friend's PC is running MediaMTX and listening on port `1935`.

Example:

```bash
cd ~/CrowdCoolingDrone
source ~/venvs/crowdcooling/bin/activate
python scripts/measure_rtt.py --host 192.168.8.176 --port 1935 --count 30 --interval-ms 250 --output eval/runs/friend_comm_rtt.json
```

This produces:

- console JSON output
- a saved proof file at `eval/runs/friend_comm_rtt.json`

## What the Output Means

The output includes:

- `count_successful`
- `count_failed`
- `summary_ms.min`
- `summary_ms.max`
- `summary_ms.mean`
- `summary_ms.median`
- `summary_ms.p50`
- `summary_ms.p90`

For report use, the most useful values are usually:

- `mean` as the average communication RTT
- `p90` as the near-worst-case communication RTT under normal operation

## Why This Counts as Proof

This script measures the actual communication path between the Jetson and the friend's PC service port. Since the video stream is published from the Jetson to the PC through MediaMTX on TCP port `1935`, the resulting RTT values are directly relevant to the communication latency of that setup.
