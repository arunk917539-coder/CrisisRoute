from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Keep the SQLite database anchored to the backend directory so the app and
# demo-reset scripts always operate on the same database regardless of the
# current working directory.
DATABASE_PATH = Path(__file__).resolve().parents[1] / "crisisroute.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH.as_posix()}"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()



def ensure_schema():
    """Create tables and add the M2.11 report provenance column for existing SQLite demos."""
    from sqlalchemy import inspect, text
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    report_columns = {c["name"] for c in inspector.get_columns("reports")}
    with engine.begin() as conn:
        if "is_synthetic" not in report_columns:
            conn.execute(text("ALTER TABLE reports ADD COLUMN is_synthetic BOOLEAN NOT NULL DEFAULT 1"))
        if "latitude" not in report_columns:
            conn.execute(text("ALTER TABLE reports ADD COLUMN latitude FLOAT"))
        if "longitude" not in report_columns:
            conn.execute(text("ALTER TABLE reports ADD COLUMN longitude FLOAT"))

        need_columns = {c["name"] for c in inspector.get_columns("needs")}
        if "unit" not in need_columns:
            conn.execute(text("ALTER TABLE needs ADD COLUMN unit VARCHAR NOT NULL DEFAULT 'units'"))

        resource_columns = {c["name"] for c in inspector.get_columns("resources")}
        if "latitude" not in resource_columns:
            conn.execute(text("ALTER TABLE resources ADD COLUMN latitude FLOAT"))
        if "longitude" not in resource_columns:
            conn.execute(text("ALTER TABLE resources ADD COLUMN longitude FLOAT"))

        delivery_columns = {c["name"] for c in inspector.get_columns("deliveries")}
        if "allocation_id" not in delivery_columns:
            conn.execute(text("ALTER TABLE deliveries ADD COLUMN allocation_id INTEGER"))
