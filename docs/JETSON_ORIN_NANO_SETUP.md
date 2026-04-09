# Jetson Orin Nano Setup

This project has been checked against a Jetson Orin Nano running:

- `JetPack 5.1.2`
- `L4T R35.4.1`
- `Python 3.8.10`

These instructions use a native Python virtual environment and the NVIDIA Jetson PyTorch wheel.

## 1. System packages

```bash
sudo apt-get update
sudo apt-get install -y \
  python3-pip \
  python3-venv \
  python3-opencv \
  libopenblas-dev \
  libjpeg-dev \
  zlib1g-dev \
  libpython3-dev \
  git
```

`python3-opencv` is installed from apt so the project can reuse JetPack's OpenCV build.

## 2. Create a virtual environment

```bash
python3 -m venv --system-site-packages ~/venvs/crowdcooling
source ~/venvs/crowdcooling/bin/activate
python3 -m pip install --upgrade pip setuptools wheel
python3 -m pip install numpy==1.24.4
```

`--system-site-packages` lets the venv see the system OpenCV package from JetPack.
`numpy==1.24.4` is used because this board is on Python `3.8.10`; newer `numpy` `1.26.x` wheels are not published for `cp38`.

## 3. Install PyTorch for JetPack 5.1.2

NVIDIA's Jetson PyTorch docs map JetPack `5.1.x` to the `23.06` PyTorch wheel family. For this board and Python version, use:

```bash
export TORCH_WHL=https://developer.download.nvidia.com/compute/redist/jp/v512/pytorch/torch-2.1.0a0+41361538.nv23.06-cp38-cp38-linux_aarch64.whl
python3 -m pip install --no-cache-dir "$TORCH_WHL"
```

If that exact wheel ever disappears, the older documented fallback from the same JetPack family is:

```bash
python3 -m pip install --no-cache-dir \
  https://developer.download.nvidia.com/compute/redist/jp/v511/pytorch/torch-2.0.0+nv23.05-cp38-cp38-linux_aarch64.whl
```

## 4. Install torchvision

For JetPack `5.1.2` with NVIDIA's `torch-2.1.0a0+41361538.nv23.06`, a source build of `torchvision 0.16.1` is the safer path on Jetson. NVIDIA forum reports for this exact JetPack family show `0.16.1` resolving the Ultralytics `torchvision::nms` mismatch where `0.16.0` stayed problematic.

Install build helpers first:

```bash
sudo apt-get install -y libpng-dev
python3 -m pip install --no-cache-dir ninja
```

Then build `torchvision` from source inside the activated venv:

```bash
python3 -m pip uninstall -y torchvision
rm -rf ~/vision
git clone --branch v0.16.1 --depth 1 https://github.com/pytorch/vision.git ~/vision
cd ~/vision
export BUILD_VERSION=0.16.1
export FORCE_CUDA=1
export TORCH_CUDA_ARCH_LIST="8.7"
python3 setup.py install
cd ~
```

Do not run your project from inside `~/vision`. After installation, go back to the repo folder before testing inference.

## 5. Install this project's Python packages

From the repo root:

```bash
cd ~/Senior\ Project\ II
python3 -m pip install --no-cache-dir -r requirements-jetson.txt
```

After that, remove any pip OpenCV wheels so the venv falls back to JetPack's system OpenCV build with GStreamer support:

```bash
python3 -m pip uninstall -y \
  opencv-python \
  opencv-python-headless \
  opencv-contrib-python \
  opencv-contrib-python-headless
```

Then verify that `cv2` comes from the system package and still has GStreamer enabled:

```bash
python3 - <<'PY'
import cv2
print("cv2:", cv2.__version__)
for line in cv2.getBuildInformation().splitlines():
    if "GStreamer" in line:
        print(line)
PY
```

On Jetson, you want the imported `cv2` to be the JetPack build, not a pip wheel, because CSI camera pipelines through `nvarguscamerasrc` depend on OpenCV being compiled with GStreamer support.

## 6. Verify the core stack

```bash
python3 - <<'PY'
import cv2
import torch
import ultralytics
print("cv2:", cv2.__version__)
print("torch:", torch.__version__)
print("cuda available:", torch.cuda.is_available())
print("ultralytics:", ultralytics.__version__)
PY
```

Expected result:

- `cv2` imports successfully
- `torch.cuda.is_available()` returns `True`
- `ultralytics` prints `8.4.14`

## 7. Clone or copy the repo

Large assets are intentionally ignored by git. After cloning the repo, copy or recreate these folders locally:

- `MovingDroneCrowd/`
- `LOAF/`
- `Zipped files/`
- `datasets/raw/`
- any trained checkpoints such as `best.pt`

## 8. Optional: Jupyter notebook kernel

```bash
python3 -m ipykernel install --user --name crowdcooling --display-name "crowdcooling"
```

Then run:

```bash
jupyter notebook
```

## 9. Optional: performance mode before benchmarking

```bash
sudo nvpmodel -m 0
sudo jetson_clocks
```

Use that only for profiling and demo runs where you want maximum performance.

## 10. Notes for this repo

- Bottom-camera warm-start notebook:
  `notebooks/TrainYOLO26TopDownWarmstart.ipynb`
- Model comparison notebook:
  `notebooks/CompareTargetImage.ipynb`
- Current local desktop environment uses:
  `ultralytics==8.4.14`

## Sources

- NVIDIA PyTorch for Jetson install guide:
  https://docs.nvidia.com/deeplearning/frameworks/install-pytorch-jetson-platform/index.html
- NVIDIA Jetson PyTorch release notes and compatibility matrix:
  https://docs.nvidia.com/deeplearning/frameworks/install-pytorch-jetson-platform-release-notes/pytorch-jetson-rel.html
- PyTorch previous versions:
  https://pytorch.org/get-started/previous-versions/
- NVIDIA forum thread confirming `torchvision 0.16.1` fixed this JetPack 5.1.2 issue:
  https://forums.developer.nvidia.com/t/issues-finding-compatible-torchvision-with-jetpack-5-1-2/311027
