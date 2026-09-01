"""Registry of available chart-of-accounts templates.

Adding a plan: create a module under ``templates/`` exposing ``TEMPLATE`` and
register it here. Nothing else in the codebase needs to change.
"""

from typing import Dict, List, Optional

from app.catalog.types import ChartTemplate
from app.catalog.templates.pt_snc import TEMPLATE as PT_SNC_PME

# The plan a company is provisioned with when none is chosen.
DEFAULT_TEMPLATE_CODE = PT_SNC_PME.code

_TEMPLATES: Dict[str, ChartTemplate] = {
    PT_SNC_PME.code: PT_SNC_PME,
}


def list_templates() -> List[ChartTemplate]:
    return list(_TEMPLATES.values())


def get_template(code: Optional[str] = None) -> ChartTemplate:
    """Return a template by code, falling back to the default."""
    if code and code in _TEMPLATES:
        return _TEMPLATES[code]
    return _TEMPLATES[DEFAULT_TEMPLATE_CODE]


def register(template: ChartTemplate) -> None:
    """Register an extra template at import time (used by plugins/tests)."""
    _TEMPLATES[template.code] = template
