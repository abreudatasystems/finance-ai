import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.db.session import SessionLocal
from app.services import collections as service

db = SessionLocal()
print(service.overview(db, "COMP001", None))
db.close()
