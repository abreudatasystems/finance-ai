import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.db.session import SessionLocal
from app.services.health_calculator import get_monthly_summary
from app.services.income_statement import build as build_dre
from app.services.vat_engine import compute_vat_position
from app.services.retentions import position as retention_position

db = SessionLocal()
company_id = "COMP001"

print("--- DASHBOARD SUMMARY ---")
print(get_monthly_summary(company_id, db, 6))

print("--- DRE ---")
print(build_dre(db, company_id, None))

print("--- VAT ---")
print(compute_vat_position(db, company_id, None))

print("--- RETENTIONS ---")
print(retention_position(db, company_id, None, None))

db.close()
