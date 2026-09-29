#!/usr/bin/env python3
"""
triton_ctr_load_test.py

Load-generator client for the "Black Friday Shopping Rush" demo.

This script does NOT run the model itself and has no ROCm-specific code —
that's the point. The GPU acceleration lives entirely on the server side,
inside Triton Inference Server, via the ROCm execution accelerator
configured in the model's config.pbtxt (see the "Configure & launch"
screen of the demo layout). This script's only job is to simulate
concurrent shoppers hitting that already-running server and to measure
what actually comes back: real throughput, P50/P99 latency, and error rate.

Prerequisites
-------------
1. Triton Inference Server is already running on the AMD Instinct host,
   e.g.:

       tritonserver --model-repository=/models \
           --backend-config=onnxruntime,rocm-execution-provider=true

   and has loaded a model (default name: ctr_recommender) whose
   config.pbtxt has dynamic_batching + instance_group{kind: KIND_GPU}
   configured for the ROCm devices.

2. pip install "tritonclient[http]" numpy

3. This script is launched from a client machine (or the same host) that
   can reach Triton's HTTP endpoint (default localhost:8000).

Usage
-----
Run a single load regime:

    python triton_ctr_load_test.py --url localhost:8000 \
        --model-name ctr_recommender --concurrency 300 --duration 30

Run the light-vs-heavy comparison used in the demo (back to back):

    python triton_ctr_load_test.py --url localhost:8000 \
        --model-name ctr_recommender --compare --duration 30

IMPORTANT: --input-name / --output-name / --num-features must match your
actual model's signature. The defaults below (a single float32 feature
vector in, a single float32 score out) are placeholders for a generic
CTR-style model and will need adjusting to your real config.pbtxt.
"""

import argparse
import statistics
import sys
import threading
import time
from dataclasses import dataclass, field

import numpy as np

try:
    import tritonclient.http as httpclient
    from tritonclient.utils import InferenceServerException
except ImportError:
    sys.exit(
        "Missing dependency. Install with:\n"
        "    pip install \"tritonclient[http]\" numpy"
    )


# ---------------------------------------------------------------------------
# Traffic presets — match the "light" and "heavy" regimes in the demo layout.
# concurrency here == number of simulated concurrent shoppers, each shopper
# being one client thread that keeps issuing inference requests back to back.
# ---------------------------------------------------------------------------
TRAFFIC_PRESETS = {
    "light": {"concurrency": 300, "label": "Light traffic (~300 concurrent shoppers)"},
    "heavy": {"concurrency": 4800, "label": "Heavy traffic, 5x (~4,800 concurrent shoppers)"},
}


@dataclass
class Result:
    latencies_ms: list = field(default_factory=list)
    errors: int = 0
    lock: threading.Lock = field(default_factory=threading.Lock)

    def record_success(self, latency_ms: float):
        with self.lock:
            self.latencies_ms.append(latency_ms)

    def record_error(self):
        with self.lock:
            self.errors += 1


def build_random_input(num_features: int) -> np.ndarray:
    """
    Mock CTR feature vector for one inference request: e.g. user embedding
    fields, recent-item embedding fields, session/context features.
    Replace this with real feature construction for your actual model.
    """
    return np.random.rand(1, num_features).astype(np.float32)


def make_client(url: str, ssl: bool = False) -> httpclient.InferenceServerClient:
    return httpclient.InferenceServerClient(url=url, ssl=ssl, verbose=False)


def infer_once(client, model_name, model_version, input_name, output_name, num_features):
    infer_input = httpclient.InferInput(input_name, [1, num_features], "FP32")
    infer_input.set_data_from_numpy(build_random_input(num_features))
    infer_output = httpclient.InferRequestedOutput(output_name)

    t0 = time.perf_counter()
    client.infer(
        model_name=model_name,
        model_version=model_version,
        inputs=[infer_input],
        outputs=[infer_output],
    )
    return (time.perf_counter() - t0) * 1000.0  # ms


def shopper_worker(stop_event, args, result: Result):
    """One simulated shopper: opens its own client connection and issues
    inference requests back to back until told to stop."""
    client = make_client(args.url, args.ssl)
    while not stop_event.is_set():
        try:
            latency_ms = infer_once(
                client,
                args.model_name,
                args.model_version,
                args.input_name,
                args.output_name,
                args.num_features,
            )
            result.record_success(latency_ms)
        except InferenceServerException:
            result.record_error()
        except Exception:
            result.record_error()


def percentile(data, pct):
    if not data:
        return float("nan")
    data_sorted = sorted(data)
    k = (len(data_sorted) - 1) * (pct / 100.0)
    f, c = int(k), min(int(k) + 1, len(data_sorted) - 1)
    if f == c:
        return data_sorted[f]
    return data_sorted[f] + (data_sorted[c] - data_sorted[f]) * (k - f)


def run_regime(args, concurrency: int, label: str):
    print(f"\n=== {label} ===")
    print(f"target: {args.url}  model: {args.model_name}  "
          f"concurrent shoppers: {concurrency}  duration: {args.duration}s")

    result = Result()
    stop_event = threading.Event()
    threads = [
        threading.Thread(target=shopper_worker, args=(stop_event, args, result), daemon=True)
        for _ in range(concurrency)
    ]
    start = time.perf_counter()
    for t in threads:
        t.start()

    # live progress every 2s
    try:
        while time.perf_counter() - start < args.duration:
            time.sleep(2)
            with result.lock:
                n = len(result.latencies_ms)
            elapsed = time.perf_counter() - start
            print(f"  t+{elapsed:5.1f}s  requests so far: {n:>7}  "
                  f"running throughput: {n/elapsed:8.1f} inf/s")
    except KeyboardInterrupt:
        pass

    stop_event.set()
    for t in threads:
        t.join(timeout=5)
    elapsed = time.perf_counter() - start

    with result.lock:
        latencies = list(result.latencies_ms)
        errors = result.errors

    n = len(latencies)
    throughput = n / elapsed if elapsed > 0 else 0.0
    p50 = percentile(latencies, 50)
    p99 = percentile(latencies, 99)
    mean = statistics.mean(latencies) if latencies else float("nan")

    print(f"\n  --- {label}: results ---")
    print(f"  successful requests : {n}")
    print(f"  errors               : {errors}")
    print(f"  wall time            : {elapsed:.1f}s")
    print(f"  throughput           : {throughput:.1f} inf/s")
    print(f"  latency mean         : {mean:.1f} ms")
    print(f"  latency P50          : {p50:.1f} ms")
    print(f"  latency P99          : {p99:.1f} ms")

    return {
        "label": label,
        "concurrency": concurrency,
        "throughput": throughput,
        "p50": p50,
        "p99": p99,
        "errors": errors,
        "n": n,
    }


def print_comparison(rows):
    print("\n=== Light vs. heavy traffic: summary ===")
    header = f"{'regime':<32}{'shoppers':>10}{'inf/s':>10}{'P50 ms':>10}{'P99 ms':>10}{'errors':>8}"
    print(header)
    print("-" * len(header))
    for r in rows:
        print(f"{r['label']:<32}{r['concurrency']:>10}{r['throughput']:>10.1f}"
              f"{r['p50']:>10.1f}{r['p99']:>10.1f}{r['errors']:>8}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default="localhost:8000", help="Triton HTTP endpoint host:port")
    parser.add_argument("--ssl", action="store_true", help="Use TLS to reach Triton")
    parser.add_argument("--model-name", default="ctr_recommender")
    parser.add_argument("--model-version", default="")
    parser.add_argument("--input-name", default="INPUT", help="Must match config.pbtxt input tensor name")
    parser.add_argument("--output-name", default="OUTPUT", help="Must match config.pbtxt output tensor name")
    parser.add_argument("--num-features", type=int, default=32, help="Feature vector width fed to the model")
    parser.add_argument("--duration", type=int, default=30, help="Seconds to run each regime")
    parser.add_argument("--concurrency", type=int, default=300,
                         help="Concurrent shopper threads (ignored if --compare or --traffic is set)")
    parser.add_argument("--traffic", choices=list(TRAFFIC_PRESETS.keys()),
                         help="Run a single named preset instead of --concurrency")
    parser.add_argument("--compare", action="store_true",
                         help="Run light then heavy back-to-back and print a comparison table")
    args = parser.parse_args()

    # sanity check the server is reachable before spinning up hundreds of threads
    try:
        probe = make_client(args.url, args.ssl)
        if not probe.is_server_ready():
            sys.exit(f"Triton at {args.url} is reachable but not ready. Check server logs.")
        if not probe.is_model_ready(args.model_name):
            sys.exit(f"Model '{args.model_name}' is not ready on {args.url}. "
                      f"Check that it loaded successfully (see the launch terminal in the demo).")
    except Exception as e:
        sys.exit(f"Could not reach Triton at {args.url}: {e}")

    if args.compare:
        rows = []
        for key in ("light", "heavy"):
            preset = TRAFFIC_PRESETS[key]
            rows.append(run_regime(args, preset["concurrency"], preset["label"]))
        print_comparison(rows)
    elif args.traffic:
        preset = TRAFFIC_PRESETS[args.traffic]
        run_regime(args, preset["concurrency"], preset["label"])
    else:
        run_regime(args, args.concurrency, f"Custom ({args.concurrency} concurrent shoppers)")


if __name__ == "__main__":
    main()
