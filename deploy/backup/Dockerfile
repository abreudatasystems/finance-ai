# Cópias de segurança: pg_dump da mesma versão do Postgres + rclone (envio
# para um bucket S3 compatível, ex. Cloudflare R2) + gpg (cifra opcional).
FROM postgres:16-alpine
RUN apk add --no-cache rclone gnupg
COPY backup.sh /usr/local/bin/backup.sh
# Pode ter vindo de Windows com CRLF.
RUN sed -i 's/\r$//' /usr/local/bin/backup.sh && chmod +x /usr/local/bin/backup.sh
ENTRYPOINT ["/usr/local/bin/backup.sh"]
