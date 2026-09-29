#!/usr/bin/env bash
# Launches Triton Inference Server on ROCm for the "Black Friday Shopping
# Rush" demo, using AMD's published ROCm Triton container image.
#
# Prerequisites:
#   1. pip install torch onnx  &&  python scripts/export_dummy_model.py
#      (or copy your own real model.onnx into
#       triton_repo/ctr_recommender/1/model.onnx)
#   2. docker pull rocm/tritoninferenceserver:tritoninferenceserver-25.12.amd1_rocm7.2_ubuntu24.04_py3.12
#   3. Run this on the actual AMD Instinct host (needs /dev/kfd, /dev/dri).
#
# Override the image or container runtime without editing this file:
#   TRITON_IMAGE=... CONTAINER_RUNTIME=podman ./scripts/launch_triton.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL_REPO="$SCRIPT_DIR/../triton_repo"

TRITON_IMAGE="${TRITON_IMAGE:-rocm/tritoninferenceserver:tritoninferenceserver-25.12.amd1_rocm7.2_ubuntu24.04_py3.12}"
CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-docker}"
CONTAINER_NAME="${CONTAINER_NAME:-ctr-triton-rocm}"

echo "Runtime:           $CONTAINER_RUNTIME"
echo "Image:             $TRITON_IMAGE"
echo "Model repository:  $MODEL_REPO"

if [ ! -f "$MODEL_REPO/ctr_recommender/1/model.onnx" ]; then
  echo
  echo "WARNING: no model.onnx found at:"
  echo "  $MODEL_REPO/ctr_recommender/1/model.onnx"
  echo "Triton will fail to load the model until you run"
  echo "  python scripts/export_dummy_model.py"
  echo "or copy in a real model. Continuing anyway..."
  echo
fi

# Remove a stale container from a previous run, if any, so re-running this
# script doesn't collide on the container name.
"$CONTAINER_RUNTIME" rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

echo "Starting tritonserver with ROCm execution provider enabled..."
echo "  HTTP:    localhost:8000"
echo "  gRPC:    localhost:8001"
echo "  Metrics: localhost:8002/metrics"
echo

exec "$CONTAINER_RUNTIME" run --rm -it \
  --name "$CONTAINER_NAME" \
  --device=/dev/kfd \
  --device=/dev/dri \
  --group-add video \
  --group-add render \
  --ipc=host \
  --shm-size=1g \
  --security-opt seccomp=unconfined \
  -p 8000:8000 -p 8001:8001 -p 8002:8002 \
  -v "$MODEL_REPO:/models" \
  "$TRITON_IMAGE" \
  tritonserver \
    --model-repository=/models \
    --backend-config=onnxruntime,rocm-execution-provider=true \
    --log-verbose=1
