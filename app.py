#!/usr/bin/env python3
"""
app.py — backend for the "Black Friday Shopping Rush" demo.

Serves the UI (static/index.html) and exposes a small JSON API that the
page polls. Every number the UI shows comes from this one contract:

    GET  /api/metrics   -> current dashboard snapshot
    POST /api/rush       -> {"action": "start"|"stop"} the traffic ramp
    POST /api/launch      -> probe Triton readiness (for the "Configure &
                              launch" screen's Run tritonserver button)
    GET  /api/health      -> quick reachability summary

Two modes, chosen automatically:

  LIVE       Triton Inference Server is reachable and the configured model
             is ready. A small pool of real worker threads (see
             LiveEngine) sends genuine inference requests to Triton and
             the dashboard shows measured throughput / P50 / P99 / queue
             depth / GPU utilization. No ROCm-specific code lives here —
             the GPU work happens inside Triton via the ROCm execution
             accelerator configured in triton_repo/ctr_recommender/config.pbtxt.

  SIMULATED  Triton isn't reachable (e.g. rehearsing on a laptop with no
             GPU host nearby). Falls back to the same light->heavy ramp
             math used in the original mockup, so the UI still works for
             a walkthrough — every simulated value is clearly labeled
             "simulated" in the API response and in the UI.

Run:
    pip install -r requirements.txt
    python app.py
    # then open http://localhost:5000
"""

import os
import time
import threading
import statistics
import re
from collections import deque

from flask import Flask, jsonify, request, send_from_directory

import numpy as np
import requests

try:
    import tritonclient.http as httpclient
    from tritonclient.utils import InferenceServerException
    TRITONCLIENT_AVAILABLE = True
except ImportError:
    TRITONCLIENT_AVAILABLE = False


# ---------------------------------------------------------------------------
# Configuration (env-overridable)
# ---------------------------------------------------------------------------
TRITON_HTTP_URL = os.environ.get("TRITON_HTTP_URL", "localhost:8000")
TRITON_METRICS_URL = os.environ.get(
    "TRITON_METRICS_URL", f"http://{TRITON_HTTP_URL.split(':')[0]}:8002/metrics"
)
MODEL_NAME = os.environ.get("MODEL_NAME", "ctr_recommender")
MODEL_VERSION = os.environ.get("MODEL_VERSION", "")
INPUT_NAME = os.environ.get("INPUT_NAME", "INPUT")
OUTPUT_NAME = os.environ.get("OUTPUT_NAME", "OUTPUT")
NUM_FEATURES = int(os.environ.get("NUM_FEATURES", "32"))

BASELINE_SHOPPERS = int(os.environ.get("BASELINE_SHOPPERS", "320"))
HEAVY_SHOPPERS = int(os.environ.get("HEAVY_SHOPPERS", "4800"))
LIVE_MAX_WORKERS = int(os.environ.get("LIVE_MAX_WORKERS", "64"))
SHOPPER_TO_WORKER_RATIO = int(os.environ.get("SHOPPER_TO_WORKER_RATIO", "50"))
USE_ROCM_SMI = os.environ.get("USE_ROCM_SMI", "0") == "1"
ROLLING_WINDOW_SECONDS = float(os.environ.get("ROLLING_WINDOW_SECONDS", "3"))
POLL_INTERVAL = float(os.environ.get("POLL_INTERVAL", "1.0"))
BASELINE_CAP = 1000  # inf/s a naive, unbatched setup is assumed to sustain

app = Flask(__name__, static_folder="static", static_url_path="")


# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------
class SharedState:
    def __init__(self):
        self.lock = threading.Lock()
        self.mode = "simulated"          # "live" or "simulated"
        self.rushing = False
        self.tick = 0
        self.shoppers = float(BASELINE_SHOPPERS)
        self.recs_served = 0.0
        self.revenue = 0.0
        self.gpu_util = [38.0, 41.0, 36.0, 40.0]
        self.gpu_util_source = None      # "rocm-smi" | "triton-metrics" | "estimated" | None
        self.queue_depth = None
        self.batch_size_estimate = None
        self.throughput = 0.0
        self.p50 = 0.0
        self.p99 = 0.0
        self.errors = 0
        self.live_workers = 0

    def snapshot(self):
        with self.lock:
            heavy = self.shoppers > (BASELINE_SHOPPERS + HEAVY_SHOPPERS) / 2
            return {
                "mode": self.mode,
                "rushing": self.rushing,
                "regime": "heavy" if heavy else "light",
                "shoppers": round(self.shoppers),
                "throughput_inf_s": round(self.throughput, 1),
                "latency_p50_ms": round(self.p50, 1),
                "latency_p99_ms": round(self.p99, 1),
                "queue_depth": self.queue_depth,
                "batch_size_estimate": self.batch_size_estimate,
                "gpu_utilization": [round(g, 1) for g in self.gpu_util],
                "gpu_utilization_source": self.gpu_util_source,
                "recs_served_cumulative": round(self.recs_served),
                "revenue_opportunity": round(self.revenue, 2),
                "baseline_cap": BASELINE_CAP,
                "errors": self.errors,
                "live_workers": self.live_workers,
            }


state = SharedState()


# ---------------------------------------------------------------------------
# Simulated engine — ported from the original mockup's client-side math.
# Used whenever Triton isn't reachable so the UI still tells a coherent
# story during rehearsal.
# ---------------------------------------------------------------------------
def simulated_target_shoppers(tick, rushing):
    import math
    if not rushing:
        return BASELINE_SHOPPERS + math.sin(tick / 6) * 60
    ramp = min(1.0, tick / 26)
    return BASELINE_SHOPPERS + ramp * (HEAVY_SHOPPERS - BASELINE_SHOPPERS) + math.sin(tick / 4) * 180


def simulated_step():
    import math, random
    s = state
    s.tick += 1
    target = simulated_target_shoppers(s.tick, s.rushing)
    s.shoppers += (target - s.shoppers) * 0.25 + (random.random() - 0.5) * 40
    s.shoppers = max(120.0, s.shoppers)

    load_ratio = min(1.0, s.shoppers / (HEAVY_SHOPPERS * 1.08))
    rps = s.shoppers * (0.98 + random.random() * 0.06)
    cap_handled = min(rps, BASELINE_CAP * 5.05)
    s.p50 = 34 + load_ratio * 14 + random.random() * 4
    s.p99 = s.p50 * 1.38
    s.batch_size_estimate = round(16 + load_ratio * 240)
    s.queue_depth = round(load_ratio * 2)  # stays near 0, batching keeps up
    s.gpu_util = [
        max(8.0, min(96.0, g + ((35 + load_ratio * 55 + math.sin(s.tick / 5 + i) * 4) - g) * 0.3))
        for i, g in enumerate(s.gpu_util)
    ]
    s.gpu_util_source = "estimated"
    s.throughput = cap_handled
    s.recs_served += cap_handled * (POLL_INTERVAL)
    conv = s.recs_served * 0.038
    s.revenue = conv * 85


# ---------------------------------------------------------------------------
# Live engine — real worker threads sending real inference requests to a
# real Triton server. GPU acceleration happens entirely server-side.
# ---------------------------------------------------------------------------
class LiveEngine:
    def __init__(self):
        self.workers = []          # list of (thread, stop_event)
        self.pool_lock = threading.Lock()
        self.latency_window = deque()   # (timestamp, latency_ms)
        self.window_lock = threading.Lock()
        self.prev_metric_counters = {}  # for computing deltas between polls

    def _worker_loop(self, stop_event):
        client = httpclient.InferenceServerClient(url=TRITON_HTTP_URL, verbose=False)
        while not stop_event.is_set():
            try:
                infer_input = httpclient.InferInput(INPUT_NAME, [1, NUM_FEATURES], "FP32")
                infer_input.set_data_from_numpy(np.random.rand(1, NUM_FEATURES).astype(np.float32))
                infer_output = httpclient.InferRequestedOutput(OUTPUT_NAME)
                t0 = time.perf_counter()
                client.infer(
                    model_name=MODEL_NAME,
                    model_version=MODEL_VERSION,
                    inputs=[infer_input],
                    outputs=[infer_output],
                )
                latency_ms = (time.perf_counter() - t0) * 1000.0
                with self.window_lock:
                    self.latency_window.append((time.time(), latency_ms))
            except Exception:
                with state.lock:
                    state.errors += 1

    def adjust_pool(self, target_workers):
        target_workers = max(1, min(LIVE_MAX_WORKERS, target_workers))
        with self.pool_lock:
            current = len(self.workers)
            if target_workers > current:
                for _ in range(target_workers - current):
                    ev = threading.Event()
                    t = threading.Thread(target=self._worker_loop, args=(ev,), daemon=True)
                    t.start()
                    self.workers.append((t, ev))
            elif target_workers < current:
                to_remove = self.workers[target_workers:]
                self.workers = self.workers[:target_workers]
                for _, ev in to_remove:
                    ev.set()
            state.live_workers = len(self.workers)

    def rolling_stats(self):
        cutoff = time.time() - ROLLING_WINDOW_SECONDS
        with self.window_lock:
            while self.latency_window and self.latency_window[0][0] < cutoff:
                self.latency_window.popleft()
            latencies = [l for _, l in self.latency_window]
        n = len(latencies)
        throughput = n / ROLLING_WINDOW_SECONDS if n else 0.0
        p50 = percentile(latencies, 50) if latencies else 0.0
        p99 = percentile(latencies, 99) if latencies else 0.0
        return throughput, p50, p99, n

    def fetch_gpu_util_rocm_smi(self):
        if not USE_ROCM_SMI:
            return None
        try:
            import subprocess, json as _json
            out = subprocess.check_output(
                ["rocm-smi", "--showuse", "--json"], stderr=subprocess.DEVNULL, timeout=2
            )
            data = _json.loads(out.decode("utf-8"))
            vals = []
            for _, card in sorted(data.items()):
                use = card.get("GPU use (%)") or card.get("GPU Utilization (%)")
                if use is not None:
                    vals.append(float(use))
            return vals or None
        except Exception:
            return None

    def fetch_triton_metrics(self):
        """Best-effort scrape of Triton's Prometheus /metrics endpoint.
        Metric availability (esp. GPU utilization) depends on how Triton
        was built and whether GPU metrics are supported/enabled for your
        ROCm build — treat these as best-effort, not guaranteed."""
        try:
            resp = requests.get(TRITON_METRICS_URL, timeout=2)
            resp.raise_for_status()
        except Exception:
            return {}
        text = resp.text
        result = {}

        def grab(metric, label_filter=None):
            vals = []
            for line in text.splitlines():
                if line.startswith("#") or not line.startswith(metric):
                    continue
                if label_filter and label_filter not in line:
                    continue
                m = re.search(r"}\s+([0-9eE+\-.]+)$", line)
                if not m:
                    m = re.search(r"\s+([0-9eE+\-.]+)$", line)
                if m:
                    vals.append(float(m.group(1)))
            return vals

        model_filter = f'model="{MODEL_NAME}"'
        pending = grab("nv_inference_pending_request_count", model_filter)
        success = grab("nv_inference_request_success", model_filter)
        exec_count = grab("nv_inference_exec_count", model_filter)
        gpu_util = grab("nv_gpu_utilization")

        if pending:
            result["queue_depth"] = round(sum(pending))
        if success and exec_count and exec_count[0] > 0:
            prev = self.prev_metric_counters
            d_success = success[0] - prev.get("success", success[0])
            d_exec = exec_count[0] - prev.get("exec", exec_count[0])
            if d_exec > 0:
                result["batch_size_estimate"] = round(d_success / d_exec, 1)
            self.prev_metric_counters = {"success": success[0], "exec": exec_count[0]}
        if gpu_util:
            # nv_gpu_utilization is typically reported as a 0..1 fraction
            result["gpu_utilization"] = [v * 100 if v <= 1.0 else v for v in gpu_util]
        return result

    def tick(self, target_shoppers):
        self.adjust_pool(round(target_shoppers / SHOPPER_TO_WORKER_RATIO))
        throughput, p50, p99, n = self.rolling_stats()

        gpu = self.fetch_gpu_util_rocm_smi()
        gpu_source = "rocm-smi" if gpu else None
        extra = self.fetch_triton_metrics()
        if gpu is None and extra.get("gpu_utilization"):
            gpu = extra["gpu_utilization"]
            gpu_source = "triton-metrics"

        with state.lock:
            state.shoppers = target_shoppers
            state.throughput = throughput
            state.p50 = p50
            state.p99 = p99
            state.queue_depth = extra.get("queue_depth", state.queue_depth)
            state.batch_size_estimate = extra.get("batch_size_estimate", state.batch_size_estimate)
            if gpu:
                state.gpu_util = gpu
                state.gpu_util_source = gpu_source
            elif state.gpu_util_source != "estimated":
                # no real source available this tick — fall back to a load-based
                # estimate rather than showing a stale number, and label it as such.
                load_ratio = min(1.0, target_shoppers / (HEAVY_SHOPPERS * 1.08))
                state.gpu_util = [min(96.0, 35 + load_ratio * 55) for _ in range(4)]
                state.gpu_util_source = "estimated"
            state.recs_served += throughput * POLL_INTERVAL
            state.revenue = state.recs_served * 0.038 * 85


def percentile(data, pct):
    if not data:
        return 0.0
    data_sorted = sorted(data)
    k = (len(data_sorted) - 1) * (pct / 100.0)
    f, c = int(k), min(int(k) + 1, len(data_sorted) - 1)
    if f == c:
        return data_sorted[f]
    return data_sorted[f] + (data_sorted[c] - data_sorted[f]) * (k - f)


live_engine = LiveEngine() if TRITONCLIENT_AVAILABLE else None


def check_triton_ready():
    if not TRITONCLIENT_AVAILABLE:
        return False, "tritonclient is not installed"
    try:
        probe = httpclient.InferenceServerClient(url=TRITON_HTTP_URL, verbose=False)
        if not probe.is_server_ready():
            return False, "server reachable but not ready"
        if not probe.is_model_ready(MODEL_NAME):
            return False, f"model '{MODEL_NAME}' not ready"
        return True, "ok"
    except Exception as e:
        return False, str(e)


# ---------------------------------------------------------------------------
# Background loop
# ---------------------------------------------------------------------------
def background_loop():
    check_counter = 0
    while True:
        check_counter += 1
        if check_counter % 5 == 1:  # re-probe Triton every ~5 ticks, not every tick
            ready, _ = check_triton_ready()
            with state.lock:
                state.mode = "live" if ready else "simulated"

        with state.lock:
            mode = state.mode
            rushing = state.rushing
            tick = state.tick

        if mode == "live" and live_engine is not None:
            target = HEAVY_SHOPPERS if rushing else BASELINE_SHOPPERS
            live_engine.tick(target)
        else:
            if live_engine is not None:
                live_engine.adjust_pool(0)  # tear down real workers while simulated
            simulated_step()

        time.sleep(POLL_INTERVAL)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/metrics")
def api_metrics():
    return jsonify(state.snapshot())


@app.route("/api/rush", methods=["POST"])
def api_rush():
    body = request.get_json(silent=True) or {}
    action = body.get("action")
    with state.lock:
        if action == "start":
            state.rushing = True
        elif action == "stop":
            state.rushing = False
        else:
            state.rushing = not state.rushing
        if not state.rushing:
            state.tick = 0
        result = {"rushing": state.rushing}
    return jsonify(result)


@app.route("/api/reset", methods=["POST"])
def api_reset():
    with state.lock:
        state.rushing = False
        state.tick = 0
        state.shoppers = float(BASELINE_SHOPPERS)
        state.recs_served = 0.0
        state.revenue = 0.0
        state.errors = 0
    if live_engine is not None:
        live_engine.adjust_pool(0)
    return jsonify({"reset": True})


@app.route("/api/launch", methods=["POST"])
def api_launch():
    ready, detail = check_triton_ready()
    return jsonify({
        "ready": ready,
        "detail": detail,
        "mode": "live" if ready else "simulated",
        "triton_url": TRITON_HTTP_URL,
        "model_name": MODEL_NAME,
    })


@app.route("/api/health")
def api_health():
    ready, detail = check_triton_ready()
    return jsonify({
        "triton_url": TRITON_HTTP_URL,
        "model_name": MODEL_NAME,
        "tritonclient_installed": TRITONCLIENT_AVAILABLE,
        "triton_ready": ready,
        "detail": detail,
    })


if __name__ == "__main__":
    t = threading.Thread(target=background_loop, daemon=True)
    t.start()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), use_reloader=False)
