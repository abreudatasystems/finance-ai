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
