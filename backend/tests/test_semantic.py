from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException

from app import semantic


def report(number, description="Families need clean water", **updates):
    data = dict(id=number, description=description, category="water", report_type="relief",
                location="Community school", latitude=12.97, longitude=77.59, required_quantity=100)
    return SimpleNamespace(**(data | updates))


def response(payload, code=200):
    return httpx.Response(code, json=payload, request=httpx.Request("POST", "http://localhost/api/embed"))


@pytest.fixture(autouse=True)
def configuration(monkeypatch):
    monkeypatch.setenv("CRISISROUTE_AI_PROVIDER", "ollama")
    monkeypatch.setenv("CRISISROUTE_OLLAMA_URL", "http://127.0.0.1:11434")
    monkeypatch.setenv("CRISISROUTE_OLLAMA_MODEL", "embeddinggemma")


def test_semantic_similarity_can_match_different_wording_and_languages(monkeypatch):
    calls = []
    def embed(url, **kwargs):
        calls.append(kwargs)
        return response({"embeddings": [[1, 0], [.95, .05]]})
    monkeypatch.setattr(semantic.httpx, "post", embed)
    original = report(1)
    other = report(2, "ಕುಡಿಯುವ ನೀರು ಬೇಕು", required_quantity=50)
    matches = semantic.compare_reports(original, [original, other])
    assert matches[0]["report_id"] == 2
    assert matches[0]["method"] == "ollama_embedding"
    assert "Quantities differ" in matches[0]["reason"]
    assert calls[0]["json"]["input"][1].endswith(other.description)
    assert original.required_quantity == 100 and other.required_quantity == 50


def test_scope_excludes_distant_and_unrelated_reports_without_calling_model(monkeypatch):
    monkeypatch.setattr(semantic.httpx, "post", lambda *a, **kw: pytest.fail("should not call model"))
    assert semantic.compare_reports(report(1), [report(2, latitude=20), report(3, category="food"), report(4, report_type="emergency")]) == []


@pytest.mark.parametrize("vectors", [None, [], [[1, 0]], [[0, 0], [1, 0]], [[1], [1, 2]], [[float("nan")], [1]], [[True], [1]]])
def test_malformed_model_output_fails_without_operational_changes(monkeypatch, vectors):
    class Result:
        def raise_for_status(self):
            pass
        def json(self):
            return {"embeddings": vectors}
    monkeypatch.setattr(semantic.httpx, "post", lambda *a, **kw: Result())
    with pytest.raises(HTTPException) as error:
        semantic.compare_reports(report(1), [report(2)])
    assert error.value.status_code == 503


def test_model_outage_is_explicit(monkeypatch):
    def offline(*args, **kwargs):
        raise httpx.ConnectError("connection refused")
    monkeypatch.setattr(semantic.httpx, "get", offline)
    assert semantic.semantic_status()["available"] is False
    monkeypatch.setattr(semantic.httpx, "post", offline)
    with pytest.raises(HTTPException, match="503"):
        semantic.compare_reports(report(1), [report(2)])


def test_low_similarity_is_not_suggested(monkeypatch):
    monkeypatch.setattr(semantic.httpx, "post", lambda *a, **kw: response({"embeddings": [[1, 0], [0, 1]]}))
    assert semantic.compare_reports(report(1), [report(2)]) == []


def test_local_model_presence_is_reported(monkeypatch):
    monkeypatch.setattr(semantic.httpx, "get", lambda *a, **kw: response({"models": [{"name": "embeddinggemma:latest"}]}))
    assert semantic.semantic_status()["available"] is True
    monkeypatch.setenv("CRISISROUTE_AI_PROVIDER", "off")
    assert semantic.semantic_status()["enabled"] is False


def test_remote_or_cloud_configuration_is_rejected(monkeypatch):
    monkeypatch.setenv("CRISISROUTE_OLLAMA_URL", "https://external.example")
    assert semantic.semantic_status()["available"] is False
    with pytest.raises(HTTPException):
        semantic.compare_reports(report(1), [report(2)])


def test_conflict_and_candidate_limit(monkeypatch):
    def embed(*args, **kwargs):
        assert len(kwargs["json"]["input"]) == 51
        return response({"embeddings": [[1, 0]] * 51})
    monkeypatch.setattr(semantic.httpx, "post", embed)
    matches = semantic.compare_reports(report(1, "Road is blocked"), [report(i, "Road is passable") for i in range(2, 62)])
    assert len(matches) == 50 and all(item["relationship_type"] == "possible_conflict" for item in matches)
