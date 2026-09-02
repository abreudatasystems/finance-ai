"""As taxas de IVA por trás dos nomes.

O catálogo de artigos guarda a taxa pelo nome — *Normal*, *Intermédia*,
*Reduzida*, *Isenta* — e as linhas de um documento guardam a percentagem. Os
dois estão certos, e é preciso um sítio que os ligue.

Guardar o nome no artigo é a decisão acertada por duas razões: as percentagens
mudam por lei, e mudam **por região** — o continente, a Madeira e os Açores
têm taxas próprias. Um artigo com "23" gravado fica errado quando a lei muda
ou quando a empresa fatura a partir de outra região; um artigo com "Normal"
continua a dizer a verdade e é a tabela que se atualiza.

A percentagem gravada em cada linha de documento é o oposto, e também está
certa: uma fatura de 2024 tem de continuar a mostrar a taxa de 2024 para
sempre. O nome resolve-se em percentagem **no momento em que a linha nasce**,
e nunca mais muda.

As percentagens abaixo são as que vigoram à data de escrita. Uma alteração em
Orçamento do Estado muda esta tabela e mais nada.
"""

from __future__ import annotations

from typing import Dict, Optional, Tuple

#: continente | madeira | acores — de onde a empresa fatura.
DEFAULT_REGION = "continente"

#: nome da taxa → percentagem, por região.
RATES: Dict[str, Dict[str, float]] = {
    "continente": {"normal": 23.0, "intermedia": 13.0, "reduzida": 6.0, "isenta": 0.0},
    "madeira":    {"normal": 22.0, "intermedia": 12.0, "reduzida": 5.0, "isenta": 0.0},
    "acores":     {"normal": 16.0, "intermedia": 9.0,  "reduzida": 4.0, "isenta": 0.0},
}

#: O que o utilizador escreve → a chave interna. Aceita acentos, maiúsculas e
#: a própria percentagem, porque um catálogo importado de outro sistema traz
#: as três formas.
ALIASES: Dict[str, str] = {
    "normal": "normal", "taxa normal": "normal", "23": "normal", "23%": "normal",
    "intermedia": "intermedia", "intermédia": "intermedia",
    "taxa intermedia": "intermedia", "taxa intermédia": "intermedia",
    "13": "intermedia", "13%": "intermedia",
    "reduzida": "reduzida", "taxa reduzida": "reduzida",
    "6": "reduzida", "6%": "reduzida",
    "isenta": "isenta", "isento": "isenta", "sem iva": "isenta",
    "0": "isenta", "0%": "isenta",
}

LABELS: Dict[str, str] = {
    "normal": "Normal",
    "intermedia": "Intermédia",
    "reduzida": "Reduzida",
    "isenta": "Isenta",
}


def normalise(name: Optional[str]) -> Optional[str]:
    """O nome escrito de qualquer maneira → a chave interna, ou None."""
    if name is None:
        return None
    return ALIASES.get(str(name).strip().lower())


def rate_for(name: Optional[str], region: str = DEFAULT_REGION) -> Optional[float]:
    """A percentagem por trás de um nome, na região da empresa.

    Devolve None quando o nome não é reconhecido — melhor não ter taxa do que
    inventar uma: um documento com a taxa errada é pior do que um documento
    por preencher.
    """
    key = normalise(name)
    if key is None:
        return None
    return RATES.get(region, RATES[DEFAULT_REGION]).get(key)


def label_for(name: Optional[str]) -> Optional[str]:
    key = normalise(name)
    return LABELS.get(key) if key else None


def options(region: str = DEFAULT_REGION) -> Tuple[dict, ...]:
    """As taxas que se podem escolher, com a percentagem que vigora."""
    table = RATES.get(region, RATES[DEFAULT_REGION])
    return tuple(
        {"chave": key, "label": LABELS[key], "taxa": table[key]}
        for key in ("normal", "intermedia", "reduzida", "isenta")
    )
