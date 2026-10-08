# Finance AI — gestão financeira para PME portuguesas

Aplicação multi-empresa para a tesouraria de uma PME: fluxo de caixa, contas a
pagar e a receber, faturas com leitura automática (OCR), IVA e retenções na
fonte, reconciliação bancária, orçamentos, projetos, demonstração de
resultados e exportação SAF-T.

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Recharts
- **Backend**: Python 3.11, FastAPI, SQLAlchemy 2, Pydantic v2, Alembic
- **Base de dados**: PostgreSQL em produção; SQLite para desenvolver
- **Documentos**: Tesseract (OCR local, português) + pdfplumber; ficheiros no Cloudflare R2 ou em disco
- **Produção**: Docker Compose com Caddy (HTTPS automático)

---

## Desenvolvimento

Pré-requisitos: Python 3.11+, Node.js 20+.

### Backend

```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate | Linux/macOS: source venv/bin/activate
pip install -r requirements-dev.txt
python -m uvicorn app.main:app --port 8000 --reload
```

Documentação da API: `http://127.0.0.1:8000/docs` · Estado: `http://127.0.0.1:8000/health`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Abrir `http://localhost:3000`. No Windows, `start.bat` arranca os dois.

### Dados de demonstração

`scripts/seed_demo.py` cria uma PME plausível — um estúdio no Porto com nove
meses de faturas, rendas com retenção a 25%, subcontratos imputados a projetos
e uma parte ainda por pagar. Tudo entra pelos mesmos endpoints que a aplicação
usa, por isso os totais, o IVA e as retenções são calculados pelo produto.

```bash
cd backend
python -m scripts.seed_demo            # criar
python -m scripts.seed_demo --reset    # apagar os dados dessa empresa e recriar
```

Entrar com `demo@finance-ai.pt` / `Tesouraria!Atlantico26`.

### Testes

```bash
cd backend && python -m pytest -q            # backend
cd frontend && npx eslint src && npx tsc --noEmit && npx next build
```

A CI (`.github/workflows/ci.yml`) corre tudo isto em cada push e pull request.

### Base de dados e migrações

O esquema é gerido pelo **Alembic**. Em desenvolvimento a API põe a base de
dados em dia ao arrancar. Para controlar à mão, `AUTO_MIGRATE=0` e:

```bash
alembic upgrade head                       # aplicar migrações pendentes
alembic revision --autogenerate -m "..."   # depois de mudar um modelo
alembic downgrade -1                       # recuar uma revisão
```

Para desenvolver contra PostgreSQL em vez de SQLite: `docker compose up -d` e
`DATABASE_URL=postgresql://finance_user:finance_dev@localhost:5432/finance_ai_db`.

---

## Produção

```bash
cp .env.example .env      # preencher DOMAIN, SECRET_KEY, POSTGRES_PASSWORD, ...
docker compose -f docker-compose.prod.yml up --build -d
```

Antes: o DNS do domínio tem de apontar para o servidor, com as portas 80 e 443
abertas. O que o `docker-compose.prod.yml` monta:

| Serviço | Função |
|---|---|
| `caddy` | Único ponto exposto. Certificado HTTPS automático; `/api/*` → backend, resto → frontend |
| `migrate` | Põe o esquema em dia uma vez, antes da API arrancar |
| `backend` | A API (4 trabalhadores, sem agendador, `/health` para o Docker) |
| `scheduler` | Gera as recorrências (rendas, avenças) num processo só |
| `frontend` | A aplicação web |
| `postgres` | Base de dados, sem porta exposta |
| `backup` | Cópia diária da base de dados e das faturas em disco para `./backups` |

Com `ENVIRONMENT=production` (já definido no compose) a API **recusa arrancar**
sem `SECRET_KEY`, com CORS a apontar para localhost ou com SQLite.

**Cópias de segurança:** ficam em `./backups` no servidor, durante
`BACKUP_KEEP_DAYS` dias. Copie essa pasta para fora do servidor com
regularidade (outro disco, outro serviço). Para repor a base de dados:

```bash
gunzip -c backups/db_AAAA-MM-DD_HHMM.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U financeuser financedb
```

### Documentos: OCR e armazenamento

A leitura de faturas usa motores locais — nenhum documento sai para um
terceiro. Um PDF com camada de texto lê-se directamente; uma fotografia ou um
PDF digitalizado passam pelo Tesseract com o dicionário português (já
instalado na imagem Docker). `GET /api/v1/documents/capabilities` diz o que a
instalação consegue ler.

Fora do Docker: `sudo apt-get install tesseract-ocr tesseract-ocr-por`, ou no
Windows o instalador em https://github.com/UB-Mannheim/tesseract/wiki (idioma
"Portuguese").

Os ficheiros originais vão para o **Cloudflare R2** quando as variáveis `R2_*`
estão definidas, com a chave `companies/{empresa}/documents/{sha256}.{ext}`.
Sem elas ficam em disco, com a mesma disposição. Só são servidos depois de
verificar que pertencem à empresa activa: `GET /api/v1/documents/{id}/file`.

### Recorrências

O serviço `scheduler` gera as recorrências vencidas de `SCHEDULER_INTERVAL_HOURS`
em `SCHEDULER_INTERVAL_HOURS` horas (6 por omissão), para todas as empresas. A
geração é idempotente — a restrição `uq_occurrence_recurrence_period` impede
lançar o mesmo mês duas vezes. Em desenvolvimento corre dentro da API;
`SCHEDULER_ENABLED=0` desliga-o, e `POST /api/v1/recurrences/run` faz o mesmo à mão.

### Webhooks

`/api/v1/webhooks/email` e `/api/v1/webhooks/whatsapp` ficam **fechados** (503)
até haver `WEBHOOK_SECRET`. Quem os chama envia o segredo no cabeçalho
`X-Webhook-Secret` e o `company_id` de uma empresa que exista.

### Email dos convites

Com `SMTP_*` definido, os convites seguem por email; sem isso o convite é
criado e o link é devolvido para enviar à mão.

### Segurança

- Multi-empresa: a empresa activa viaja no cabeçalho `X-Company-Id` e só é
  aceite depois de verificar que o utilizador pertence a ela.
- Papéis: proprietário, administrador, gestor financeiro, consulta.
- Login: bloqueio temporário após 5 falhas por conta e 30 por endereço IP.
- Palavras-passe: mínimo 10 caracteres, sem as mais comuns.

---

## Licença

Distribuído sob a licença MIT.
