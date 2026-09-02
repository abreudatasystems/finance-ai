import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.db.session import SessionLocal
from app.services.income_statement import build as build_dre
from app.services.vat_engine import compute_vat_position
from app.services.retentions import position as retention_position

db = SessionLocal()
company_id = "COMP001"

print("--- DRE T3 ---")
try:
    print(build_dre(db, company_id, "2026-T3"))
except Exception as e:
    print("DRE Error:", e)

print("--- DRE 08 ---")
try:
    print(build_dre(db, company_id, "2026-08"))
except Exception as e:
    print("DRE Error:", e)

print("--- VAT T3 ---")
try:
    print(compute_vat_position(db, company_id, "2026-T3"))
except Exception as e:
    print("VAT Error:", e)

db.close()
