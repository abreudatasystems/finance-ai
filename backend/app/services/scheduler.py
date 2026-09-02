"""O que se repete tem de repetir-se sozinho.

O módulo de recorrências sabia gerar tudo o que estava em atraso, mas só o
fazia quando alguém abria a aplicação e carregava em *Gerar*. Uma renda que se
paga todos os meses dependia de alguém se lembrar dela — que é exactamente o
problema que uma recorrência existe para resolver. Pior: havia um alerta
("recorrências em atraso") a avisar do sintoma, e a cura era manual.

Isto corre a geração de tempos a tempos, para todas as empresas.

**Porque não há um bloqueio distribuído.** Com mais do que um trabalhador, ou
mais do que uma réplica, o varrimento corre em paralelo. Não é preciso
coordená-los: a restrição ``uq_occurrence_recurrence_period`` faz de cada
período de cada recorrência uma coisa que só pode existir uma vez, e quem
perde a corrida desfaz o que ia escrever. O resultado com dois processos é
igual ao resultado com um; o custo é trabalho repetido, e num varrimento de
poucas horas sobre um punhado de empresas isso não paga a complexidade de um
lease em base de dados.

**Porque não é um cron externo.** Um cron seria melhor numa instalação grande,
e continua a poder ser: ``POST /recurrences/run`` faz exactamente o mesmo e
está lá. Isto existe para que a instalação pequena — a esmagadora maioria —
funcione sem ninguém montar nada. Desliga-se com ``SCHEDULER_ENABLED=0``.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date
from typing import Optional

from app.db.session import SessionLocal
from app.models.models import Company

logger = logging.getLogger("financeai.scheduler")

#: Quem aparece como autor dos lançamentos gerados sem ninguém à frente.
AUTHOR = "Automático"


def sweep(today: Optional[date] = None) -> dict:
    """Uma passagem por todas as empresas. Devolve o que gerou.

    Cada empresa é uma sessão à parte: uma que rebente — um plano de contas
    mexido à mão, uma recorrência com dados impossíveis — não pode impedir as
    outras de correr.
    """
    from app.services import recurrences

    db = SessionLocal()
    try:
        company_ids = [row[0] for row in db.query(Company.id).all()]
    finally:
        db.close()

    generated, failed = 0, []
    for company_id in company_ids:
        db = SessionLocal()
        try:
            result = recurrences.run(db, company_id, today, created_by=AUTHOR)
            generated += result.get("gerados", 0)
        except Exception:                                   # noqa: BLE001
            db.rollback()
            failed.append(company_id)
            logger.exception("Recorrências falharam na empresa %s", company_id)
        finally:
            db.close()

    if generated or failed:
        logger.info(
            "Varrimento: %s empresa(s), %s lançamento(s) gerado(s), %s falha(s)",
            len(company_ids), generated, len(failed),
        )
    return {"empresas": len(company_ids), "gerados": generated, "falhas": failed}


async def _loop(interval_seconds: int, first_delay_seconds: int) -> None:
    """Acorda de tempos a tempos e faz o varrimento.

    O primeiro só acontece uns segundos depois do arranque: a aplicação tem de
    estar a responder antes de se pôr a trabalhar, senão o primeiro pedido de
    quem abre a página espera pelo varrimento.
    """
    try:
        await asyncio.sleep(first_delay_seconds)
        while True:
            # A geração toca na base de dados de forma síncrona; num thread
            # para não bloquear o loop de eventos que serve os pedidos.
            await asyncio.to_thread(sweep)
            await asyncio.sleep(interval_seconds)
    except asyncio.CancelledError:
        logger.info("Agendador parado.")
        raise


def start(interval_seconds: int = 6 * 3600,
          first_delay_seconds: int = 30) -> Optional[asyncio.Task]:
    """Põe o agendador a correr, e devolve a tarefa para quem a queira parar."""
    task = asyncio.create_task(_loop(interval_seconds, first_delay_seconds))
    logger.info("Agendador a correr de %s em %s hora(s).",
                interval_seconds // 3600, interval_seconds // 3600)
    return task
