"""Outgoing email.

Off by default. Without ``SMTP_HOST`` nothing is sent and every caller is told
so plainly — which is what keeps the invitation flow working on a machine with
no mail server: the API hands back the link to copy instead of pretending an
email went out.

The transport is a single function so tests can replace it, and so swapping
SMTP for a provider API later touches one place.
"""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


class MailResult:
    """What happened, in terms the caller can pass to the user."""

    def __init__(self, sent: bool, reason: str = "", detail: Optional[str] = None):
        self.sent = sent
        self.reason = reason          # machine-readable: sent | not_configured | failed
        self.detail = detail          # human-readable, safe to show

    def as_dict(self) -> dict:
        return {"enviado": self.sent, "motivo": self.reason, "detalhe": self.detail}


def is_configured() -> bool:
    return bool(getattr(settings, "SMTP_HOST", ""))


def _transport(message: EmailMessage) -> None:
    """The only place that touches the network. Replaced wholesale in tests."""
    host = settings.SMTP_HOST
    port = int(settings.SMTP_PORT or 587)
    timeout = 20

    if settings.SMTP_SSL:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, timeout=timeout, context=context) as server:
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(message)
        return

    with smtplib.SMTP(host, port, timeout=timeout) as server:
        if settings.SMTP_STARTTLS:
            server.starttls(context=ssl.create_default_context())
        if settings.SMTP_USER:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(message)


def send(to: str, subject: str, body: str, html: Optional[str] = None) -> MailResult:
    """Send one message, never raising: a failed email must not fail the request.

    An invitation whose email bounces is still a valid invitation — the link
    works either way, so the caller decides what to tell the user rather than
    losing the whole operation to an SMTP timeout.
    """
    if not is_configured():
        return MailResult(
            False, "not_configured",
            "O envio de email não está configurado — use o link do convite.",
        )

    message = EmailMessage()
    message["From"] = settings.SMTP_FROM or settings.SMTP_USER or "no-reply@finance-ai.local"
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    if html:
        message.add_alternative(html, subtype="html")

    try:
        _transport(message)
        return MailResult(True, "sent")
    except Exception as exc:                      # noqa: BLE001 — deliberately broad
        logger.warning("Falha ao enviar email para %s: %s", to, exc)
        return MailResult(
            False, "failed",
            "Não foi possível enviar o email — use o link do convite.",
        )


# --------------------------------------------------------------------------
# Messages
# --------------------------------------------------------------------------

def invitation_message(company_name: str, role_label: str, inviter: Optional[str],
                       link: str, note: Optional[str] = None) -> tuple[str, str, str]:
    """Subject, plain text and HTML for an invitation. Portuguese, like the app."""
    subject = f"Convite para {company_name} — Finance AI"
    who = f"{inviter} convidou-o" if inviter else "Foi convidado"

    lines = [
        f"{who} para fazer parte de {company_name} no Finance AI, como {role_label}.",
        "",
    ]
    if note:
        lines += [f"Mensagem de quem convidou: “{note}”", ""]
    lines += [
        "Para aceitar, abra este link:",
        link,
        "",
        "O convite é pessoal e expira dentro de 14 dias.",
        "Se não estava à espera deste convite, ignore este email.",
    ]
    text = "\n".join(lines)

    html = f"""\
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#0f172a">
  <p>{who} para fazer parte de <strong>{company_name}</strong> no Finance AI,
     como <strong>{role_label}</strong>.</p>
  {f'<p style="color:#475569"><em>“{note}”</em></p>' if note else ''}
  <p><a href="{link}"
        style="display:inline-block;padding:10px 16px;border-radius:10px;
               background:#4f46e5;color:#fff;text-decoration:none;font-weight:700">
     Aceitar convite</a></p>
  <p style="color:#64748b;font-size:12px">
    O convite é pessoal e expira dentro de 14 dias.<br>
    Se não estava à espera deste convite, ignore este email.
  </p>
</div>"""
    return subject, text, html
