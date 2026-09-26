import re
import math

STOPWORDS = {
    "a","an","the","and","or","of","to","at","in","on","for","with","is","are",
    "was","were","after","before","people","need","needs","report","reported",
    "this","that","from","due","by","as"
}

# Small domain vocabulary normalizations keep the demo deterministic/offline.
NORMALIZE = {
    "packets": "packet", "supplies": "supply", "supplied": "supply",
    "blocked": "block", "blocking": "block", "closed": "close",
    "passable": "pass", "open": "open", "flooded": "flood",
    "flooding": "flood", "clear": "clear", "unsafe": "unsafe", "safe": "safe",
}

def _tokens(text: str):
    raw = re.findall(r"[a-z0-9]+", (text or "").lower())
    return {
        NORMALIZE.get(t, t)
        for t in raw
        if t not in STOPWORDS and len(t) > 1
    }

def lexical_semantic_similarity(a: str, b: str) -> float:
    """Offline deterministic semantic-style similarity for demo reliability."""
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    union = len(ta | tb)
    jaccard = inter / union if union else 0.0
    containment = inter / min(len(ta), len(tb))
    # Containment helps short reports match longer descriptions.
    return round(min(1.0, 0.65 * jaccard + 0.35 * containment), 3)

def _has_status(text: str, status: str) -> bool:
    """Return whether a status is asserted, while avoiding common negated forms."""
    text = (text or "").lower()
    negated = {
        "blocked": ("not blocked", "no longer blocked", "never blocked"),
        "closed": ("not closed", "no longer closed", "never closed"),
        "unsafe": ("not unsafe", "no longer unsafe"),
        "flooded": ("not flooded", "no longer flooded"),
        "passable": ("not passable", "no longer passable"),
        "open": ("not open", "no longer open"),
        "safe": ("not safe", "no longer safe"),
        "clear": ("not clear", "no longer clear"),
    }
    if any(phrase in text for phrase in negated.get(status, ())):
        return False
    return status in text

def contradiction_signal(a: str, b: str) -> bool:
    pairs = [
        ("blocked", "passable"),
        ("closed", "open"),
        ("unsafe", "safe"),
        ("flooded", "clear"),
    ]
    return any(
        (_has_status(a, x) and _has_status(b, y)) or
        (_has_status(a, y) and _has_status(b, x))
        for x, y in pairs
    )

def suggest_relationship(a, b):
    same_place = a.location.strip().lower() == b.location.strip().lower()
    same_category = a.category.strip().lower() == b.category.strip().lower()
    conflict = contradiction_signal(a.description, b.description)
    semantic = lexical_semantic_similarity(
        f"{a.category} {a.description} {a.location}",
        f"{b.category} {b.description} {b.location}",
    )

    if conflict:
        return "possible_conflict", max(semantic, 0.45), "Contradictory status signals in reports"

    if same_place and same_category and semantic >= 0.35:
        return "possible_duplicate", max(semantic, 0.35), "Same location/category with semantically similar report text"

    if semantic >= 0.70:
        return "possible_duplicate", semantic, "High semantic similarity between report descriptions"

    return None
