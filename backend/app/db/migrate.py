"""Schema migrations.

The application owns its schema through Alembic, not ``create_all``. That is
what makes it safe to add a column once there are real customers in the
database: the change ships as a revision and every environment applies it the
same way.

``run_migrations`` is called on startup and handles three cases:

* **empty database** — every revision runs, from the baseline forward;
* **database created by the old ``create_all``** — the tables are already
  there but Alembic has no history, so it is stamped at the baseline and only
  the newer revisions run;
* **already migrated** — nothing happens.

Set ``AUTO_MIGRATE=0`` to take control yourself (``alembic upgrade head``),
which is what you want on a deployment with more than one process.
"""

import logging
import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import inspect

from app.db.session import engine

logger = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_ROOT / "alembic.ini"
BASELINE_REVISION = "0001_baseline"


def _config() -> Config:
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("script_location", str(BACKEND_ROOT / "migrations"))
    return cfg


def _current_revision() -> str | None:
    with engine.connect() as conn:
        return MigrationContext.configure(conn).get_current_revision()


def run_migrations() -> None:
    if os.getenv("AUTO_MIGRATE", "1") not in ("1", "true", "True"):
        logger.info("AUTO_MIGRATE off — skipping schema upgrade")
        return

    cfg = _config()

    # A pre-Alembic database: adopt it at the baseline instead of trying to
    # create tables that already exist.
    if _current_revision() is None and inspect(engine).has_table("companies"):
        logger.info("Existing schema without migration history — stamping baseline")
        command.stamp(cfg, BASELINE_REVISION)

    command.upgrade(cfg, "head")
