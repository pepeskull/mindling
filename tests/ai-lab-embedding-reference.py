"""Independent ONNX Runtime reference for the eight-sentence embedding case.

Install onnxruntime, tokenizers, and numpy in a disposable environment. Download
the exact pinned repositories documented in ai-lab/EMBEDDING_INVESTIGATION.md,
then set MINDLING_AI_LAB_REFERENCE_ROOT to a directory containing `minilm/` and
`e5/`, each with tokenizer.json and onnx/model_quantized.onnx.
"""
import json
import os
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

SENTENCES = [
    "I want to become a successful stock trader.",
    "You should learn how to invest in stocks.",
    "I think programming is amazing.",
    "How does the stock market work?",
    "The Earth rotates around its axis.",
    "Yesterday I lost money trading cryptocurrencies.",
    "Jag vill lära mig att programmera.",
    "Jag tycker att aktiehandel är svårt.",
]


def run(name, root, prefix):
    tokenizer = Tokenizer.from_file(str(root / "tokenizer.json"))
    tokenizer.enable_truncation(max_length=512)
    pad_id = tokenizer.token_to_id("<pad>")
    tokenizer.enable_padding(pad_id=0 if pad_id is None else pad_id, pad_token="<pad>")
    encoded = tokenizer.encode_batch([prefix + text for text in SENTENCES])
    input_ids = np.asarray([row.ids for row in encoded], dtype=np.int64)
    attention_mask = np.asarray([row.attention_mask for row in encoded], dtype=np.int64)
    token_type_ids = np.asarray([row.type_ids for row in encoded], dtype=np.int64)
    session = ort.InferenceSession(str(root / "onnx/model_quantized.onnx"), providers=["CPUExecutionProvider"])
    input_names = {item.name for item in session.get_inputs()}
    possible = {"input_ids": input_ids, "attention_mask": attention_mask, "token_type_ids": token_type_ids}
    output = session.run(None, {key: value for key, value in possible.items() if key in input_names})[0]
    expanded_mask = attention_mask[..., None].astype(np.float32)
    pooled = (output * expanded_mask).sum(axis=1) / np.clip(expanded_mask.sum(axis=1), 1e-9, None)
    vectors = pooled / np.linalg.norm(pooled, axis=1, keepdims=True)
    repeated = session.run(None, {key: value for key, value in possible.items() if key in input_names})[0]
    repeated_pooled = (repeated * expanded_mask).sum(axis=1) / np.clip(expanded_mask.sum(axis=1), 1e-9, None)
    repeated_vectors = repeated_pooled / np.linalg.norm(repeated_pooled, axis=1, keepdims=True)
    return {
        "model": name,
        "prefix": prefix,
        "providers": session.get_providers(),
        "outputShape": list(output.shape),
        "tokenCounts": [int(sum(row.attention_mask)) for row in encoded],
        "tokenIds": [row.ids for row in encoded],
        "attentionMasks": [row.attention_mask for row in encoded],
        "dimensions": int(vectors.shape[1]),
        "norms": np.linalg.norm(vectors, axis=1).tolist(),
        "minimums": vectors.min(axis=1).tolist(),
        "maximums": vectors.max(axis=1).tolist(),
        "means": vectors.mean(axis=1).tolist(),
        "standardDeviations": vectors.std(axis=1).tolist(),
        "repeatMaxAbsoluteDifference": float(np.max(np.abs(vectors - repeated_vectors))),
        "matrix": (vectors @ vectors.T).tolist(),
    }


root = Path(os.environ.get("MINDLING_AI_LAB_REFERENCE_ROOT", ""))
if not root.is_dir():
    raise SystemExit("Set MINDLING_AI_LAB_REFERENCE_ROOT to the prepared model asset directory.")

print(json.dumps([
    run("multilingual-minilm", root / "minilm", ""),
    run("multilingual-e5-small-query", root / "e5", "query: "),
    run("multilingual-e5-small-passage", root / "e5", "passage: "),
], ensure_ascii=False, indent=2))
