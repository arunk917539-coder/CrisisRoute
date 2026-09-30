"""Regression coverage for the shared citizen/responder workflow.

conftest.py selects a temporary database before app imports. These tests never
reset or write the repository's demonstration database.
"""
import os
from pathlib import Path
import sqlite3
import subprocess
import sys

from fastapi.testclient import TestClient
import pytest

from app.db import DATABASE_PATH, DATABASE_URL, SessionLocal
from app.main import app
from app.models import Allocation, AuditEvent, Delivery, Need, Relationship, Report, Resource
from app.reconcile import contradiction_signal, suggest_relationship


client = TestClient(app)
BACKEND_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(autouse=True)
def clean_database():
    with SessionLocal() as db:
        for model in (Delivery, Allocation, Need, Resource, AuditEvent, Relationship, Report):
            db.query(model).delete()
        db.commit()


def create_request(**changes):
    payload = {
        "report_type": "relief", "category": "water",
        "description": "Residents in the affected area require drinking water.",
        "location": "Community school", "latitude": 12.9716, "longitude": 77.5946,
        "people_affected": 40, "required_quantity": 100,
        "priority": "high", "evidence_note": "Field observation from the school entrance.",
    }
    payload.update(changes)
    response = client.post("/public/reports", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def report_id(request):
    return int(request["request_id"].split("-")[1])


def accept_request(request, quantity=100, unit="bottles"):
    rid = report_id(request)
    reviewed = client.post(f"/reports/{rid}/evidence/review")
    assert reviewed.status_code == 200
    response = client.post(f"/reports/{rid}/review", json={
        "decision": "accept", "verified_quantity": quantity, "unit": unit,
        "note": "Responder confirmed the requirement at the school.",
    })
    assert response.status_code == 200, response.text
    return response.json()["need_id"]


def create_resource(quantity=100, category="drinking water", unit="bottles"):
    response = client.post("/resources", json={
        "name": "Demo stock", "resource_type": category, "unit": unit,
        "location": "Demo warehouse", "available_quantity": quantity,
        "source": "Synthetic integration test inventory",
    })
    assert response.status_code == 200, response.text
    return response.json()["id"]


def lookup(request):
    response = client.get(f"/public/requests/{request['request_id']}")
    assert response.status_code == 200
    return response.json()


def test_public_water_request_through_verification_and_complete_delivery():
    request = create_request()
    rid = report_id(request)
    assert request["status"] == "under_review"
    assert request["coverage"] is None
    incoming = next(row for row in client.get("/reports").json() if row["id"] == rid)
    assert incoming["priority"] == "high"
    assert incoming["evidence_note"].startswith("Field observation")
    assert incoming["latitude"] == 12.9716
    assert incoming["is_synthetic"] is False
    assert incoming["evidence_reviewed"] is False
    assert client.post(f"/reports/{rid}/review", json={
        "decision": "accept", "verified_quantity": 100, "unit": "bottles",
    }).status_code == 409
    need_id = accept_request(request)
    assert lookup(request)["status"] == "verified"
    assert client.get(f"/reports/{rid}/evidence").json()["human_review_required"] is False
    assert client.get("/map/needs").json()["items"][0]["report_id"] == rid
    with SessionLocal() as db:
        assert db.get(Report, rid).verification_status == "verified"
        assert db.get(Need, need_id).verified_quantity == 100

    resource_id = create_resource()
    allocation = client.post("/allocations", json={
        "need_id": need_id, "resource_id": resource_id, "allocated_quantity": 50,
    })
    assert allocation.status_code == 200
    assert lookup(request)["status"] == "assigned"
    assert client.post("/deliveries", json={
        "need_id": need_id, "allocation_id": allocation.json()["id"], "delivered_quantity": 50,
    }).status_code == 200
    partial = lookup(request)
    assert partial["status"] == "in_progress"
    assert partial["coverage"]["uncovered_quantity"] == 50
    assert partial["coverage"]["outstanding_allocated_quantity"] == 0
    # This second allocation used to fail because the first delivered allocation
    # was subtracted from the need twice.
    assert partial["coverage"]["remaining_to_allocate"] == 50
    mapped_need = client.get("/map/needs").json()["items"][0]
    assert mapped_need["allocated_quantity"] == 50
    assert mapped_need["outstanding_allocated_quantity"] == 0
    assert mapped_need["remaining_to_allocate"] == 50
    second = client.post("/allocations", json={
        "need_id": need_id, "resource_id": resource_id, "allocated_quantity": 50,
    })
    assert second.status_code == 200, second.text
    assert client.post("/deliveries", json={
        "need_id": need_id, "allocation_id": second.json()["id"], "delivered_quantity": 50,
    }).status_code == 200
    completed = lookup(request)
    assert completed["status"] == "resolved"
    assert completed["coverage"]["delivered_quantity"] == 100
    assert completed["coverage"]["uncovered_quantity"] == 0
    assert completed["coverage"]["coverage_percent"] == 100
    assert completed["review_note"].startswith("Responder confirmed")
    assert completed["updated_at"] >= completed["reviewed_at"] >= completed["submitted_at"]
    assert client.get("/map/needs").json()["active_verified_needs_count"] == 0
    assert client.get("/resources").json()[0]["available_quantity"] == 0


@pytest.mark.parametrize("decision,status", [("reject", "rejected"), ("unresolved", "unresolved")])
def test_report_decisions_persist_and_reach_citizen(decision, status):
    request = create_request()
    response = client.post(f"/reports/{report_id(request)}/review", json={
        "decision": decision, "note": "Responder needs a corrected location.",
    })
    assert response.status_code == 200
    assert response.json()["need_id"] is None
    public = lookup(request)
    assert public["status"] == status
    assert public["review_note"] == "Responder needs a corrected location."
    assert public["reviewed_at"].endswith("+00:00")
    assert client.get("/coverage").json()["needs"] == []
    assert any(event["event_type"] == "report_reviewed" for event in client.get("/audit").json())
    # A later explicit human verification may resolve a previously unresolved
    # or rejected report when additional evidence becomes available.
    accept_request(request)
    assert lookup(request)["status"] == "verified"


def test_emergency_can_be_verified_without_creating_quantity_need():
    request = create_request(report_type="emergency", category="rescue", required_quantity=0)
    rid = report_id(request)
    client.post(f"/reports/{rid}/evidence/review")
    response = client.post(f"/reports/{rid}/review", json={"decision": "accept", "note": "Field team confirmed."})
    assert response.status_code == 200
    assert response.json()["need_id"] is None
    assert lookup(request)["status"] == "verified"
    assert lookup(request)["coverage"] is None
    assert client.post("/needs", json={"report_id": rid, "verified_quantity": 1}).status_code == 400


def test_review_quantity_validation_and_verified_need_transition_guards():
    request = create_request()
    rid = report_id(request)
    client.post(f"/reports/{rid}/evidence/review")
    assert client.post(f"/reports/{rid}/review", json={"decision": "accept"}).status_code == 422
    assert client.post(f"/reports/{rid}/review", json={"decision": "accept", "verified_quantity": 101}).status_code == 400
    need_id = accept_request(request)
    again = client.post(f"/reports/{rid}/review", json={"decision": "accept", "verified_quantity": 100, "unit": "bottles"})
    assert again.status_code == 200
    assert again.json()["need_id"] == need_id
    assert len(client.get("/coverage").json()["needs"]) == 1
    for decision in ("reject", "unresolved"):
        assert client.post(f"/reports/{rid}/review", json={"decision": decision}).status_code == 409
    assert client.post(f"/reports/{rid}/review", json={"decision": "accept", "verified_quantity": 90, "unit": "bottles"}).status_code == 409
    assert lookup(request)["status"] == "verified"


def test_allocations_require_matching_resource_category_and_linked_deliveries():
    request = create_request()
    need_id = accept_request(request)
    wrong_resource = create_resource(category="medicine")
    assert client.post("/allocations", json={
        "need_id": need_id, "resource_id": wrong_resource, "allocated_quantity": 50,
    }).status_code == 400
    resource_id = create_resource()
    allocated = client.post("/allocations", json={
        "need_id": need_id, "resource_id": resource_id, "allocated_quantity": 100,
    })
    assert allocated.status_code == 200
    # An unlinked delivery must not silently double-book stock that is reserved.
    assert client.post("/deliveries", json={"need_id": need_id, "delivered_quantity": 50}).status_code == 400
    assert client.post("/deliveries", json={
        "need_id": need_id, "allocation_id": allocated.json()["id"], "delivered_quantity": 60,
    }).status_code == 200
    quantities = lookup(request)["coverage"]
    assert quantities["outstanding_allocated_quantity"] == 40
    assert quantities["remaining_to_allocate"] == 0


def test_fractional_quantities_do_not_lose_stock_or_prevent_completion():
    request = create_request(required_quantity=0.3)
    need_id = accept_request(request, quantity=0.3, unit="liters")
    resource_id = create_resource(quantity=0.3, unit="liters")
    for quantity in (0.1, 0.2):
        allocation = client.post("/allocations", json={
            "need_id": need_id, "resource_id": resource_id, "allocated_quantity": quantity,
        })
        assert allocation.status_code == 200, allocation.text
        assert client.post("/deliveries", json={
            "need_id": need_id, "allocation_id": allocation.json()["id"], "delivered_quantity": quantity,
        }).status_code == 200
    assert lookup(request)["status"] == "resolved"
    assert lookup(request)["coverage"]["delivered_quantity"] == 0.3
    assert client.get("/resources").json()[0]["available_quantity"] == 0


def test_confirmed_duplicate_cannot_create_a_second_need():
    first, second = create_request(), create_request()
    relationship = client.get("/relationships").json()[0]
    assert client.post(f"/relationships/{relationship['id']}/decision", json={"decision": "accept"}).status_code == 200
    accept_request(first)
    rid = report_id(second)
    client.post(f"/reports/{rid}/evidence/review")
    blocked = client.post(f"/reports/{rid}/review", json={"decision": "accept", "verified_quantity": 100, "unit": "bottles"})
    assert blocked.status_code == 409
    assert len(client.get("/coverage").json()["needs"]) == 1
    assert lookup(second)["status"] == "under_review"
    # Human relationship review does not automatically verify citizen reports.
    assert client.post(f"/reports/{rid}/review", json={"decision": "unresolved", "note": f"Follow-up for {first['request_id']}."}).status_code == 200


def test_aggregate_fractional_coverage_preserves_decimal_quantities():
    for quantity in (0.1, 0.2):
        request = create_request(required_quantity=quantity)
        accept_request(request, quantity=quantity, unit="liters")
    coverage = client.get("/coverage").json()
    assert coverage["total_verified"] == 0.3
    assert coverage["total_uncovered"] == 0.3
    assert coverage["totals_by_unit"]["liters"] == {"verified": 0.3, "delivered": 0.0, "uncovered": 0.3}


def test_existing_distinct_needs_cannot_be_confirmed_as_duplicates():
    first, second = create_request(), create_request()
    accept_request(first)
    accept_request(second)
    relationship = client.get("/relationships").json()[0]
    response = client.post(f"/relationships/{relationship['id']}/decision", json={"decision": "accept"})
    assert response.status_code == 409
    assert client.get("/relationships").json()[0]["decision"] == "unresolved"


@pytest.mark.parametrize("field,value", [
    ("latitude", None), ("latitude", 91), ("longitude", -181),
    ("priority", "urgent"), ("description", "     "), ("required_quantity", -1),
])
def test_public_validation_rejects_bad_location_priority_and_text(field, value):
    payload = {"report_type": "relief", "category": "water", "description": "Water required", "location": "School",
               "latitude": 12.9, "longitude": 77.5, "people_affected": 1, "required_quantity": 1}
    payload[field] = value
    response = client.post("/public/reports", json=payload)
    assert response.status_code == 422


@pytest.mark.parametrize("value", ["NaN", "Infinity", "-Infinity"])
def test_nonfinite_numbers_return_validation_errors_not_server_errors(value):
    body = '{"report_type":"relief","category":"water","description":"Water needed","location":"School","people_affected":1,"required_quantity":' + value + '}'
    response = client.post("/public/reports", content=body, headers={"content-type": "application/json"})
    assert response.status_code == 422
    assert response.json()["detail"]


@pytest.mark.parametrize("request_id", ["CR-0", "CR-²", "CR-99999999999999999999999999", "CR-9223372036854775808", "wrong"])
def test_invalid_tracking_ids_do_not_crash(request_id):
    assert client.get(f"/public/requests/{request_id}").status_code == 400


def test_public_batch_returns_only_requested_ids_and_is_citizen_safe():
    first, second = create_request(), create_request()
    response = client.get("/public/requests", params={"request_ids": first["request_id"] + "," + first["request_id"]})
    assert response.status_code == 200
    assert response.json()["count"] == 1
    public = response.json()["items"][0]
    assert public["request_id"] != second["request_id"]
    for internal in ("evidence_source", "evidence_note", "evidence_reviewed", "is_synthetic", "relationships"):
        assert internal not in public


def test_internal_intake_keeps_coordinates_and_normalizes_utc_observation():
    response = client.post("/reports", json={
        "report_type": "emergency", "category": "road", "description": "Road blocked at bridge",
        "location": "Bridge", "latitude": 12.9, "longitude": 77.5,
        "people_affected": 0, "required_quantity": 0, "evidence_source": "Synthetic field observer",
        "evidence_observed_at": "2026-09-29T10:00:00+05:30",
    })
    assert response.status_code == 200
    report = client.get(f"/reports/{response.json()['id']}").json()
    assert (report["latitude"], report["longitude"]) == (12.9, 77.5)
    assert report["timestamp"].endswith("+00:00")
    assert report["evidence_observed_at"] == "2026-09-29T04:30:00+00:00"


def test_conflict_detection_respects_words_and_locations():
    assert not contradiction_signal("Bridge unsafe", "Bridge unsafe")
    assert not contradiction_signal("Road unblocked", "Road passable")
    assert not contradiction_signal("Bridge isn't safe", "Bridge unsafe")
    assert contradiction_signal("Bridge unsafe", "Bridge safe")
    a = Report(report_type="emergency", category="road", description="Road blocked", location="Village A", required_quantity=0)
    b = Report(report_type="emergency", category="road", description="Road passable", location="Village B", required_quantity=0)
    assert suggest_relationship(a, b) is None
    b.location = "Village A"
    assert suggest_relationship(a, b)[0] == "possible_conflict"
    a.latitude, a.longitude, b.latitude, b.longitude = 12.9, 77.5, 20.1, 80.2
    assert suggest_relationship(a, b) is None


def test_non_latin_location_names_do_not_create_unrelated_conflicts():
    a = Report(report_type="emergency", category="road", description="Road blocked", location="ದೆಹಲಿ", required_quantity=0)
    b = Report(report_type="emergency", category="road", description="Road passable", location="ಬೆಂಗಳೂರು", required_quantity=0)
    assert suggest_relationship(a, b) is None
    b.location = a.location
    assert suggest_relationship(a, b)[0] == "possible_conflict"
    a.location, b.location = "---", "..."
    assert suggest_relationship(a, b) is None


def test_environment_database_persists_between_processes_and_configures_lan_cors(tmp_path):
    assert DATABASE_URL != "sqlite:///" + DATABASE_PATH.as_posix()
    database = tmp_path / "shared.db"
    env = os.environ.copy()
    env["CRISISROUTE_DATABASE_URL"] = "sqlite:///" + database.as_posix()
    env["CRISISROUTE_CORS_ORIGINS"] = "http://192.168.1.10:5173, http://192.168.1.20:5174/"
    create_code = '''from fastapi.testclient import TestClient
from app.main import app
c=TestClient(app)
r=c.post('/public/reports',json={'report_type':'relief','category':'water','description':'Water needed','location':'School','people_affected':1,'required_quantity':100})
assert r.status_code==200,r.text
print(r.json()['request_id'])
'''
    created = subprocess.run([sys.executable, "-c", create_code], cwd=BACKEND_ROOT, env=env, capture_output=True, text=True, check=True)
    assert created.stdout.strip() == "CR-1"
    read_code = '''from fastapi.testclient import TestClient
from app.main import app
c=TestClient(app)
assert c.get('/public/requests/CR-1').json()['required_quantity']==100
for origin in ('http://192.168.1.10:5173','http://192.168.1.20:5174'):
 r=c.options('/public/reports',headers={'Origin':origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'})
 assert r.status_code==200,r.text
 assert r.headers['access-control-allow-origin']==origin
assert c.options('/public/reports',headers={'Origin':'http://untrusted.invalid','Access-Control-Request-Method':'POST'}).status_code==400
'''
    subprocess.run([sys.executable, "-c", read_code], cwd=BACKEND_ROOT, env=env, capture_output=True, text=True, check=True)
    with sqlite3.connect(database) as db:
        assert db.execute("select count(*) from reports").fetchone()[0] == 1


def test_synthetic_seed_has_locations_and_demonstrates_freshness():
    from seed import seed_demo_data
    with SessionLocal() as db:
        seed_demo_data(db)
    reports = client.get("/reports").json()
    assert len(reports) == 4
    assert all(row["is_synthetic"] and row["latitude"] is not None for row in reports)
    freshness = {client.get(f"/reports/{row['id']}/evidence").json()["freshness"] for row in reports}
    assert freshness == {"fresh", "aging", "stale"}
    types = {row["relationship_type"] for row in client.get("/reconciliation/queue").json()["items"]}
    assert types == {"possible_duplicate", "possible_conflict"}
    assert "demo_data" not in client.get("/health").json()


def test_existing_database_schema_is_upgraded_without_losing_reports(tmp_path):
    database = tmp_path / "legacy.db"
    with sqlite3.connect(database) as db:
        db.executescript("""
            CREATE TABLE reports (
                id INTEGER PRIMARY KEY, report_type VARCHAR NOT NULL, category VARCHAR NOT NULL,
                description VARCHAR NOT NULL, location VARCHAR NOT NULL, people_affected INTEGER NOT NULL,
                required_quantity FLOAT NOT NULL, timestamp DATETIME NOT NULL, evidence_status VARCHAR NOT NULL,
                evidence_source VARCHAR NOT NULL, evidence_note VARCHAR NOT NULL, evidence_observed_at DATETIME,
                verification_status VARCHAR NOT NULL
            );
            INSERT INTO reports VALUES (1, 'relief', 'water', 'Legacy water request', 'School', 10, 100,
                '2026-09-29 04:30:00', 'none', 'Legacy source', '', NULL, 'unverified');
        """)
    env = os.environ.copy()
    env["CRISISROUTE_DATABASE_URL"] = "sqlite:///" + database.as_posix()
    code = '''from fastapi.testclient import TestClient
from app.main import app
from app.db import ensure_schema
ensure_schema()
row=TestClient(app).get('/reports/1').json()
assert row['description']=='Legacy water request'
assert row['priority']=='medium'
assert row['review_note']==''
assert row['timestamp']=='2026-09-29T04:30:00+00:00'
'''
    subprocess.run([sys.executable, "-c", code], cwd=BACKEND_ROOT, env=env, capture_output=True, text=True, check=True)
