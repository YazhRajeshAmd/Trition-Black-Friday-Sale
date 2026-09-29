#!/usr/bin/env python3
"""
export_dummy_model.py

Generates a placeholder, UNTRAINED CTR-style model and exports it to ONNX
so the rest of the pipeline (Triton + config.pbtxt + app.py + the load
test client) is runnable end to end before you have a real trained model
to drop in.

This is deliberately a toy model: a small feed-forward network over a
32-dim random feature vector, ending in a sigmoid (a click-through-rate
score is a probability, so a sigmoid output is the right *shape* of
output even though the weights are meaningless).

Replace the model-building code below with your real architecture and
load real trained weights before this is used for anything beyond
pipeline rehearsal / infra load-testing.

Usage:
    pip install torch onnx
    python scripts/export_dummy_model.py
"""

import argparse
import os

import torch
import torch.nn as nn


class DummyCTRModel(nn.Module):
    def __init__(self, num_features: int = 32, hidden: int = 64):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(num_features, hidden),
            nn.ReLU(),
            nn.Linear(hidden, hidden // 2),
            nn.ReLU(),
            nn.Linear(hidden // 2, 1),
            nn.Sigmoid(),
        )

    def forward(self, x):
        return self.net(x)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--num-features", type=int, default=32)
    parser.add_argument(
        "--out",
        default=os.path.join(
            os.path.dirname(__file__), "..", "triton_repo", "ctr_recommender", "1", "model.onnx"
        ),
    )
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    torch.manual_seed(args.seed)
    model = DummyCTRModel(num_features=args.num_features)
    model.eval()

    dummy_input = torch.randn(1, args.num_features)
    out_path = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    torch.onnx.export(
        model,
        dummy_input,
        out_path,
        input_names=["INPUT"],
        output_names=["OUTPUT"],
        dynamic_axes={"INPUT": {0: "batch_size"}, "OUTPUT": {0: "batch_size"}},
        opset_version=17,
    )
    print(f"Wrote placeholder ONNX model to: {out_path}")
    print("Reminder: this model has random, untrained weights. Its predictions")
    print("are meaningless — it exists only to exercise the serving pipeline.")


if __name__ == "__main__":
    main()
