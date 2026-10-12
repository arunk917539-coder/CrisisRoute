"""Optional local model comparisons. Model output never changes operational truth."""
import math
import os
import re
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException

from .reconcile import _same_place, contradiction_signal, normalized_category


def _configuration():
    enabled = os.getenv("CRISISROUTE_AI_PROVIDER", "ollama").lower() != "off"
    base = os.getenv("CRISISROUTE_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    model = os.getenv("CRISISROUTE_OLLAMA_MODEL", "embeddinggemma:300m-qat-q4_0")
    parsed = urlsplit(base)
    if (parsed.scheme != "http" or parsed.hostname not in {"localhost", "127.0.0.1", "::1"}
            or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path):
        raise ValueError("Local AI requires a loopback HTTP Ollama URL on the backend PC.")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}", model) or "cloud" in model.lower():
        raise ValueError("Choose a locally installed embedding model, not a cloud model.")
    return enabled, base, model


def semantic_status():
    status = {"enabled": False, "available": False, "provider": "ollama", "model": None}
    try:
        enabled, base, model = _configuration()
        status.update(enabled=enabled, model=model)
        if not enabled:
            return {**status, "message": "Local AI is disabled. Rule-based comparison remains available."}
        response = httpx.get(base + "/api/tags", timeout=2, trust_env=False)
        response.raise_for_status()
        installed = {item.get("name") for item in response.json().get("models", [])}
        available = model in installed or (model + ":latest") in installed
        return {**status, "available": available, "message": (
            "Local model installed. Comparisons are advisory and require human review."
            if available else f"Install the local model on the backend PC: ollama pull {model}"
        )}
    except ValueError as exc:
        return {**status, "message": str(exc)}
    except (httpx.HTTPError, KeyError, TypeError, AttributeError):
        return {**status, "message": "Local AI is unavailable. Start Ollama on the backend PC; core workflows remain available."}


def _unit_vectors(raw, expected):
    if not isinstance(raw, list) or len(raw) != expected:
        raise ValueError("Incorrect embedding count")
    result = []
    dimension = None
    for vector in raw:
        if not isinstance(vector, list) or not 1 <= len(vector) <= 8192:
            raise ValueError("Invalid embedding dimensions")
        if dimension is None:
            dimension = len(vector)
        if len(vector) != dimension or any(type(x) not in (int, float) or not math.isfinite(x) for x in vector):
            raise ValueError("Invalid embedding values")
        length = math.hypot(*vector)
        if not math.isfinite(length) or length == 0:
            raise ValueError("Empty or non-finite embedding")
        result.append([value / length for value in vector])
    return result


def compare_reports(report, others):
    """Compare at most 50 scoped reports; return candidates, never verification."""
    try:
        enabled, base, model = _configuration()
    except ValueError as exc:
        raise HTTPException(503, str(exc)) from exc
    if not enabled:
        raise HTTPException(503, "Local AI is disabled. Rule-based comparison remains available.")
    candidates = sorted((other for other in others
        if other.id != report.id and other.report_type == report.report_type
        and normalized_category(other.category) == normalized_category(report.category)
        and _same_place(report, other)), key=lambda item: item.id, reverse=True)[:50]
    if not candidates:
        return []
    texts = [f"{item.category}: {item.description}" for item in [report, *candidates]]
    try:
        response = httpx.post(base + "/api/embed", json={
            "model": model, "input": texts, "truncate": False, "keep_alive": "5m",
        }, timeout=55, trust_env=False)
        response.raise_for_status()
        vectors = _unit_vectors(response.json().get("embeddings"), len(texts))
    except (httpx.HTTPError, ValueError, TypeError, AttributeError, OverflowError) as exc:
        raise HTTPException(503, "Local model comparison failed. Check Ollama and the installed embedding model. No report decisions or quantities were changed.") from exc
    suggestions = []
    for other, vector in zip(candidates, vectors[1:]):
        score = max(-1.0, min(1.0, sum(a * b for a, b in zip(vectors[0], vector))))
        if score < 0.72:
            continue
        conflict = contradiction_signal(report.description, other.description)
        reason = (f"Local {model} text embeddings have cosine similarity {score:.3f}; "
                  "same category and location within 500 m (or matching location text). "
                  "Similarity is not a probability or proof of a shared incident.")
        if conflict:
            reason += " Opposing status wording also needs human review."
        if report.required_quantity != other.required_quantity:
            reason += f" Quantities differ ({report.required_quantity:g} versus {other.required_quantity:g}); do not add them automatically."
        suggestions.append({"report_id": other.id, "similarity": round(score, 4),
            "reason": reason, "method": "ollama_embedding",
            "relationship_type": "possible_conflict" if conflict else "possible_duplicate"})
    return sorted(suggestions, key=lambda item: item["similarity"], reverse=True)
