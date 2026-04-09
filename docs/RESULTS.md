# RESULTS

## Dataset And Model
- Dataset YAML: `C:\Users\PC\Desktop\Term252\Senior Project II\datasets\processed\mdc_head_yolo\mdc_head_yolo.yaml`
- Model: `C:\Users\PC\Desktop\Term252\Senior Project II\MovingDroneCrowd\yolov8n.pt`
- Split: `val`
- Confidence threshold: `0.1`
- IoU threshold: `0.7`
- Image size: `640`
- Frames evaluated: `12`

## Count Metrics
- Accuracy_count = 0.0000 (does not meet the 0.80 target)
- MAE = 20.9167
- RMSE = 21.0891
- Correct frames = 0 / 12

## Detection Metrics
- Not computed in this run.


## Latency
| Stage | Mean (ms) | P50 (ms) | P90 (ms) |
| --- | ---: | ---: | ---: |
| Capture | 0.00 | 0.00 | 0.00 |
| Preprocess | 1.35 | 1.30 | 1.39 |
| Inference | 6.16 | 6.05 | 7.11 |
| Postprocess | 1.11 | 1.04 | 1.44 |
| Decision | 0.08 | 0.07 | 0.09 |
| Total | 19.24 | 18.97 | 20.36 |

## Presentation Artifacts
- Success overlays:
  - none generated yet
- Failure overlays:
  - `C:\Users\PC\Desktop\Term252\Senior Project II\docs\figures\failure_cases\failure_01.jpg`
  - `C:\Users\PC\Desktop\Term252\Senior Project II\docs\figures\failure_cases\failure_02.jpg`
  - `C:\Users\PC\Desktop\Term252\Senior Project II\docs\figures\failure_cases\failure_03.jpg`

## Next Steps
- If Accuracy_count is below 0.80, rerun the threshold sweep and then compare `YOLOv8n` 960 against `YOLOv8s`.
- Collect official Jetson latency on-device with ONNX or TensorRT export.
