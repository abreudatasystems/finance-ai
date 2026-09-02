import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.db.session import SessionLocal
from app.services import financials, income_statement, vat_engine, retentions

db = SessionLocal()
company_id = "COMP001"

print("--- FINANCIALS DASHBOARD ---")
try:
    print(financials.dashboard_summary(db, company_id, None))
except Exception as e:
    print("Dashboard Error:", e)

print("--- DRE ---")
try:
    print(income_statement.build_statement(db, company_id, None))
except Exception as e:
    print("DRE Error:", e)

print("--- VAT ---")
try:
    print(vat_engine.vat_position(db, company_id, None))
except Exception as e:
    print("VAT Error:", e)

print("--- RETENTIONS ---")
try:
    print(retentions.retention_map(db, company_id, None))
except Exception as e:
    print("RETENTIONS Error:", e)

db.close()
