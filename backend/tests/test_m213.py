from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal
from app.models import Report, Need, Resource, Allocation, Delivery

client = TestClient(app)

def reset():
    import subprocess, sys
    backend_root = str(__import__("pathlib").Path(__file__).resolve().parents[1])
    subprocess.run([sys.executable, "seed.py"], check=True, cwd=backend_root)

def setup_module():
    reset()

def setup_function():
    reset()

def _verified_need():
    # report 1 is the seeded relief report
    client.post("/reports/1/evidence/review")
    r = client.post("/needs", json={"report_id":1,"verified_quantity":500,"unit":"bottles"})
    assert r.status_code == 200
    return r.json()["id"]

def test_resources_are_seeded_and_visible():
    r = client.get("/resources")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["is_synthetic"] is True
    assert data[0]["available_quantity"] == 400
    assert data[0]["unit"] == "bottles"

def test_allocation_requires_verified_need_and_active_resource():
    r = client.post("/allocations", json={"need_id":999,"resource_id":1,"allocated_quantity":10})
    assert r.status_code == 404
    need_id = _verified_need()
    
    # create inactive resource for test
    inactive_res = client.post("/resources", json={"name":"Inactive","resource_type":"drinking water","unit":"bottles","location":"Location X","available_quantity":10,"source":"test","status":"inactive"}).json()["id"]
    r = client.post("/allocations", json={"need_id":need_id,"resource_id":inactive_res,"allocated_quantity":10})
    assert r.status_code == 409

def test_allocation_validates_unit_availability_and_need_gap():
    need_id = _verified_need()
    
    res_id = client.post("/resources", json={"name":"Huge","resource_type":"drinking water","unit":"bottles","location":"Location X","available_quantity":1000,"source":"test","status":"active"}).json()["id"]
    
    r = client.post("/allocations", json={"need_id":need_id,"resource_id":res_id,"allocated_quantity":200})
    assert r.status_code == 200
    assert r.json()["resource_remaining"] == 800

    r = client.post("/allocations", json={"need_id":need_id,"resource_id":res_id,"allocated_quantity":301})
    assert r.status_code == 400  # exceeds remaining need gap of 300

    r = client.post("/allocations", json={"need_id":need_id,"resource_id":res_id,"allocated_quantity":201})
    assert r.status_code == 200
    r = client.post("/allocations", json={"need_id":need_id,"resource_id":res_id,"allocated_quantity":100})
    assert r.status_code == 400  # only 99 remains after the successful 201 allocation

def test_allocation_does_not_count_as_delivery():
    need_id = _verified_need()
    r = client.post("/allocations", json={"need_id":need_id,"resource_id":1,"allocated_quantity":100})
    assert r.status_code == 200
    cov = client.get("/coverage").json()
    row = next(x for x in cov["needs"] if x["need_id"] == need_id)
    assert row["delivered_quantity"] == 0
    assert row["uncovered_quantity"] == 500

def test_delivery_can_be_linked_to_allocation_but_not_exceed_it():
    need_id = _verified_need()
    alloc = client.post("/allocations", json={"need_id":need_id,"resource_id":1,"allocated_quantity":100}).json()
    r = client.post("/deliveries", json={"need_id":need_id,"allocation_id":alloc["id"],"delivered_quantity":60})
    assert r.status_code == 200
    r = client.post("/deliveries", json={"need_id":need_id,"allocation_id":alloc["id"],"delivered_quantity":41})
    assert r.status_code == 400
    a = client.get("/allocations").json()
    row = next(x for x in a if x["id"] == alloc["id"])
    assert row["delivered_quantity"] == 60
    assert row["remaining_quantity"] == 40

def test_mismatched_unit_is_rejected():
    need_id = _verified_need()
    db=SessionLocal()
    try:
        n=db.get(Need, need_id); n.unit="liters"
        db.commit()
    finally: db.close()
    r = client.post("/allocations", json={"need_id":need_id,"resource_id":1,"allocated_quantity":10})
    assert r.status_code == 400


def test_resource_availability_is_enforced_independently():
    need_id = _verified_need()
    res_id = client.post("/resources", json={"name":"Small","resource_type":"drinking water","unit":"bottles","location":"Location X","available_quantity":300,"source":"test","status":"active"}).json()["id"]
    r = client.post("/allocations", json={"need_id":need_id,"resource_id":res_id,"allocated_quantity":300})
    assert r.status_code == 200
    r = client.post("/allocations", json={"need_id":need_id,"resource_id":res_id,"allocated_quantity":1})
    assert r.status_code == 400

def test_coverage_exposes_allocation_gap_without_counting_allocation_as_delivery():
    need_id = _verified_need()
    client.post("/allocations", json={"need_id":need_id,"resource_id":1,"allocated_quantity":200})
    row = next(x for x in client.get("/coverage").json()["needs"] if x["need_id"] == need_id)
    assert row["allocated_quantity"] == 200
    assert row["remaining_to_allocate"] == 300
    assert row["delivered_quantity"] == 0


def test_resource_creation_is_synthetic_and_audited():
    r = client.post("/resources", json={"name":"Emergency Water","resource_type":"water","unit":"liters","location":"Warehouse West","available_quantity":1000,"source":"synthetic test","status":"active"})
    assert r.status_code == 200
    data = r.json()
    assert data["is_synthetic"] is True
    audit = client.get("/audit").json()
    assert any(x["event_type"] == "resource_created" and x["entity_id"] == data["id"] for x in audit)

def test_resource_and_allocation_validation_rejects_invalid_payloads():
    r = client.post("/resources", json={"name":"X","resource_type":"drinking water","unit":"bottles","location":"A","available_quantity":1,"source":"x","unexpected":1})
    assert r.status_code == 422
    need_id = _verified_need()
    r = client.post("/allocations", json={"need_id":need_id,"resource_id":1,"allocated_quantity":0})
    assert r.status_code == 422
    r = client.post("/allocations", json={"need_id":need_id,"resource_id":1,"allocated_quantity":-1})
    assert r.status_code == 422
