"""O agendador num processo só seu.

Dentro da API, cada trabalhador do uvicorn arrancava o seu próprio agendador:
com quatro trabalhadores, quatro varrimentos em paralelo de cada vez. A
restrição única impede lançamentos duplicados, mas o trabalho repetia-se e os
erros apareciam a dobrar. Em produção a API corre com ``SCHEDULER_ENABLED=0``
e isto corre num contentor à parte:

    python -m scripts.run_scheduler
"""

import logging
import os
import time

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
# Quem migra é o contentor "migrate"; este só espera pela base de dados pronta.
os.environ.setdefault("AUTO_MIGRATE", "0")

from app.core.config import settings  # noqa: E402
from app.services.scheduler import sweep  # noqa: E402

logger = logging.getLogger("financeai.scheduler")


def main() -> None:
    interval = settings.SCHEDULER_INTERVAL_HOURS * 3600
    logger.info("Agendador dedicado: varrimento de %s em %s hora(s).",
                settings.SCHEDULER_INTERVAL_HOURS, settings.SCHEDULER_INTERVAL_HOURS)
    while True:
        try:
            sweep()
        except Exception:                                   # noqa: BLE001
            logger.exception("Varrimento falhou; tenta-se de novo no próximo ciclo.")
        time.sleep(interval)


if __name__ == "__main__":
    main()
