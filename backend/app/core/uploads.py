"""What may be uploaded.

A document store that accepts anything is a file-hosting service with extra
steps. Three checks, in order of how much they can be trusted:

1. **size** — a hard ceiling, because a 2 GB "invoice" is never one;
2. **magic bytes** — what the file actually is, which the sender cannot lie
   about by renaming it;
3. **extension and declared type** — the weakest signal, used only to give a
   clearer message when the first two already agree.
"""

from __future__ import annotations

from typing import Optional

#: 20 MB. A scanned invoice is a fraction of this; anything larger is a mistake
#: or an attempt.
MAX_BYTES = 20 * 1024 * 1024

#: Signature -> what it is. Kept to the formats an invoice actually arrives in.
SIGNATURES: tuple[tuple[bytes, str], ...] = (
    (b"%PDF-", "application/pdf"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
)

#: Plain text is accepted too — it has no signature, so it is recognised by
#: being decodable and by its extension.
TEXT_EXTENSIONS = (".txt", ".csv")


class UploadRejected(ValueError):
    """Raised with a message meant to be shown to whoever uploaded."""


def _looks_like_text(content: bytes) -> bool:
    try:
        content[:4096].decode("utf-8")
        return True
    except UnicodeDecodeError:
        return False


def detect_type(content: bytes, filename: str = "") -> Optional[str]:
    """What the bytes actually are, ignoring what the name claims."""
    for signature, media_type in SIGNATURES:
        if content.startswith(signature):
            return media_type
    if content[8:12] == b"WEBP":
        return "image/webp"
    lowered = (filename or "").lower()
    if lowered.endswith(TEXT_EXTENSIONS) and _looks_like_text(content):
        return "text/plain"
    return None


def validate(content: bytes, filename: str = "") -> str:
    """Return the detected media type, or explain why the file is refused."""
    if not content:
        raise UploadRejected("Ficheiro vazio.")

    if len(content) > MAX_BYTES:
        size_mb = len(content) / (1024 * 1024)
        raise UploadRejected(
            f"O ficheiro tem {size_mb:.1f} MB e o limite é {MAX_BYTES // (1024 * 1024)} MB."
        )

    detected = detect_type(content, filename)
    if not detected:
        raise UploadRejected(
            "Formato não suportado. Envie a fatura em PDF, imagem (PNG, JPG, WEBP) "
            "ou texto."
        )
    return detected
