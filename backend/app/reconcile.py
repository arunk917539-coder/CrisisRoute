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
    text = re.sub(
        r"\b(?:not|never|no longer|isn't|aren't|wasn't|weren't)\s+"
        r"(?:(?:currently|now|yet|fully|still)\s+)?" + re.escape(status) + r"\b",
        "", text,
    )
    return re.search(r"\b" + re.escape(status) + r"\b", text) is not None


def normalized_category(value: str) -> str:
    category = " ".join((value or "").lower().split())
    return {
        "water": "drinking water", "potable water": "drinking water",
        "food packets": "food", "food supplies": "food",
        "medical aid": "medical", "medical supplies": "medical",
    }.get(category, category)


def _same_place(a, b) -> bool:
    coordinates = [getattr(r, name, None) for r in (a, b) for name in ("latitude", "longitude")]
    if all(value is not None for value in coordinates):
        lat_a, lon_a, lat_b, lon_b = map(math.radians, coordinates)
        distance = 2 * 6371000 * math.asin(min(1, math.sqrt(
            math.sin((lat_b - lat_a) / 2) ** 2
            + math.cos(lat_a) * math.cos(lat_b) * math.sin((lon_b - lon_a) / 2) ** 2
        )))
        return distance <= 500
    # Keep Unicode letters/numbers: removing non-ASCII place names can make
    # unrelated locations both normalize to an empty string.
    normalize = lambda value: " ".join(re.findall(r"[^\W_]+", value.casefold()))
    location_a, location_b = normalize(a.location), normalize(b.location)
    return bool(location_a) and location_a == location_b

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
    same_place = _same_place(a, b)
    same_category = normalized_category(a.category) == normalized_category(b.category)
    # Status words alone cannot connect unrelated places or resource categories.
    if not same_place or not same_category or a.report_type != b.report_type:
        return None
    conflict = contradiction_signal(a.description, b.description)
    semantic = lexical_semantic_similarity(
        f"{a.category} {a.description} {a.location}",
        f"{b.category} {b.description} {b.location}",
    )

    if conflict:
        return "possible_conflict", max(semantic, 0.45), "Contradictory status signals in reports"

    if semantic >= 0.35:
        reason = "Same or nearby location/category with similar report wording (offline lexical comparison)"
        quantity_a, quantity_b = a.required_quantity, b.required_quantity
        if quantity_a != quantity_b:
            reason += f"; quantities differ ({quantity_a:g} versus {quantity_b:g}) and require human reconciliation"
        return "possible_duplicate", semantic, reason

    return None
