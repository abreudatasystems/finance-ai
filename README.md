# 🏛️ Finance AI — Financial Operating System for PMEs

![Finance AI Banner](https://img.shields.io/badge/Platform-Enterprise%20SaaS-black?style=for-the-badge)
![Next.js 15](https://img.shields.io/badge/Frontend-Next.js%2015-black?style=for-the-badge&logo=next.js)
![Python FastAPI](https://img.shields.io/badge/Backend-FastAPI%20Python-emerald?style=for-the-badge&logo=fastapi)
![Docker](https://img.shields.io/badge/Deploy-Docker%20Compose-blue?style=for-the-badge&logo=docker)

> **Your AI Finance Team for Business** — Autonomous financial management platform featuring real-time cash flow analysis, OCR invoice parsing, multi-tenant database isolation, and side-by-side AI Copilot.

---

## ✨ Features

- **📊 Financial Command Center (Dashboard)**: Real-time calculation of Financial Health Score, Runway, Burn Rate, and Liquidity metrics.
- **🤖 Transversal AI Copilot**: Side-by-side AI assistant capable of creating transactions, categorizing invoices, and executing financial intent via natural language.
- **📄 Finance Inbox & OCR Engine**: Automated document processing (PDF/Images) with PyPDF, PaddleOCR, and Qwen2.5-VL vision capabilities.
- **💼 Complete Financial Management**: Cash Flow, Payables, Receivables, Categories, Suppliers, Customers, Audit Trail, and CSV Reports.
- **🔐 Multi-Tenant Architecture**: Complete tenant isolation by `company_id` with relational PostgreSQL/SQLAlchemy ORM models.
- **🖤 Monochromatic Black & Emerald Aesthetic**: High-contrast, enterprise-grade user interface using Tailwind CSS and Lucide Vector SVGs.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ & npm
- Python 3.11+

### 1. Start Backend API
```bash
cd backend
python -m venv venv
# Activate virtual environment
# Windows: venv\Scripts\activate | Linux/macOS: source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000 --reload
```
API docs available at: `http://127.0.0.1:8000/docs`

The schema is managed by **Alembic**, not `create_all`. Startup brings the
database up to date on its own (a database created before migrations existed is
stamped at the baseline first). To take control yourself — which is what you
want when more than one process boots at the same time — set `AUTO_MIGRATE=0`
and run the upgrade explicitly:

```bash
export AUTO_MIGRATE=0
alembic upgrade head                       # apply pending migrations
alembic revision --autogenerate -m "..."   # after changing a model
alembic downgrade -1                       # step back one revision
```

### Testes

The suite covers the rules that are expensive to get wrong — VAT arithmetic,
tenant isolation, approval-is-not-payment, reconciliation, recurrence
idempotency and the migrations themselves:

```bash
cd backend
python -m pytest -q
```

CI runs it on every push and pull request, together with the frontend
typecheck and build (`.github/workflows/ci.yml`).

### Produção

Set `ENVIRONMENT=production` and the app refuses to start on a configuration
that would lose sessions or leave the API open — no `SECRET_KEY`, CORS still
pointing at localhost, or SQLite as the database. Failing at boot is cheaper
than failing with customers on it.

```bash
export ENVIRONMENT=production
export SECRET_KEY=$(python -c "import secrets;print(secrets.token_urlsafe(48))")
export DATABASE_URL=postgresql://user:pass@host/finance
export BACKEND_CORS_ORIGINS=https://app.exemplo.pt
```

### Email (opcional)

Invitations are emailed when SMTP is configured; without it the invitation is
still created and the link is handed back to be sent by hand, so nothing
depends on having a mail server:

```bash
export SMTP_HOST=smtp.exemplo.pt
export SMTP_PORT=587
export SMTP_USER=convites@exemplo.pt
export SMTP_PASSWORD=...
export SMTP_FROM="Finance AI <convites@exemplo.pt>"
export APP_BASE_URL=https://app.exemplo.pt   # where the invitation links point
```

### Multi-empresa e equipas

A login can own several companies; each is a separate tenant. The active one
travels in the `X-Company-Id` header and is only accepted after the membership
is checked, so data from two companies never mixes. People are brought in by
invitation (`/settings` → Equipa & Permissões) with a role — proprietário,
administrador, gestor financeiro or consulta. An account created from an
invitation participates in the companies that invited it and cannot open its
own.

### 2. Start Frontend App
```bash
cd frontend
npm install
npm run dev
```
Open application at: `http://localhost:3000`

---

## 🐳 Production Deployment (Docker Compose)

```bash
docker-compose -f docker-compose.prod.yml up --build -d
```

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS v4, Lucide Icons, Recharts
- **Backend**: Python 3.11, FastAPI, SQLAlchemy, Pydantic v2, Uvicorn
- **AI & Processing**: Custom Intent Engine, PyPDF, PaddleOCR, Qwen2.5-VL Vision
- **Storage & DB**: MinIO S3 Object Storage, PostgreSQL / SQLite Relational DB

---

## 📜 License

Distributed under the MIT License.
