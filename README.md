# Crowd Cooling Drone AI Module

This repository contains the **code, notebooks, and configs** for the Jetson-ready perception pipeline for the crowd-cooling drone project.

The repo is intentionally set up to track:
- source code
- notebooks
- tests
- lightweight configs and reports

It intentionally does **not** track:
- raw datasets
- zipped downloads
- trained weights
- generated run artifacts
- local virtual environments

## Tracked Project Areas

- `crowdcooling_ai/` shared package code
- `datasets/` dataset preparation scripts and lightweight manifests
- `train/` training entrypoints
- `eval/` evaluation scripts
- `deploy/` deploy/runtime scripts
- `notebooks/` review and training notebooks
- `tests/` unit tests
- `docs/RESULTS.md` generated summary report when useful

## Local-Only Assets

These folders are ignored by git and should be recreated or copied manually on each machine:

- `MovingDroneCrowd/`
- `LOAF/`
- `Zipped files/`
- `cutted temp/`
- `datasets/raw/`
- `train/runs/`
- `eval/runs/`
- `deploy/runs/`

Large model files such as `*.pt` are also ignored.

## Recommended Multi-Device Workflow

1. Clone this repository on the second device.
2. Create a local Python environment there.
3. Install the notebook/script dependencies you need.
4. Copy or redownload the raw datasets into the same local folder names.
5. Copy any trained checkpoints you want to keep using into a local ignored folder.

## Important Paths Used In This Project

- Bottom-camera comparison image:
  `datasets/raw/web_bottom_challenge_v1/images/target_compare.jpg`
- Top-down warm-start notebook:
  `notebooks/TrainYOLO26TopDownWarmstart.ipynb`
- Model comparison notebook:
  `notebooks/CompareTargetImage.ipynb`
- Jetson Orin Nano setup:
  `docs/JETSON_ORIN_NANO_SETUP.md`

## Notes

- The current bottom-camera warm-start uses `YOLO26n` trained on the merged `top down people.v1i.yolov8` dataset.
- That warm-start is useful for fine-tuning on future custom top-down images, but it is not the final proof dataset by itself.
