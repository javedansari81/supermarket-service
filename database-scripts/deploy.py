"""
Database deployment runner.

Applies SQL scripts from database-scripts/ in order and records each one in
<DB_SCHEMA>.schema_migrations so the same script is never deployed twice.

Order: schema -> indexes -> seeds -> migrations, files sorted by name within
each folder. Each script runs in its own transaction, so scripts must not
contain BEGIN/COMMIT. Applied scripts are immutable: if one is edited, the
run fails; add a new numbered script instead.

Usage:
    python database-scripts/deploy.py status
    python database-scripts/deploy.py migrate [--dry-run]
    python database-scripts/deploy.py baseline

Connection settings come from DATABASE_URL and DB_SCHEMA (default: mart).
If DATABASE_URL is not in the environment, supermarket-api/.env is loaded.
"""
import argparse
import getpass
import hashlib
import os
import sys
import time
from pathlib import Path

import psycopg2
from psycopg2 import sql

SCRIPTS_DIR = Path(__file__).resolve().parent
FOLDER_ORDER = ["schema", "indexes", "seeds", "migrations"]
DEFAULT_ENV_FILE = SCRIPTS_DIR.parent / "supermarket-api" / ".env"
LOCK_KEY = 872301455


def load_config():
    if "DATABASE_URL" not in os.environ and DEFAULT_ENV_FILE.exists():
        from dotenv import load_dotenv
        load_dotenv(DEFAULT_ENV_FILE)
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("ERROR: DATABASE_URL is not set.")
    return url, os.environ.get("DB_SCHEMA", "mart")


def discover_scripts():
    """Return [(name, path, checksum)] in deployment order."""
    scripts = []
    for folder in FOLDER_ORDER:
        for path in sorted((SCRIPTS_DIR / folder).glob("*.sql")):
            content = path.read_bytes().replace(b"\r\n", b"\n")
            scripts.append((f"{folder}/{path.name}", path, hashlib.sha256(content).hexdigest()))
    return scripts


def prepare(conn, schema):
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_namespace WHERE nspname = %s", (schema,))
        if not cur.fetchone():
            sys.exit(f'ERROR: Schema "{schema}" does not exist. Create it before deploying.')
        cur.execute("SELECT pg_try_advisory_lock(%s)", (LOCK_KEY,))
        if not cur.fetchone()[0]:
            sys.exit("ERROR: Another deployment is in progress.")
        cur.execute(sql.SQL("""
            CREATE TABLE IF NOT EXISTS {}.schema_migrations (
                id SERIAL PRIMARY KEY,
                script_name VARCHAR(255) NOT NULL UNIQUE,
                checksum CHAR(64) NOT NULL,
                applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                applied_by VARCHAR(100) NOT NULL,
                execution_ms INTEGER NOT NULL DEFAULT 0,
                is_baseline BOOLEAN NOT NULL DEFAULT FALSE
            )
        """).format(sql.Identifier(schema)))
        cur.execute(sql.SQL("SELECT script_name, checksum FROM {}.schema_migrations")
                    .format(sql.Identifier(schema)))
        applied = dict(cur.fetchall())
    conn.commit()
    return applied


def classify(scripts, applied):
    pending, changed = [], []
    for name, path, checksum in scripts:
        if name not in applied:
            pending.append((name, path, checksum))
        elif applied[name] != checksum:
            changed.append(name)
    return pending, changed


def record(cur, schema, name, checksum, elapsed_ms, is_baseline):
    cur.execute(
        sql.SQL("INSERT INTO {}.schema_migrations "
                "(script_name, checksum, applied_by, execution_ms, is_baseline) "
                "VALUES (%s, %s, %s, %s, %s)").format(sql.Identifier(schema)),
        (name, checksum, os.environ.get("GITHUB_ACTOR") or getpass.getuser(), elapsed_ms, is_baseline),
    )


def main():
    parser = argparse.ArgumentParser(description="Deploy versioned SQL scripts.")
    parser.add_argument("command", choices=["status", "migrate", "baseline"])
    parser.add_argument("--dry-run", action="store_true", help="List pending scripts without running them")
    args = parser.parse_args()

    url, schema = load_config()
    scripts = discover_scripts()
    conn = psycopg2.connect(url)
    conn.set_client_encoding("UTF8")
    try:
        applied = prepare(conn, schema)
        pending, changed = classify(scripts, applied)
        missing = sorted(set(applied) - {name for name, _, _ in scripts})

        if args.command == "status":
            for name, _, checksum in scripts:
                state = "PENDING" if name not in applied else ("CHANGED" if applied[name] != checksum else "applied")
                print(f"  [{state:>7}] {name}")
            for name in missing:
                print(f"  [MISSING] {name} (recorded in database, file not found)")
            print(f"{len(scripts) - len(pending)} applied, {len(pending)} pending, {len(changed)} changed.")
            return 1 if changed else 0

        if changed:
            print("ERROR: Already-applied scripts were modified. Add a new script instead:")
            for name in changed:
                print(f"  - {name}")
            return 1
        if not pending:
            print("Database is up to date. No pending scripts.")
            return 0
        if args.dry_run:
            print("Pending scripts (dry run, nothing executed):")
            for name, _, _ in pending:
                print(f"  - {name}")
            return 0

        with conn.cursor() as cur:
            for name, path, checksum in pending:
                if args.command == "baseline":
                    record(cur, schema, name, checksum, 0, True)
                    conn.commit()
                    print(f"  baselined {name}")
                    continue
                print(f"  applying  {name} ...", end=" ", flush=True)
                start = time.monotonic()
                try:
                    cur.execute(path.read_text(encoding="utf-8"))
                    elapsed_ms = int((time.monotonic() - start) * 1000)
                    record(cur, schema, name, checksum, elapsed_ms, False)
                    conn.commit()
                except psycopg2.Error as exc:
                    conn.rollback()
                    print("FAILED")
                    print(f"ERROR in {name}: {exc}")
                    return 1
                print(f"done ({elapsed_ms} ms)")
        print(f"{len(pending)} script(s) {'baselined' if args.command == 'baseline' else 'applied'}.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
