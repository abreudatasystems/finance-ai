"""A hora UTC sem fuso agarrado, como a base de dados a guarda.

``datetime.utcnow`` faz exactamente isto, mas está obsoleto desde o Python
3.12 e vai desaparecer. Esta função devolve o mesmo valor — UTC, *naive* —
para as colunas e comparações continuarem iguais.
"""

from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)
