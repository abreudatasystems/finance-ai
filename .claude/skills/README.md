# Skills do projecto

Instruções que o Claude Code carrega quando o trabalho em curso corresponde à
descrição de uma delas. Ficam versionadas com o repositório de propósito: uma
skill só é útil se estiver onde o trabalho acontece, e um contentor efémero
perde tudo o que estiver fora do `git`.

## Origem e licença

| Conjunto | Skills | Origem | Licença |
|---|---|---|---|
| Engenharia | 25, de `api-and-interface-design` a `using-agent-skills` | github.com/addyosmani/agent-skills | MIT |
| `impeccable` | 1 | github.com/pbakaus/impeccable | Apache 2.0 |
| `design-taste-frontend` | 1 | github.com/Leonxlnx/taste-skill | MIT |
| `emil-design-eng` | 1 | filosofia de design engineering de Emil Kowalski | — |

## Sobreposições a ter em conta

Quatro delas cobrem o mesmo terreno — interface — com vozes diferentes:
`impeccable` (direcção de arte, bans explícitos), `design-taste-frontend`
(anti-slop com três mostradores reguláveis), `emil-design-eng` (animação e
micro-detalhe) e `frontend-ui-engineering` (arquitectura de componentes e
acessibilidade). Convém nomear qual se quer — `/impeccable`, `/emil-design-eng`
— em vez de esperar que a escolha se faça sozinha.

`code-review-and-quality` e `code-simplification` sobrepõem-se aos comandos
`/code-review` e `/simplify` que já vêm com o Claude Code. Os embutidos correm
uma revisão; estas são a doutrina que a orienta.

## Acrescentar outra

Uma pasta com um `SKILL.md` cujo *frontmatter* traga `name` (igual ao nome da
pasta) e `description` — é a descrição que decide quando a skill é carregada,
por isso vale mais dizer *quando usar* do que *o que é*.
