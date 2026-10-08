# Production Dockerfile for the FastAPI backend.
# A mesma imagem serve três papéis no docker-compose.prod.yml: a API, o passo
# de migração (scripts.migrate) e o agendador (scripts.run_scheduler).
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# tesseract-ocr lê as fotografias de recibos e os PDFs digitalizados, que
# são como a maior parte das despesas de uma PME entra no sistema. Sem o
# dicionário português o motor lê, mas troca acentos e palavras — e um
# "Fatura" lido como "Fatuia" deixa de ser reconhecido pelo parser.
# curl serve o HEALTHCHECK. Não há compilador: o psycopg[binary] já vem compilado.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tesseract-ocr \
    tesseract-ocr-por \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

# A aplicação não corre como root: uma falha na API não dá o contentor inteiro.
RUN useradd --create-home --uid 1001 app
COPY --chown=app:app . .
RUN mkdir -p /app/uploads && chown app:app /app/uploads
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

# --proxy-headers: atrás do Caddy, o endereço do cliente vem do cabeçalho
# X-Forwarded-For — é ele que o limite de tentativas de login por endereço usa.
ENV WEB_CONCURRENCY=4
CMD ["sh", "-c", "exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY} --proxy-headers --forwarded-allow-ips='*'"]
