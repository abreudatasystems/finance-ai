"""Põe o esquema da base de dados em dia, uma vez, antes de a API arrancar.

Com vários trabalhadores, cada um migrava ao importar a aplicação — quatro
processos a alterar as mesmas tabelas ao mesmo tempo. Em produção a API corre
com ``AUTO_MIGRATE=0`` e este passo corre antes, sozinho:

    python -m scripts.migrate

Usa o mesmo ``run_migrations`` do arranque, por isso trata também de uma base
de dados antiga, criada antes de haver migrações.
"""

import logging
import os

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
os.environ["AUTO_MIGRATE"] = "1"

from app.db.migrate import run_migrations  # noqa: E402

if __name__ == "__main__":
    run_migrations()
