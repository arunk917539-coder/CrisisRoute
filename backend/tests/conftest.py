import sys
import os
import tempfile
from pathlib import Path

import pytest

# Set this before test modules import app.db. Child seed/reset processes inherit
# the same isolated database instead of touching the user's demo database.
_test_database = tempfile.TemporaryDirectory(prefix="crisisroute-tests-")
os.environ["CRISISROUTE_DATABASE_URL"] = (
    "sqlite:///" + (Path(_test_database.name) / "test.db").as_posix()
)

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture(scope="session", autouse=True)
def isolated_database():
    yield
    from app.db import engine
    engine.dispose()
    _test_database.cleanup()
