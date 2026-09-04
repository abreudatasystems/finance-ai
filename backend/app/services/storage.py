"""Onde os documentos ficam guardados.

Uma fatura digitalizada é a prova de um lançamento. Se o ficheiro se perde, o
lançamento fica sem suporte — e numa inspecção é o suporte que conta. Por isso
isto guarda no Cloudflare R2, que replica e não se apaga com o contentor, em
vez de num disco que morre com a máquina.

**A chave é o que muda mais.** O armazenamento anterior gravava o ficheiro com
o nome que o utilizador lhe deu, tal e qual, num único directório:

    uploads/fatura.pdf

Duas empresas a carregar uma ``fatura.pdf`` escreviam a mesma chave, e a
segunda apagava a primeira — a empresa A perdia o documento e passava a ver o
da empresa B. As chaves passam a ser

    companies/{empresa}/documents/{sha256}.pdf

que resolve as duas coisas de uma vez: o prefixo separa as empresas, e o hash
do conteúdo separa ficheiros diferentes com o mesmo nome. Como o hash já é
calculado para detectar duplicados, a chave é dedutível a partir da linha na
base de dados e não foi preciso guardar mais nada.

**Sem credenciais, escreve em disco.** Quem clona o repositório e corre os
testes não tem uma conta na Cloudflare, e não devia precisar. O R2 entra
quando as variáveis existem; sem elas fica o disco local, com a mesma
disposição de chaves para o comportamento ser o mesmo.
"""

from __future__ import annotations

import logging
import os
import shutil
from typing import Optional

logger = logging.getLogger("financeai.storage")

try:
    import boto3
    from botocore.config import Config as BotoConfig
    from botocore.exceptions import BotoCoreError, ClientError
    HAS_BOTO3 = True
except ImportError:                                     # pragma: no cover
    HAS_BOTO3 = False

#: Onde o disco local guarda, quando o R2 não está configurado.
LOCAL_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "uploads",
)

R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.getenv("R2_BUCKET", "finance-ai-documents")
#: ``eu`` mantém os objectos em território europeu, o que para documentos
#: fiscais de clientes portugueses é o que se quer. Um bucket criado sem
#: jurisdição vive onde a Cloudflare decidir, e muda o endereço do endpoint.
R2_JURISDICTION = os.getenv("R2_JURISDICTION", "").strip().lower()


def r2_endpoint() -> str:
    host = f"{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    if R2_JURISDICTION:
        host = f"{R2_ACCOUNT_ID}.{R2_JURISDICTION}.r2.cloudflarestorage.com"
    return f"https://{host}"


def _safe_extension(file_name: str) -> str:
    """A extensão, limpa. Entra numa chave, portanto não pode trazer caminhos."""
    suffix = os.path.splitext(os.path.basename(file_name or ""))[1].lower()
    if not suffix or len(suffix) > 10:
        return ""
    return suffix if all(c.isalnum() or c == "." for c in suffix) else ""


def object_key(company_id: str, file_hash: str, file_name: str = "") -> str:
    """A chave de um documento. Dedutível da linha, por isso não se guarda."""
    return f"companies/{company_id}/documents/{file_hash}{_safe_extension(file_name)}"


class DocumentStorage:
    """R2 quando está configurado; disco quando não está."""

    def __init__(self) -> None:
        self._client = None
        self.backend = "local"
        os.makedirs(LOCAL_ROOT, exist_ok=True)

        configured = all((R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY))
        if not configured:
            logger.info("R2 não configurado: os documentos ficam em %s", LOCAL_ROOT)
            return
        if not HAS_BOTO3:                               # pragma: no cover
            logger.warning("R2 configurado mas o boto3 não está instalado.")
            return

        try:
            self._client = boto3.client(
                "s3",
                endpoint_url=r2_endpoint(),
                aws_access_key_id=R2_ACCESS_KEY_ID,
                aws_secret_access_key=R2_SECRET_ACCESS_KEY,
                # O R2 não tem regiões como a AWS, mas a assinatura exige uma;
                # "auto" é a que a Cloudflare documenta.
                region_name="auto",
                config=BotoConfig(signature_version="s3v4", retries={"max_attempts": 3}),
            )
            self.backend = "r2"
            logger.info("Documentos no R2, bucket %s", R2_BUCKET)
        except Exception as exc:                        # pragma: no cover
            logger.warning("Não foi possível ligar ao R2, fica o disco: %s", exc)
            self._client = None

    # -- disco ------------------------------------------------------------

    def _local_path(self, key: str) -> str:
        """Caminho no disco para uma chave, sem deixar sair da pasta."""
        path = os.path.normpath(os.path.join(LOCAL_ROOT, key))
        if not path.startswith(os.path.abspath(LOCAL_ROOT) + os.sep) and path != LOCAL_ROOT:
            raise ValueError("chave inválida")
        return path

    def _legacy_local_path(self, file_name: str) -> str:
        """Onde os ficheiros ficavam antes das chaves por empresa.

        Os documentos carregados antes desta mudança estão em ``uploads/`` com
        o nome original. Continuam a poder ser lidos; os novos já nascem com a
        chave nova.
        """
        return os.path.join(LOCAL_ROOT, os.path.basename(file_name or ""))

    # -- a interface ------------------------------------------------------

    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        """Grava e devolve a chave. Escreve sempre em disco, também no R2.

        A cópia local não é redundância por desconfiança: é o que faz a
        pré-visualização e os testes funcionarem sem ida à rede a cada pedido.
        """
        try:
            path = self._local_path(key)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "wb") as handle:
                handle.write(data)
        except Exception as exc:
            logger.warning("não foi possível gravar em disco: %s", exc)

        if self._client:
            try:
                self._client.put_object(
                    Bucket=R2_BUCKET, Key=key, Body=data, ContentType=content_type,
                )
            except (BotoCoreError, ClientError) as exc:
                # O documento não se perde — está em disco — mas quem opera
                # tem de saber que a cópia remota não foi feita.
                logger.error("R2 recusou %s: %s", key, exc)
        return key

    def get(self, key: str, legacy_name: str = "") -> Optional[bytes]:
        """O conteúdo, do disco ou do R2. ``None`` quando não existe."""
        try:
            path = self._local_path(key)
            if os.path.exists(path):
                with open(path, "rb") as handle:
                    return handle.read()
        except ValueError:
            return None

        if self._client:
            try:
                response = self._client.get_object(Bucket=R2_BUCKET, Key=key)
                data = response["Body"].read()
                # Traz para disco: o próximo pedido não repete a viagem.
                try:
                    path = self._local_path(key)
                    os.makedirs(os.path.dirname(path), exist_ok=True)
                    with open(path, "wb") as handle:
                        handle.write(data)
                except Exception:                       # pragma: no cover
                    pass
                return data
            except ClientError as exc:
                if exc.response.get("Error", {}).get("Code") not in ("NoSuchKey", "404"):
                    logger.error("R2 falhou a ler %s: %s", key, exc)
            except BotoCoreError as exc:                # pragma: no cover
                logger.error("R2 falhou a ler %s: %s", key, exc)

        # Documentos anteriores às chaves por empresa.
        if legacy_name:
            legacy = self._legacy_local_path(legacy_name)
            if os.path.exists(legacy):
                return open(legacy, "rb").read()
        return None

    def delete(self, key: str) -> None:
        try:
            path = self._local_path(key)
            if os.path.exists(path):
                os.remove(path)
        except Exception as exc:                        # pragma: no cover
            logger.warning("não foi possível apagar %s do disco: %s", key, exc)

        if self._client:
            try:
                self._client.delete_object(Bucket=R2_BUCKET, Key=key)
            except (BotoCoreError, ClientError) as exc:  # pragma: no cover
                logger.error("R2 recusou apagar %s: %s", key, exc)

    def status(self) -> dict:
        """Para quem instala saber onde é que os documentos estão a ficar."""
        return {
            "destino": self.backend,
            "bucket": R2_BUCKET if self.backend == "r2" else None,
            "jurisdicao": R2_JURISDICTION or ("default" if self.backend == "r2" else None),
            "pasta_local": LOCAL_ROOT,
            "em_falta": [] if self.backend == "r2" else [
                "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY para "
                "guardar os documentos no Cloudflare R2"
            ],
        }


document_storage = DocumentStorage()
