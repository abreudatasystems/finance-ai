from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.models import User, Company, UserMembership
from app.schemas.schemas import LoginRequest, UserCreate, Token, UserOut
from app.core.security import verify_password, get_password_hash, create_access_token
from app.services.provisioning import apply_template

router = APIRouter()


def _membership_role(db: Session, user_id: str) -> str:
    mem = db.query(UserMembership).filter(UserMembership.user_id == user_id).first()
    return mem.role if mem else "viewer"


@router.post("/login", response_model=Token)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email).first()
    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou palavra-passe incorretos",
        )
    token = create_access_token(subject=user.id)
    return {"access_token": token, "token_type": "bearer"}


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(request: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == request.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email já registado")

    if len(request.password) < 8:
        raise HTTPException(status_code=400, detail="A palavra-passe deve ter pelo menos 8 caracteres")

    stamp = int(datetime.now(timezone.utc).timestamp() * 1000)
    user_id = f"USR-{stamp}"
    comp_id = f"COMP-{stamp}"

    new_comp = Company(id=comp_id, name=request.company_name, nif="PT500000000")
    new_user = User(
        id=user_id,
        name=request.name,
        email=request.email,
        hashed_password=get_password_hash(request.password),
    )
    new_mem = UserMembership(id=f"MEM-{user_id}", user_id=user_id, company_id=comp_id, role="owner")

    db.add(new_comp)
    db.add(new_user)
    db.add(new_mem)
    db.commit()

    # Give the new company a working chart of accounts straight away.
    apply_template(db, comp_id)

    token = create_access_token(subject=user_id)
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return UserOut(
        id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        avatar=current_user.avatar,
        role=_membership_role(db, current_user.id),
    )
