from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.models.models import Category

router = APIRouter()

@router.get("/")
def get_categories(company_id: str = "COMP001", type: str = None, db: Session = Depends(get_db)):
    query = db.query(Category).filter(Category.company_id == company_id)
    if type:
        query = query.filter(Category.type == type)
    cats = query.all()
    
    # Format tree structure
    parents = [c for c in cats if not c.parent_id]
    result = []
    for p in parents:
        children = [
            {
                "id": c.id,
                "company_id": c.company_id,
                "type": c.type,
                "name": c.name,
                "parent_id": c.parent_id,
                "description": c.description,
                "keywords": c.keywords.split(",") if c.keywords else [],
                "active": c.active
            }
            for c in cats if c.parent_id == p.id
        ]
        result.append({
            "id": p.id,
            "company_id": p.company_id,
            "type": p.type,
            "name": p.name,
            "description": p.description,
            "active": p.active,
            "children": children
        })
    return result
