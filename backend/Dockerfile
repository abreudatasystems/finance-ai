# Production Dockerfile for FastAPI Backend
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# tesseract-ocr lê as fotografias de recibos e os PDFs digitalizados, que
# são como a maior parte das despesas de uma PME entra no sistema. Sem o
# dicionário português o motor lê, mas troca acentos e palavras — e um
# "Fatura" lido como "Fatuia" deixa de ser reconhecido pelo parser.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    tesseract-ocr \
    tesseract-ocr-por \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
