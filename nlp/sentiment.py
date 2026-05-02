"""FinBERT sentiment wrapper.

Loads the model lazily on first call. Returns a normalized score in [-1, +1]
(positive_prob - negative_prob), the argmax label, and the max softmax prob
as confidence.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from config import settings

log = logging.getLogger(__name__)

MAX_LEN = 512


@dataclass
class SentimentResult:
    label: str  # 'positive' | 'neutral' | 'negative'
    score: float  # signed: -1.0 to +1.0
    confidence: float  # 0.0 to 1.0


@lru_cache(maxsize=1)
def _load():
    name = settings.sentiment_model
    log.info("Loading sentiment model: %s", name)
    tokenizer = AutoTokenizer.from_pretrained(name)
    model = AutoModelForSequenceClassification.from_pretrained(name)
    model.eval()
    return tokenizer, model


def _label_index(model, name: str) -> int:
    for idx, label in model.config.id2label.items():
        if label.lower() == name.lower():
            return idx
    raise KeyError(f"label {name} not found in model config")


def score_text(text: str) -> SentimentResult:
    return score_batch([text])[0]


def score_batch(texts: list[str]) -> list[SentimentResult]:
    if not texts:
        return []
    tokenizer, model = _load()
    pos_idx = _label_index(model, "positive")
    neg_idx = _label_index(model, "negative")

    enc = tokenizer(
        texts, padding=True, truncation=True, max_length=MAX_LEN, return_tensors="pt"
    )
    with torch.no_grad():
        logits = model(**enc).logits
        probs = torch.softmax(logits, dim=-1)

    results: list[SentimentResult] = []
    for row in probs:
        row_list = row.tolist()
        argmax = int(row.argmax().item())
        label = model.config.id2label[argmax].lower()
        score = float(row_list[pos_idx] - row_list[neg_idx])
        confidence = float(max(row_list))
        results.append(SentimentResult(label=label, score=score, confidence=confidence))
    return results
