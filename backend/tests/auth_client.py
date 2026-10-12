"""Test client that signs in through the real authentication endpoint."""
from fastapi.testclient import TestClient
from app.auth import UserCreate, create_user, token_hash
from app.db import SessionLocal
from app.models import AuthSession, User


class AuthenticatedClient(TestClient):
    def request(self, method, url, **kwargs):
        if not str(url).startswith(('/public/', '/health', '/auth/')):
            with SessionLocal() as db:
                token = getattr(self, '_test_token', None)
                if not token or not db.query(AuthSession).filter_by(token_hash=token_hash(token)).first():
                    if not db.query(User).filter_by(username='integration-admin').first():
                        create_user(db, UserCreate(username='integration-admin', display_name='Test Administrator',
                                                  password='integration-test-password', role='admin'))
                    result = super().request('POST', '/auth/login', json={'username': 'integration-admin', 'password': 'integration-test-password'})
                    assert result.status_code == 200, result.text
                    self._test_token = result.json()['access_token']
            headers = dict(kwargs.pop('headers', {}) or {})
            headers.setdefault('Authorization', 'Bearer ' + self._test_token)
            kwargs['headers'] = headers
        return super().request(method, url, **kwargs)
