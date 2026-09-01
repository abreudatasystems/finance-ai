"""Request-scoped dependencies: who is calling, for which company, with what rights.

Two rules hold everywhere in the API:

1. **The tenant never comes from the request body.** The active company is
   taken from the ``X-Company-Id`` header and only accepted after checking the
   caller actually has a membership in it. A login with three companies gets
   three isolated data sets; there is no request shape that mixes them.
2. **Permissions are per company.** The same user can be owner of their own
   company and viewer in a client's, so every role check is scoped to the
   active company, never to "the first membership found".
"""

from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.security import decode_access_token
from app.models.models import User, UserMembership

from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=True)

CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Credenciais inválidas ou sessão expirada",
    headers={"WWW-Authenticate": "Bearer"},
)

# Roles, from most to least powerful.
ROLE_OWNER = "owner"
ROLE_ADMIN = "admin"
ROLE_FINANCE = "finance_manager"
ROLE_VIEWER = "viewer"

ROLE_ORDER = [ROLE_OWNER, ROLE_ADMIN, ROLE_FINANCE, ROLE_VIEWER]
VALID_ROLES = set(ROLE_ORDER)

#: Roles allowed to change financial data. A viewer reads and nothing else.
WRITE_ROLES = (ROLE_OWNER, ROLE_ADMIN, ROLE_FINANCE)
#: Roles allowed to administer the company: members, invitations, settings.
ADMIN_ROLES = (ROLE_OWNER, ROLE_ADMIN)

ROLE_LABELS = {
    ROLE_OWNER: "Proprietário",
    ROLE_ADMIN: "Administrador",
    ROLE_FINANCE: "Gestor financeiro",
    ROLE_VIEWER: "Consulta",
}


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    user_id = decode_access_token(token)
    if not user_id:
        raise CREDENTIALS_EXCEPTION
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise CREDENTIALS_EXCEPTION
    if user.active is False:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Conta desativada")
    return user


def get_current_membership(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    x_company_id: Optional[str] = Header(default=None, alias="X-Company-Id"),
) -> UserMembership:
    """Resolve the active company for this request.

    The client says which company it is working in through ``X-Company-Id``;
    the membership lookup is what makes that claim trustworthy. Without the
    header we fall back to the oldest membership, so single-company logins and
    older clients keep working unchanged.
    """
    query = db.query(UserMembership).filter(UserMembership.user_id == current_user.id)

    if x_company_id:
        membership = query.filter(UserMembership.company_id == x_company_id).first()
        if not membership:
            # Not "forbidden": from this caller's side the company does not exist.
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Empresa não encontrada ou sem acesso",
            )
        return membership

    membership = query.order_by(UserMembership.joined_at).first()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Utilizador sem empresa associada",
        )
    return membership


def get_current_company_id(membership: UserMembership = Depends(get_current_membership)) -> str:
    """The single source of truth for tenant isolation."""
    return membership.company_id


def get_current_role(membership: UserMembership = Depends(get_current_membership)) -> str:
    return membership.role or ROLE_VIEWER


def require_role(*allowed_roles: str):
    """Gate an endpoint behind one or more roles **in the active company**."""

    def checker(
        current_user: User = Depends(get_current_user),
        membership: UserMembership = Depends(get_current_membership),
    ) -> User:
        if allowed_roles and membership.role not in allowed_roles:
            allowed = ", ".join(ROLE_LABELS.get(r, r) for r in allowed_roles)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permissões insuficientes: esta operação exige {allowed}.",
            )
        return current_user

    return checker


#: Blocks viewers from writing financial data.
require_write = require_role(*WRITE_ROLES)
#: Blocks anyone below admin from administering the company.
require_admin = require_role(*ADMIN_ROLES)


def membership_for(db: Session, user_id: str, company_id: str) -> Optional[UserMembership]:
    return (
        db.query(UserMembership)
        .filter(UserMembership.user_id == user_id, UserMembership.company_id == company_id)
        .first()
    )
