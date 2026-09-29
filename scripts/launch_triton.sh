#!/usr/bin/env bash
# Convenience wrapper matching the "Configure & launch" screen of the demo.
# Run this on the AMD Instinct host, from the project root, after:
#   1. pip install torch onnx  &&  python scripts/export_dummy_model.py
#      (or copying your own real model.onnx into
#       triton_repo/ctr_recommender/1/model.onnx)
#   2. Having a Triton container/binary with ROCm support available.
#
# If you're using the ROCm Triton container, launch it roughly like:
#   docker run --rm -it \
#     --device=/dev/kfd --device=/dev/dri --group-add video \
#     --shm-size=1g -p 8000:8000 -p 8001:8001 -p 8002:8002 \
#     -v "$(pwd)/triton_repo:/models" \
#     <your-rocm-triton-image> \
#     tritonserver --model-repository=/models \
#       --backend-config=onnxruntime,rocm-execution-provider=true
#
# This script assumes tritonserver is already on PATH (e.g. inside that
# container, or a bare-metal ROCm Triton install) and just wires the flags.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL_REPO="$SCRIPT_DIR/../triton_repo"

echo "Model repository: $MODEL_REPO"
echo "Starting tritonserver with ROCm execution provider enabled..."

exec tritonserver \
  --model-repository="$MODEL_REPO" \
  --backend-config=onnxruntime,rocm-execution-provider=true \
  --log-verbose=1
