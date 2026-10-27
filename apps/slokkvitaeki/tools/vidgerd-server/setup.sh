#!/usr/bin/env bash
# Sets up the Ljósmyndaviðgerð local server. Run once, from this directory.
#
# Why this isn't a plain `pip install -r requirements.txt`: two of the
# packages (basicsr, realesrgan) are old enough that a vanilla install can
# hang for a very long time or fail outright on a fresh machine. These steps
# are the exact sequence that was proven to work.
set -euo pipefail

PYTHON=${PYTHON:-python3.11}
command -v "$PYTHON" >/dev/null 2>&1 || PYTHON=python3

"$PYTHON" -m venv .venv
source .venv/bin/activate
pip install --upgrade pip -q

echo "== torch (CPU build — swap the index URL below for a CUDA build if you have a GPU) =="
pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision

echo "== everything except basicsr (that one needs --no-build-isolation, see below) =="
pip install fastapi "uvicorn[standard]" python-multipart numpy opencv-python-headless pillow \
  pyyaml scipy tqdm yapf lmdb addict future requests scikit-image facexlib realesrgan gfpgan

echo "== basicsr: --no-build-isolation avoids it trying to fetch its own (huge, CUDA) torch =="
pip install --no-build-isolation --no-deps basicsr

echo "== patch: basicsr 1.4.2 imports a torchvision path removed in modern torchvision =="
BASICSR_DEGRAD="$(python3 -c "import basicsr, os; print(os.path.join(os.path.dirname(basicsr.__file__), 'data', 'degradations.py'))")"
sed -i.bak 's/from torchvision.transforms.functional_tensor import rgb_to_grayscale/from torchvision.transforms.functional import rgb_to_grayscale/' "$BASICSR_DEGRAD"

echo
echo "Setup done. Run: ./run.sh  (or: source .venv/bin/activate && python3 server.py)"
