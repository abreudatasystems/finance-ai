import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.db.session import SessionLocal
from app.services.health_calculator import get_monthly_summary
from app.services.income_statement import build_statement
from app.services.vat_engine import compute_vat_position
from app.services import retentions

db = SessionLocal()
company_id = "COMP001"

print("--- DASHBOARD SUMMARY ---")
print(get_monthly_summary(company_id, db, 6))

print("--- DRE ---")
print(build_statement(db, company_id, None))

print("--- VAT ---")
print(compute_vat_position(db, company_id, None))

print("--- RETENTIONS ---")
print(retentions.overview(db, company_id))

db.close()
