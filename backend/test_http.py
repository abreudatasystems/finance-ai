import requests

# 1. Login to get token
resp = requests.post("http://localhost:8000/api/v1/auth/login", data={"username": "demo@finance-ai.pt", "password": "password"})
token = resp.json()["access_token"]
headers = {"Authorization": f"Bearer {token}", "X-Company-Id": "COMP001"}

endpoints = [
    "/dashboard/summary",
    "/reports/income-statement?period=2026-T3",
    "/fiscal/vat-position?period=2026-T3",
    "/retentions/position"
]

for ep in endpoints:
    url = f"http://localhost:8000/api/v1{ep}"
    r = requests.get(url, headers=headers)
    print(f"[{r.status_code}] {ep}")
    if r.status_code != 200:
        print(r.text)

