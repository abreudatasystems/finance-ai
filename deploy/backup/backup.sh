#!/bin/sh
# Cópia de segurança diária: base de dados (pg_dump) + faturas em disco.
#
# Fica sempre em /backups (pasta ./backups do servidor), BACKUP_KEEP_DAYS dias.
# Se BACKUP_S3_BUCKET estiver definido, cada ficheiro novo também é copiado
# para um bucket S3 compatível (Cloudflare R2, Backblaze B2, AWS S3...) —
# um backup no mesmo disco não sobrevive à perda do disco.
# Com BACKUP_ENCRYPTION_PASSPHRASE, a cópia que sai do servidor vai cifrada
# (gpg, AES256). Restaurar: ver deploy/RESTORE.md.
#
# BACKUP_RUN_ONCE=1 faz uma só ronda e sai (para testar à mão).

set -u
set -o pipefail

BACKUP_DIR=${BACKUP_DIR:-/backups}
UPLOADS_DIR=${UPLOADS_DIR:-/uploads}
KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}
INTERVAL=${BACKUP_INTERVAL_SECONDS:-86400}
BUCKET=${BACKUP_S3_BUCKET:-}
PREFIX=${BACKUP_S3_PREFIX:-finance-ai}
PREFIX=${PREFIX%/}
PASSPHRASE=${BACKUP_ENCRYPTION_PASSPHRASE:-}

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') backup: $*"; }
err() { echo "$(date '+%Y-%m-%d %H:%M:%S') backup: ERRO: $*" >&2; }

if [ -n "$BUCKET" ]; then
  if [ -z "${BACKUP_S3_ENDPOINT:-}" ] || [ -z "${BACKUP_S3_ACCESS_KEY_ID:-}" ] \
      || [ -z "${BACKUP_S3_SECRET_ACCESS_KEY:-}" ]; then
    err "BACKUP_S3_BUCKET definido sem BACKUP_S3_ENDPOINT / chaves: só cópia local."
    BUCKET=""
  else
    # O rclone lê o "remote" das variáveis de ambiente: nada de ficheiro de config.
    export RCLONE_CONFIG_OFFSITE_TYPE=s3
    export RCLONE_CONFIG_OFFSITE_PROVIDER=${BACKUP_S3_PROVIDER:-Other}
    export RCLONE_CONFIG_OFFSITE_ENDPOINT=$BACKUP_S3_ENDPOINT
    export RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID=$BACKUP_S3_ACCESS_KEY_ID
    export RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY=$BACKUP_S3_SECRET_ACCESS_KEY
    export RCLONE_CONFIG_OFFSITE_REGION=${BACKUP_S3_REGION:-auto}
    export RCLONE_CONFIG_OFFSITE_NO_CHECK_BUCKET=true
    log "cópia externa ligada: $BUCKET/$PREFIX"
  fi
fi

# Envia um ficheiro para o bucket (cifrado, se houver frase-passe).
offsite() {
  file=$1
  [ -n "$BUCKET" ] || return 0
  name=$(basename "$file")
  src=$file
  if [ -n "$PASSPHRASE" ]; then
    src="$file.gpg"
    name="$name.gpg"
    if ! printf '%s' "$PASSPHRASE" | gpg --batch --yes --quiet --pinentry-mode loopback \
        --passphrase-fd 0 --symmetric --cipher-algo AES256 -o "$src" "$file"; then
      err "não foi possível cifrar $file; não foi enviado"
      rm -f "$src"
      return 1
    fi
  fi
  if rclone copyto --retries 3 --low-level-retries 5 "$src" "offsite:$BUCKET/$PREFIX/$name"; then
    log "enviado para fora: $PREFIX/$name"
    rc=0
  else
    err "envio para o bucket falhou: $name (fica só a cópia local)"
    rc=1
  fi
  [ "$src" != "$file" ] && rm -f "$src"
  return $rc
}

run_once() {
  stamp=$(date +%Y-%m-%d_%H%M)
  db="$BACKUP_DIR/db_$stamp.sql.gz"
  if pg_dump --no-owner | gzip > "$db"; then
    log "base de dados: $(basename "$db") ($(du -h "$db" | cut -f1))"
    offsite "$db"
  else
    err "o backup da base de dados falhou"
    rm -f "$db"
  fi

  up="$BACKUP_DIR/uploads_$stamp.tar.gz"
  if [ -d "$UPLOADS_DIR" ] && tar -czf "$up" -C "$UPLOADS_DIR" . 2>/dev/null; then
    log "faturas: $(basename "$up")"
    offsite "$up"
  else
    rm -f "$up"
  fi

  find "$BACKUP_DIR" -name '*.gz' -mtime +"$KEEP_DAYS" -delete
  if [ -n "$BUCKET" ] && [ -n "${BACKUP_S3_KEEP_DAYS:-}" ]; then
    rclone delete --min-age "${BACKUP_S3_KEEP_DAYS}d" "offsite:$BUCKET/$PREFIX" \
      || err "não foi possível apagar cópias externas antigas"
  fi
}

while true; do
  run_once
  [ "${BACKUP_RUN_ONCE:-0}" = "1" ] && exit 0
  sleep "$INTERVAL"
done
