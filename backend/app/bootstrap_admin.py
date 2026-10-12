"""Run from backend: python -m app.bootstrap_admin --username yourname."""
import argparse
from getpass import getpass
from pydantic import ValidationError
from .auth import UserCreate, create_user
from .db import SessionLocal, ensure_schema
from .models import User


def main():
    parser = argparse.ArgumentParser(description="Create the initial CrisisRoute administrator")
    parser.add_argument("--username", required=True)
    parser.add_argument("--display-name", default="Administrator")
    args = parser.parse_args()
    ensure_schema()
    with SessionLocal() as db:
        if db.query(User).filter_by(role="admin").first():
            parser.error("An administrator already exists; sign in and manage users in the responder portal")
        password = getpass("New administrator password (at least 12 characters): ")
        if password != getpass("Confirm password: "):
            parser.error("Passwords do not match")
        try:
            payload = UserCreate(username=args.username, display_name=args.display_name, password=password, role="admin")
        except ValidationError:
            parser.error("Use a 3-80 character username (letters/digits/._-), a nonblank display name and a password of at least 12 characters")
        user = create_user(db, payload)
        print(f"Created administrator {user['username']}. Sign in through the responder portal.")


if __name__ == "__main__":
    main()
