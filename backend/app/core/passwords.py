"""Password rules.

Deliberately short. Long lists of composition rules ("one uppercase, one
symbol") push people towards Password1! and away from anything memorable;
length and a refusal of the obvious guesses do more. This checks:

* at least 10 characters — the single most useful rule;
* not one of the passwords attackers try first;
* not the person's own email or name, which is the first thing guessed after
  those.
"""

from __future__ import annotations

from typing import Optional

MIN_LENGTH = 10

#: Not a dictionary — just the shapes that show up at the top of every
#: breach list, including the Portuguese ones.
COMMON = {
    "password", "passw0rd", "password1", "123456", "1234567", "12345678",
    "123456789", "1234567890", "qwerty", "qwertyui", "abc123", "iloveyou",
    "admin", "administrador", "welcome", "letmein", "monkey", "dragon",
    "sunshine", "princess", "football", "benfica", "sporting", "portugal",
    "porto", "lisboa", "segredo", "palavrapasse", "passe123", "123qwe",
    "financeai", "finance123",
}


class PasswordError(ValueError):
    """Raised with a message meant to be shown to whoever is choosing."""


def validate(password: str, *, email: Optional[str] = None,
             name: Optional[str] = None) -> None:
    """Raise PasswordError with a usable explanation, or return quietly."""
    password = password or ""

    if len(password) < MIN_LENGTH:
        raise PasswordError(
            f"A palavra-passe tem de ter pelo menos {MIN_LENGTH} caracteres. "
            "Uma frase curta é mais segura e mais fácil de lembrar do que "
            "letras soltas com símbolos."
        )

    lowered = password.lower()
    # Comparing only for equality would let "password123" through, and
    # appending digits to a common word is the most predictable habit there
    # is — so the trailing digits and punctuation come off before comparing.
    stripped = lowered.rstrip("0123456789!@#$%&*.-_")
    if lowered in COMMON or (stripped and stripped in COMMON):
        raise PasswordError(
            "Essa palavra-passe está entre as mais usadas do mundo — acrescentar "
            "números ao fim não muda isso. Escolha outra."
        )

    if password == password[0] * len(password):
        raise PasswordError("A palavra-passe não pode ser o mesmo carácter repetido.")

    if email:
        # Only when the local part is long enough to mean something: an "ana@"
        # or "jp@" prefix appears inside half the sensible passphrases, and
        # rejecting "a chave da porta" because the address starts with "a"
        # teaches people that the rules are arbitrary.
        local = email.split("@")[0].lower()
        if len(local) >= 4 and local in lowered:
            raise PasswordError("A palavra-passe não pode conter o seu email.")

    if name:
        cleaned = "".join(ch for ch in name.lower() if ch.isalnum())
        if len(cleaned) >= 4 and cleaned in "".join(ch for ch in lowered if ch.isalnum()):
            raise PasswordError("A palavra-passe não pode ser o seu nome.")
