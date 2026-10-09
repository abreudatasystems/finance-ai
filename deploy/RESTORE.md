# Cópias de segurança, restauro e monitorização

## Onde estão as cópias

- **No servidor:** `./backups/db_AAAA-MM-DD_HHMM.sql.gz` (base de dados) e
  `./backups/uploads_AAAA-MM-DD_HHMM.tar.gz` (faturas em disco), guardadas
  `BACKUP_KEEP_DAYS` dias.
- **Fora do servidor** (se `BACKUP_S3_BUCKET` estiver definido): as mesmas, em
  `BUCKET/BACKUP_S3_PREFIX/`, com `.gpg` no fim se houver
  `BACKUP_ENCRYPTION_PASSPHRASE`. Apagadas após `BACKUP_S3_KEEP_DAYS` dias, se
  definido (ou use uma regra de ciclo de vida no próprio bucket).

> Guarde a frase-passe num cofre de palavras-passe **fora** do servidor. Sem
> ela, as cópias cifradas não se recuperam.

Testar uma ronda à mão:

    docker compose -f docker-compose.prod.yml run --rm -e BACKUP_RUN_ONCE=1 backup

## Restaurar a partir do bucket

O contentor `backup` já tem `rclone`, `gpg` e `psql` e já conhece o bucket.

```sh
# 1. Abrir uma consola no contentor de backup (no servidor novo ou no mesmo)
docker compose -f docker-compose.prod.yml run --rm --entrypoint sh backup

# 2. Ver e descarregar a cópia pretendida (o remote "offsite" vem das variáveis)
export RCLONE_CONFIG_OFFSITE_TYPE=s3 RCLONE_CONFIG_OFFSITE_PROVIDER=Other \
  RCLONE_CONFIG_OFFSITE_ENDPOINT=$BACKUP_S3_ENDPOINT \
  RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID=$BACKUP_S3_ACCESS_KEY_ID \
  RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY=$BACKUP_S3_SECRET_ACCESS_KEY \
  RCLONE_CONFIG_OFFSITE_REGION=auto
rclone ls offsite:$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX
F=db_2026-10-08_0300.sql.gz.gpg
rclone copyto offsite:$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/$F /backups/$F

# 3. Decifrar (só se terminar em .gpg)
gpg --batch --pinentry-mode loopback --passphrase "$BACKUP_ENCRYPTION_PASSPHRASE" \
  -d /backups/$F > /backups/${F%.gpg}
```

### Base de dados

Pare a API e o agendador, recrie a base vazia e carregue a cópia:

```sh
docker compose -f docker-compose.prod.yml stop backend scheduler
docker compose -f docker-compose.prod.yml exec postgres sh -c \
  'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
gunzip -c backups/db_2026-10-08_0300.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres sh -c 'psql -q -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose -f docker-compose.prod.yml up -d
```

### Faturas em disco

```sh
docker compose -f docker-compose.prod.yml run --rm --entrypoint sh \
  -v "$PWD/backups:/restore:ro" backend -c 'tar -xzf /restore/uploads_2026-10-08_0300.tar.gz -C /app/uploads'
```

(Faturas guardadas no R2 da aplicação — `R2_*` — não passam por aqui.)

## Monitorização

- **Disponibilidade:** aponte um monitor externo (UptimeRobot, Better Stack,
  Healthchecks...) a `https://DOMÍNIO/api/v1/health`. Responde `200` com
  `{"status":"ok"}` quando a API e a base de dados estão bem e `503` quando a
  base de dados não responde. Sem autenticação; não devolve dados.
- **Erros:** com `SENTRY_DSN` definido, a API, o agendador e os erros do
  navegador (`POST /api/v1/client-errors`, registados como `financeai.client`)
  vão para o Sentry — sem corpos de pedidos, cookies nem cabeçalhos de
  autenticação. Sem `SENTRY_DSN`, ficam só nos registos
  (`docker compose -f docker-compose.prod.yml logs backend`).
