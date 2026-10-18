"""Independent real-model evaluation for AI Lab NLI information types.

Prepare the exact model snapshot with config.json, tokenizer.json,
tokenizer_config.json, and onnx/model_quantized.onnx. Then run:

  MINDLING_NLI_MODEL_ROOT=/tmp/mindling-nli-model \
    python3 tests/ai-lab-nli-reference.py > /tmp/nli-reference.json

Requires numpy, onnxruntime, and tokenizers in a disposable test environment.
No model output is mocked and no player data is accessed.
"""
import json
import os
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

REPOSITORY = Path(__file__).resolve().parents[1]
DATA = json.loads((REPOSITORY / "ai-lab/nli-benchmark.json").read_text())
MODEL_ROOT = Path(os.environ.get("MINDLING_NLI_MODEL_ROOT", ""))
if not MODEL_ROOT.is_dir():
    raise SystemExit("Set MINDLING_NLI_MODEL_ROOT to the prepared exact model snapshot.")

TYPES = list(DATA["labelingPolicy"])
ORIGINAL_LABELS = {
    "FACT_CLAIM": "a factual claim", "AMBITION": "a personal ambition or desire",
    "GOAL": "a planned goal", "INSTRUCTION": "a direct instruction or command",
    "ADVICE": "advice or recommendation", "OPINION": "a personal opinion",
    "QUESTION": "a question", "EXPERIENCE": "a past personal experience",
    "UNCERTAIN": "ambiguous or uncertain intent",
}
PHRASES = {
    "FACT_CLAIM": "stating a fact", "AMBITION": "expressing an aspiration",
    "GOAL": "stating a concrete plan", "INSTRUCTION": "giving a command",
    "ADVICE": "giving a recommendation", "OPINION": "expressing a judgment",
    "QUESTION": "requesting information", "EXPERIENCE": "reporting a personal experience",
    "UNCERTAIN": "unclear or ambiguous",
}
PURPOSES = {
    "FACT_CLAIM": "state a fact", "AMBITION": "express an aspiration",
    "GOAL": "state a concrete goal", "INSTRUCTION": "give an instruction",
    "ADVICE": "give advice", "OPINION": "express an opinion", "QUESTION": "ask a question",
    "EXPERIENCE": "describe a personal experience", "UNCERTAIN": "express an unclear intent",
}
DIRECT = {
    "FACT_CLAIM": "The speaker states information as a fact.",
    "AMBITION": "The speaker expresses a personal ambition, wish, or dream.",
    "GOAL": "The speaker describes a concrete goal, plan, or commitment.",
    "INSTRUCTION": "The speaker directly instructs someone to do something.",
    "ADVICE": "The speaker gives advice or a recommendation.",
    "OPINION": "The speaker expresses a personal opinion or judgment.",
    "QUESTION": "The speaker asks for information.",
    "EXPERIENCE": "The speaker describes something they personally did or experienced.",
    "UNCERTAIN": "The speaker's communicative intent is unclear or ambiguous.",
}
SHORT = {
    "FACT_CLAIM": "This is a factual statement.", "AMBITION": "This is a personal aspiration.",
    "GOAL": "This is a concrete plan.", "INSTRUCTION": "This is a direct command.",
    "ADVICE": "This is a recommendation.", "OPINION": "This is a subjective judgment.",
    "QUESTION": "This is a request for information.",
    "EXPERIENCE": "This is a report of a past personal experience.",
    "UNCERTAIN": "This has unclear communicative intent.",
}
PROFILES = {
    "original": {key: f"This text is {value}." for key, value in ORIGINAL_LABELS.items()},
    "intent": {key: f"The intent of this sentence is {value}." for key, value in {
        "FACT_CLAIM": "fact", "AMBITION": "ambition", "GOAL": "goal", "INSTRUCTION": "instruction",
        "ADVICE": "advice", "OPINION": "opinion", "QUESTION": "question",
        "EXPERIENCE": "experience", "UNCERTAIN": "unclear",
    }.items()},
    "purpose": {key: f"The sentence is written to {value}." for key, value in PURPOSES.items()},
    "function": {key: f"The text's main communicative function is {value}." for key, value in PHRASES.items()},
    "direct": DIRECT,
    "direct_short": SHORT,
}
METHODS = ["entail_softmax", "entail_probability", "entail_minus_contradiction", "entail_minus_other"]

config = json.loads((MODEL_ROOT / "config.json").read_text())
mapping = {key.lower(): int(value) for key, value in config["label2id"].items()}
label_ids = {
    "entailment": mapping["entailment"],
    "neutral": mapping["neutral"],
    "contradiction": mapping.get("contradiction", mapping.get("not_entailment")),
}
if len(set(label_ids.values())) != 3:
    raise SystemExit("Invalid NLI label mapping in model config.")

tokenizer = Tokenizer.from_file(str(MODEL_ROOT / "tokenizer.json"))
tokenizer_config = json.loads((MODEL_ROOT / "tokenizer_config.json").read_text())
pad_token = tokenizer_config.get("pad_token", "<pad>")
pad_id = tokenizer.token_to_id(pad_token)
tokenizer.enable_padding(pad_id=config.get("pad_token_id", 0) if pad_id is None else pad_id, pad_token=pad_token)
tokenizer.enable_truncation(max_length=min(512, int(tokenizer_config.get("model_max_length", 512))))
session = ort.InferenceSession(str(MODEL_ROOT / "onnx/model_quantized.onnx"), providers=["CPUExecutionProvider"])
input_names = {item.name for item in session.get_inputs()}


def softmax(values, axis=-1):
    centered = values - np.max(values, axis=axis, keepdims=True)
    exponentials = np.exp(centered)
    return exponentials / exponentials.sum(axis=axis, keepdims=True)


def infer(cases, hypotheses):
    encoded = tokenizer.encode_batch([(case["text"], hypotheses[label]) for case in cases for label in TYPES])
    possible = {
        "input_ids": np.asarray([row.ids for row in encoded], dtype=np.int64),
        "attention_mask": np.asarray([row.attention_mask for row in encoded], dtype=np.int64),
        "token_type_ids": np.asarray([row.type_ids for row in encoded], dtype=np.int64),
    }
    output = session.run(None, {key: value for key, value in possible.items() if key in input_names})[0]
    return output.reshape(len(cases), len(TYPES), 3)


def scores(logits, method):
    entailment = logits[:, :, label_ids["entailment"]]
    neutral = logits[:, :, label_ids["neutral"]]
    contradiction = logits[:, :, label_ids["contradiction"]]
    if method == "entail_softmax":
        return softmax(entailment, axis=1)
    if method == "entail_probability":
        values = softmax(logits, axis=2)[:, :, label_ids["entailment"]]
        return values / values.sum(axis=1, keepdims=True)
    if method == "entail_minus_contradiction":
        return softmax(entailment - contradiction, axis=1)
    if method == "entail_minus_other":
        return softmax(entailment - np.maximum(neutral, contradiction), axis=1)
    raise ValueError(method)


def metrics(cases, values):
    predicted_indices = np.argmax(values, axis=1)
    expected_indices = np.asarray([TYPES.index(case["expected"]) for case in cases])
    confusion = np.zeros((len(TYPES), len(TYPES)), dtype=int)
    for expected, predicted in zip(expected_indices, predicted_indices):
        confusion[expected, predicted] += 1
    per_category = {}
    for position, category in enumerate(TYPES):
        true_positive = int(confusion[position, position])
        actual = int(confusion[position].sum())
        predicted = int(confusion[:, position].sum())
        precision = true_positive / predicted if predicted else 0
        recall = true_positive / actual if actual else 0
        per_category[category] = {
            "precision": precision,
            "recall": recall,
            "f1": 2 * precision * recall / (precision + recall) if precision + recall else 0,
            "support": actual,
        }
    by_language = {}
    for language in sorted({case["language"] for case in cases}):
        positions = [position for position, case in enumerate(cases) if case["language"] == language]
        by_language[language] = {
            "accuracy": float(np.mean(predicted_indices[positions] == expected_indices[positions])),
            "count": len(positions),
        }
    return {
        "accuracy": float(np.mean(predicted_indices == expected_indices)),
        "confusion": confusion.tolist(),
        "perCategory": per_category,
        "byLanguage": by_language,
        "predictions": [{
            "id": case["id"], "expected": case["expected"], "predicted": TYPES[predicted],
            "score": float(values[index, predicted]),
        } for index, (case, predicted) in enumerate(zip(cases, predicted_indices))],
    }


results = {}
raw_cache = {}
for profile, hypotheses in PROFILES.items():
    results[profile] = {}
    raw_cache[profile] = {}
    for split in ["diagnostic", "tuning", "heldOut"]:
        logits = infer(DATA[split], hypotheses)
        raw_cache[profile][split] = logits
        results[profile][split] = {method: metrics(DATA[split], scores(logits, method)) for method in METHODS}

first = raw_cache["original"]["diagnostic"][0]
print(json.dumps({
    "modelRoot": str(MODEL_ROOT),
    "providers": session.get_providers(),
    "labelMapping": label_ids,
    "types": TYPES,
    "profiles": PROFILES,
    "splits": {key: len(DATA[key]) for key in ["diagnostic", "tuning", "heldOut"]},
    "summary": [{
        "profile": profile, "split": split, "method": method,
        "accuracy": results[profile][split][method]["accuracy"],
    } for profile in PROFILES for split in ["diagnostic", "tuning", "heldOut"] for method in METHODS],
    "baseline": results["original"]["heldOut"]["entail_softmax"],
    "tuningSelectedExperiment": results["intent"]["heldOut"]["entail_probability"],
    "rawFirstDiagnostic": [{
        "type": category,
        "hypothesis": PROFILES["original"][category],
        "entailment": float(first[position, label_ids["entailment"]]),
        "neutral": float(first[position, label_ids["neutral"]]),
        "contradiction": float(first[position, label_ids["contradiction"]]),
    } for position, category in enumerate(TYPES)],
}, ensure_ascii=False, indent=2))
