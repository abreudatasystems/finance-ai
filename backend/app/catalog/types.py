"""Declarative shapes for a chart-of-accounts template.

These carry **data only** — no database, no session, no side effects. Applying a
template to a company is the provisioning service's job. Keeping the two apart
means a new template (another country, another line of business) is a new data
file and a registry entry, with no logic to touch.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Tuple


@dataclass(frozen=True)
class CategorySpec:
    """One category, optionally with its subcategories."""

    key: str                                   # stable slug — the idempotency key
    name: str
    keywords: Tuple[str, ...] = ()             # feed the OCR classifier
    description: Optional[str] = None
    snc: Optional[str] = None                  # SNC account, e.g. "62" (Portugal)
    children: Tuple["CategorySpec", ...] = ()

    def flatten(self) -> Tuple["CategorySpec", ...]:
        """This category followed by its children, depth-first."""
        out = [self]
        for child in self.children:
            out.extend(child.flatten())
        return tuple(out)


@dataclass(frozen=True)
class GroupSpec:
    """A top-level group. `kind` is the financial nature the group behaves as."""

    key: str
    name: str
    kind: str                                  # income | expense
    icon: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    is_system: bool = False                    # system groups cannot be removed
    categories: Tuple[CategorySpec, ...] = ()


@dataclass(frozen=True)
class ChartTemplate:
    """A named chart of accounts a company can be provisioned with."""

    code: str
    name: str
    description: str
    country: str = "PT"
    standard: Optional[str] = None             # accounting standard it follows
    groups: Tuple[GroupSpec, ...] = field(default_factory=tuple)

    @property
    def category_count(self) -> int:
        return sum(len(c.flatten()) for g in self.groups for c in g.categories)

    def as_dict(self) -> dict:
        """Serialisable preview, for the template picker in the UI."""
        return {
            "code": self.code,
            "name": self.name,
            "description": self.description,
            "country": self.country,
            "standard": self.standard,
            "category_count": self.category_count,
            "groups": [
                {
                    "key": g.key,
                    "name": g.name,
                    "kind": g.kind,
                    "icon": g.icon,
                    "is_system": g.is_system,
                    "categories": [
                        {
                            "key": c.key,
                            "name": c.name,
                            "snc": c.snc,
                            "keywords": list(c.keywords),
                            "children": [
                                {"key": s.key, "name": s.name, "snc": s.snc,
                                 "keywords": list(s.keywords)}
                                for s in c.children
                            ],
                        }
                        for c in g.categories
                    ],
                }
                for g in self.groups
            ],
        }
