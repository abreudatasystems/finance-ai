import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

# We need to bypass auth or authenticate.
# Let's just create a token for user USR001.
from app.core.security import create_access_token
token = create_access_token(data={"sub": "USR001"})

response = client.get("/api/v1/collections/", headers={"Authorization": f"Bearer {token}"})
print("STATUS CODE:", response.status_code)
print("RESPONSE:", response.json() if response.status_code == 200 else response.text)
