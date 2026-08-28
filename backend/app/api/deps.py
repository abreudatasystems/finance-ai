from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.security import decode_access_token
from app.models.models import User, UserMembership

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=True)

CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Credenciais inválidas ou sessão expirada",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    user_id = decode_access_token(token)
    if not user_id:
        raise CREDENTIALS_EXCEPTION
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise CREDENTIALS_EXCEPTION
    return user


def get_current_company_id(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> str:
    """Derive the active tenant from the authenticated user's membership.

    This is the single source of truth for tenant isolation — endpoints must
    never trust a client-supplied company_id.
    """
    membership = (
        db.query(UserMembership)
        .filter(UserMembership.user_id == current_user.id)
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Utilizador sem empresa associada",
        )
    return membership.company_id


def require_role(*allowed_roles: str):
    """Dependency factory to gate an endpoint behind one or more roles."""

    def checker(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        membership = (
            db.query(UserMembership)
            .filter(UserMembership.user_id == current_user.id)
            .first()
        )
        if not membership or (allowed_roles and membership.role not in allowed_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permissões insuficientes para esta operação",
            )
        return current_user

    return checker
