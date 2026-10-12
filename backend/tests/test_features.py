"""Security and workflow regression tests for the feature expansion."""
import base64
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image
import pytest

from app.auth import UserCreate, create_user, token_hash
from app.db import SessionLocal
from app.main import app
from app.models import AuthSession, AuditEvent, FollowupQuestion, Photo, Report, User
from seed import reset_demo_data

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset():
    with SessionLocal() as db:
        reset_demo_data(db)
        # Keep other modules' authenticated fixture accounts intact.
        ids = [user.id for user in db.query(User).filter(User.username.in_(['feature-admin', 'feature-responder', 'feature-viewer'])).all()]
        db.query(AuthSession).filter(AuthSession.user_id.in_(ids)).delete()
        db.query(User).filter(User.id.in_(ids)).delete()
        db.commit()
        for role in ('admin', 'responder', 'viewer'):
            create_user(db, UserCreate(username='feature-' + role, display_name='Private ' + role,
                                      password='feature-test-password', role=role))
    yield
    with SessionLocal() as db:
        reset_demo_data(db)


def login(role='admin'):
    response = client.post('/auth/login', json={'username': 'feature-' + role, 'password': 'feature-test-password'})
    assert response.status_code == 200, response.text
    return {'Authorization': 'Bearer ' + response.json()['access_token']}


def request(**overrides):
    payload = {'report_type': 'relief', 'category': 'water', 'description': 'Clean water needed at the school',
               'location': 'School', 'people_affected': 20, 'required_quantity': 100,
               'latitude': 12.9716, 'longitude': 77.5946}
    payload.update(overrides)
    result = client.post('/public/reports', json=payload)
    assert result.status_code == 200, result.text
    row = result.json()
    return row, int(row['request_id'][3:]), {'X-Tracking-Token': row['tracking_token']}


def review_evidence(report_id, headers):
    snapshot = client.get(f'/reports/{report_id}/evidence', headers=headers).json()
    return client.post(f'/reports/{report_id}/evidence/review', headers=headers,
                       json={'evidence_version': snapshot['evidence_version']})


def verify(report_id, headers):
    assert review_evidence(report_id, headers).status_code == 200
    result = client.post(f'/reports/{report_id}/review', headers=headers,
                         json={'decision': 'accept', 'verified_quantity': 100, 'unit': 'bottles'})
    assert result.status_code == 200, result.text
    return result.json()['need_id']


def image_payload():
    image = Image.new('RGB', (16, 16), (200, 20, 20))
    buffer = BytesIO()
    exif = Image.Exif()
    exif[0x010E] = 'private metadata'
    image.save(buffer, format='JPEG', exif=exif)
    return {'filename': '../../evidence.jpg', 'data_base64': base64.b64encode(buffer.getvalue()).decode()}


def test_auth_protects_all_operational_routes_and_role_boundaries():
    for path in ('/reports', '/relationships', '/dashboard', '/coverage', '/resources', '/audit', '/incidents', '/stale-reviews', '/ai/status'):
        assert client.get(path).status_code == 401, path
    viewer = login('viewer')
    assert client.get('/reports', headers=viewer).status_code == 200
    assert client.get('/incidents', headers=viewer).status_code == 200
    assert client.post('/reports/1/evidence/review', headers=viewer).status_code == 403
    assert client.get('/users', headers=viewer).status_code == 403
    assert client.get('/users', headers=login('responder')).status_code == 403
    assert client.get('/health').status_code == 200
    assert client.get('/auth/status').json()['auth_required'] is True


def test_session_is_hashed_expires_and_logs_out():
    headers = login()
    token = headers['Authorization'][7:]
    with SessionLocal() as db:
        session = db.query(AuthSession).filter_by(token_hash=token_hash(token)).one()
        assert session.token_hash != token
        user = db.get(User, session.user_id)
        assert user.password_hash.startswith('scrypt$')
        assert 'feature-test-password' not in user.password_hash
    assert client.get('/auth/me', headers=headers).json()['role'] == 'admin'
    assert client.post('/auth/logout', headers=headers).json()['logged_out'] is True
    assert client.get('/auth/me', headers=headers).status_code == 401
    headers = login()
    with SessionLocal() as db:
        session = db.query(AuthSession).filter_by(token_hash=token_hash(headers['Authorization'][7:])).one()
        session.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    assert client.get('/reports', headers=headers).status_code == 401


def test_admin_user_creation_validation_and_duplicate_guard():
    headers = login()
    payload = {'username': 'new-operator', 'display_name': 'New Operator', 'password': 'new-secure-password', 'role': 'responder'}
    with SessionLocal() as db:
        db.query(User).filter_by(username='new-operator').delete()
        db.commit()
    created = client.post('/users', headers=headers, json=payload)
    assert created.status_code == 200
    assert set(created.json()) == {'id', 'username', 'display_name', 'role'}
    assert client.post('/users', headers=headers, json=payload).status_code == 409
    assert client.post('/users', headers=headers, json={**payload, 'username': 'another', 'password': 'short'}).status_code == 422
    assert client.post('/users', headers=headers, json={**payload, 'username': 'another', 'role': 'root'}).status_code == 422


def test_tracking_key_required_hashed_and_not_returned_on_reads():
    row, rid, key = request()
    assert client.get('/public/requests/' + row['request_id']).status_code == 403
    assert client.get('/public/requests/' + row['request_id'], headers={'X-Tracking-Token': 'wrong'}).status_code == 403
    result = client.get('/public/requests/' + row['request_id'], headers=key)
    assert result.status_code == 200
    assert result.json()['can_manage'] is True
    assert 'tracking_token' not in result.json()
    assert result.headers['cache-control'] == 'no-store'
    with SessionLocal() as db:
        assert db.get(Report, rid).tracking_token_hash == token_hash(row['tracking_token'])
    assert client.get('/public/requests', params={'request_ids': row['request_id']}).status_code == 403


def test_legacy_public_read_does_not_grant_private_extensions():
    with SessionLocal() as db:
        report = Report(report_type='relief', category='water', description='Legacy', location='School', required_quantity=10)
        db.add(report)
        db.commit()
        rid = report.id
    assert client.get(f'/public/requests/CR-{rid}').json()['can_manage'] is False
    for suffix in ('/questions', '/timeline', '/photos'):
        assert client.get(f'/public/requests/CR-{rid}' + suffix).status_code == 403
    assert client.post(f'/reports/{rid}/questions', headers=login(), json={'question': 'More information?'}).status_code == 409


def test_followup_reply_requires_key_and_invalidates_review_without_changing_need():
    row, rid, key = request()
    headers = login('responder')
    nid = verify(rid, headers)
    asked = client.post(f'/reports/{rid}/questions', headers=headers, json={'question': 'Is the water still required?'})
    assert asked.status_code == 200
    question = asked.json()
    assert question['asked_by'] == 'Private responder'
    public = client.get(f'/public/requests/{row["request_id"]}/questions', headers=key).json()[0]
    assert public['asked_by'] == 'Responder'
    reply_path = f'/public/requests/{row["request_id"]}/replies'
    reply = {'question_id': question['id'], 'answer': 'Yes, all 100 bottles are still needed.'}
    assert client.post(reply_path, json=reply).status_code == 403
    assert client.post(reply_path, headers=key, json=reply).status_code == 200
    assert client.post(reply_path, headers=key, json=reply).status_code == 409
    evidence = client.get(f'/reports/{rid}/evidence', headers=headers).json()
    assert evidence['reviewed'] is False
    need = next(item for item in client.get('/coverage', headers=headers).json()['needs'] if item['need_id'] == nid)
    assert need['verified_quantity'] == 100
    assert review_evidence(rid, headers).json()['already_recorded'] is False
    assert client.get(f'/reports/{rid}/evidence', headers=headers).json()['reviewed'] is True


def test_citizen_cannot_answer_another_requests_question():
    row, rid, key = request()
    other, other_id, other_key = request(description='Other household needs water')
    question = client.post(f'/reports/{rid}/questions', headers=login(), json={'question': 'Clarify your location?'}).json()
    assert client.post(f'/public/requests/{other["request_id"]}/replies', headers=other_key,
                       json={'question_id': question['id'], 'answer': 'School'}).status_code == 404


def test_photos_are_sanitized_private_capped_and_invalidate_review():
    row, rid, key = request()
    headers = login()
    verify(rid, headers)
    path = f'/public/requests/{row["request_id"]}/photos'
    assert client.post(path, json=image_payload()).status_code == 403
    uploaded = client.post(path, headers=key, json=image_payload())
    assert uploaded.status_code == 200, uploaded.text
    photo = uploaded.json()
    assert photo['filename'] == 'evidence.jpg'
    content_path = f'/photos/{photo["id"]}/content'
    assert client.get(content_path).status_code == 403
    content = client.get(content_path, headers=key)
    assert content.status_code == 200
    with Image.open(BytesIO(content.content)) as sanitized:
        assert sanitized.format == 'JPEG'
        assert not sanitized.getexif()
    assert client.get(content_path, headers=login('viewer')).status_code == 200
    _, _, wrong_key = request(description='Another request')
    assert client.get(content_path, headers=wrong_key).status_code == 403
    assert client.get(f'/reports/{rid}/evidence', headers=headers).json()['reviewed'] is False
    assert client.post(path, headers=key, json=image_payload()).status_code == 200
    assert client.post(path, headers=key, json=image_payload()).status_code == 200
    assert client.post(path, headers=key, json=image_payload()).status_code == 409
    assert len(client.get(path, headers=key).json()) == 3


def test_invalid_photos_and_cross_request_content_rejected():
    row, rid, key = request()
    path = f'/public/requests/{row["request_id"]}/photos'
    assert client.post(path, headers=key, json={'filename': 'x.png', 'data_base64': '!!!!'}).status_code == 422
    assert client.post(path, headers=key, json={'filename': 'x.png', 'data_base64': base64.b64encode(b'not an image').decode()}).status_code == 422
    buffer = BytesIO()
    Image.new('RGB', (1, 1)).save(buffer, format='GIF')
    assert client.post(path, headers=key, json={'filename': 'x.gif', 'data_base64': base64.b64encode(buffer.getvalue()).decode()}).status_code == 422
    photo = client.post(path, headers=key, json=image_payload()).json()
    other, _, other_key = request(description='Another request')
    assert client.get(f'/public/requests/{other["request_id"]}/photos/{photo["id"]}/content', headers=other_key).status_code == 404


def test_incidents_only_merge_human_accepted_duplicate_relationships():
    first, rid, key = request()
    second, rid2, _ = request(description='Clean water needed at the school today')
    headers = login()
    assert len(client.get('/incidents', headers=headers).json()) == 2
    link = next(link for link in client.get('/relationships', headers=headers).json() if {link['report_a_id'], link['report_b_id']} == {rid, rid2})
    assert client.post(f'/relationships/{link["id"]}/decision', headers=headers, json={'decision': 'accept'}).status_code == 200
    incidents = client.get('/incidents', headers=headers).json()
    assert len(incidents) == 1
    assert incidents[0]['report_ids'] == [rid, rid2]
    assert incidents[0]['report_count'] == 2
    verify(rid, headers)
    detail = client.get(f'/incidents/{rid}', headers=headers).json()
    assert len(detail['needs']) == 1
    assert len(detail['reports']) == 2
    assert any(event['event_type'] == 'relationship_decision' for event in detail['timeline'])
    review_evidence(rid2, headers)
    assert client.post(f'/reports/{rid2}/review', headers=headers, json={'decision': 'accept', 'verified_quantity': 100, 'unit': 'bottles'}).status_code == 409


def test_public_timeline_has_delivery_quantities_but_no_private_actor_or_relationships():
    row, rid, key = request()
    headers = login()
    nid = verify(rid, headers)
    assert client.post('/deliveries', headers=headers, json={'need_id': nid, 'delivered_quantity': 25}).status_code == 200
    internal = client.get(f'/reports/{rid}/timeline', headers=headers).json()
    assert any(item['actor_name'] == 'Private admin' for item in internal)
    public = client.get(f'/public/requests/{row["request_id"]}/timeline', headers=key).json()
    assert all(item['actor_name'] is None for item in public)
    assert any(item['summary'] == 'Delivery recorded: 25 bottles' for item in public)
    assert not any(item['event_type'] == 'relationship_decision' for item in public)


def test_stale_reconfirmation_preserves_observation_timestamp_and_quantities():
    row, rid, key = request()
    headers = login()
    verify(rid, headers)
    observed = datetime.now(timezone.utc) - timedelta(days=3)
    with SessionLocal() as db:
        report = db.get(Report, rid)
        report.last_confirmed_at = datetime.now(timezone.utc) - timedelta(hours=25)
        report.evidence_observed_at = observed
        db.commit()
    stale = client.get('/stale-reviews', headers=headers).json()
    assert [item['report_id'] for item in stale] == [rid]
    assert client.post(f'/reports/{rid}/reconfirm', headers=headers, json={'note': '  '}).status_code == 422
    assert client.post(f'/reports/{rid}/reconfirm', headers=headers, json={'note': 'Telephone confirmation with field responder'}).status_code == 200
    assert client.get('/stale-reviews', headers=headers).json() == []
    with SessionLocal() as db:
        assert db.get(Report, rid).evidence_observed_at.replace(tzinfo=timezone.utc) == observed
    assert client.get(f'/public/requests/{row["request_id"]}', headers=key).json()['coverage']['verified_quantity'] == 100


def test_ai_suggestions_are_advisory_and_never_override_human_decisions(monkeypatch):
    first, rid, _ = request()
    second, other_id, _ = request(description='Families lack potable supplies')
    headers = login()
    with SessionLocal() as db:
        from app.models import Relationship
        db.query(Relationship).delete()
        db.commit()
    suggestions = [{'report_id': other_id, 'similarity': .91, 'reason': 'Semantic model suggestion', 'method': 'ollama_embedding', 'relationship_type': 'possible_duplicate'}]
    monkeypatch.setattr('app.semantic.compare_reports', lambda report, others: suggestions)
    response = client.post(f'/reports/{rid}/ai-compare', headers=headers)
    assert response.status_code == 200
    assert response.json()['advisory_only'] is True
    link = client.get('/relationships', headers=headers).json()[0]
    assert link['decision'] == 'unresolved'
    assert client.get(f'/reports/{rid}', headers=headers).json()['verification_status'] == 'unverified'
    client.post(f'/relationships/{link["id"]}/decision', headers=headers, json={'decision': 'reject'})
    client.post(f'/reports/{rid}/ai-compare', headers=headers)
    assert client.get('/relationships', headers=headers).json()[0]['decision'] == 'reject'


def test_auth_error_responses_preserve_configured_cors_headers():
    origin = 'http://localhost:5174'
    denied = client.get('/reports', headers={'Origin': origin})
    assert denied.status_code == 401
    assert denied.headers['access-control-allow-origin'] == origin
    forbidden = client.post('/reports/1/evidence/review', headers={**login('viewer'), 'Origin': origin})
    assert forbidden.status_code == 403
    assert forbidden.headers['access-control-allow-origin'] == origin


def test_parallel_login_failures_are_rate_limited(monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    import app.auth as auth
    monkeypatch.setattr(auth, '_failures', {})
    def attempt(_):
        return client.post('/auth/login', json={'username': 'feature-admin', 'password': 'incorrect-password'}).status_code
    with ThreadPoolExecutor(max_workers=6) as pool:
        statuses = list(pool.map(attempt, range(6)))
    assert statuses.count(401) == 5
    assert statuses.count(429) == 1
    blocked = client.post('/auth/login', json={'username': 'feature-admin', 'password': 'feature-test-password'})
    assert blocked.status_code == 429
    assert blocked.headers['retry-after'] == '300'


def test_seed_reset_removes_private_evidence_and_questions_but_preserves_accounts():
    from app.features import photo_directory
    row, rid, key = request()
    headers = login()
    photo = client.post(f'/public/requests/{row["request_id"]}/photos', headers=key, json=image_payload()).json()
    client.post(f'/reports/{rid}/questions', headers=headers, json={'question': 'Confirm your current location?'})
    with SessionLocal() as db:
        storage_path = photo_directory() / db.get(Photo, photo['id']).storage_name
        assert storage_path.is_file()
        reset_demo_data(db)
        assert db.query(Photo).count() == 0
        assert db.query(FollowupQuestion).count() == 0
        assert db.query(Report).count() == 0
        assert db.query(User).filter_by(username='feature-admin').first() is not None
    assert not storage_path.exists()
    assert client.get('/auth/me', headers=headers).status_code == 200


def test_png_upload_drops_text_metadata_and_oversized_payload_rejected():
    from PIL.PngImagePlugin import PngInfo
    row, _, key = request()
    path = f'/public/requests/{row["request_id"]}/photos'
    metadata = PngInfo()
    metadata.add_text('private', 'location metadata')
    buffer = BytesIO()
    Image.new('RGB', (2, 2)).save(buffer, format='PNG', pnginfo=metadata)
    photo = client.post(path, headers=key, json={'filename': 'photo.png', 'data_base64': base64.b64encode(buffer.getvalue()).decode()}).json()
    response = client.get(f'/photos/{photo["id"]}/content', headers=key)
    assert response.headers['content-type'] == 'image/jpeg'
    assert b'location metadata' not in response.content
    too_large = base64.b64encode(b'x' * (3 * 1024 * 1024 + 1)).decode()
    assert client.post(path, headers=key, json={'filename': 'large.png', 'data_base64': too_large}).status_code == 422


def test_new_evidence_blocks_reconfirmation_until_reviewed():
    row, rid, key = request()
    headers = login()
    assert client.post(f'/reports/{rid}/reconfirm', headers=headers, json={'note': 'Checked in person'}).status_code == 409
    verify(rid, headers)
    client.post(f'/public/requests/{row["request_id"]}/photos', headers=key, json=image_payload())
    assert client.post(f'/reports/{rid}/reconfirm', headers=headers, json={'note': 'Checked in person'}).status_code == 409
    review_evidence(rid, headers)
    assert client.post(f'/reports/{rid}/reconfirm', headers=headers, json={'note': 'Checked in person'}).status_code == 200


def test_stale_evidence_snapshot_cannot_acknowledge_new_photos_or_replies():
    row, rid, key = request()
    headers = login()
    endpoint = f'/reports/{rid}/evidence'
    original = client.get(endpoint, headers=headers).json()['evidence_version']
    assert original is None
    assert client.post(f'/public/requests/{row["request_id"]}/photos', headers=key,
                       json=image_payload()).status_code == 200
    # Neither an older client nor a review of the original display may acknowledge
    # the photo that arrived after that display was fetched.
    assert client.post(endpoint + '/review', headers=headers).status_code == 409
    assert client.post(endpoint + '/review', headers=headers,
                       json={'evidence_version': original}).status_code == 409
    assert client.get(endpoint, headers=headers).json()['reviewed'] is False
    photo_version = client.get(endpoint, headers=headers).json()['evidence_version']
    assert photo_version is not None
    assert review_evidence(rid, headers).status_code == 200
    question = client.post(f'/reports/{rid}/questions', headers=headers,
                           json={'question': 'When was this photo taken?'}).json()
    assert client.post(f'/public/requests/{row["request_id"]}/replies', headers=key,
                       json={'question_id': question['id'], 'answer': 'Ten minutes ago.'}).status_code == 200
    assert client.post(endpoint + '/review', headers=headers,
                       json={'evidence_version': photo_version}).status_code == 409
    assert client.get(endpoint, headers=headers).json()['reviewed'] is False
    assert review_evidence(rid, headers).status_code == 200
    assert client.get(endpoint, headers=headers).json()['reviewed'] is True
