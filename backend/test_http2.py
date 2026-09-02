import json
import urllib.request
import urllib.parse

# 1. Login to get token
login_data = urllib.parse.urlencode({"username": "demo@finance-ai.pt", "password": "password"}).encode("utf-8")
req = urllib.request.Request("http://localhost:8000/api/v1/auth/login", data=login_data)
try:
    with urllib.request.urlopen(req) as resp:
        token = json.loads(resp.read())["access_token"]
except Exception as e:
    print("Login Error:", e)
    exit(1)

headers = {"Authorization": f"Bearer {token}", "X-Company-Id": "COMP001"}

endpoints = [
    "/dashboard/summary",
    "/reports/income-statement?period=2026-T3",
    "/fiscal/vat-position?period=2026-T3",
    "/retentions/position"
]

for ep in endpoints:
    url = f"http://localhost:8000/api/v1{ep}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"[{resp.getcode()}] {ep}")
    except urllib.error.HTTPError as e:
        print(f"[{e.code}] {ep}")
        print(e.read().decode("utf-8"))
    except Exception as e:
        print(f"[Error] {ep}: {e}")

