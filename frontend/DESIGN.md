# Finance AI — guia de interface

Interface clara, compacta e igual em todos os ecrãs. Uma página **não inventa**
botões, tabelas, cartões nem cores: usa `@/components/ui`.

## Base

- Letra: Geist (definida em `app/layout.tsx`). Fundo da aplicação `neutral-50`, conteúdo em cartões brancos.
- Uma só família de cinzentos: `neutral`. Nada de `gray`, `slate`, `zinc`.
- Acento único: `emerald` (ação de dinheiro, item ativo, foco). Cores de estado só para estado:
  `rose` = negativo/erro, `amber` = atenção, `sky` = informação.
- Tamanhos de letra: `text-2xs` (11px, legendas), `text-xs` (12px, tabelas e texto de apoio),
  `text-13` (13px, botões, campos, menu, títulos de cartão), `text-sm`/`text-lg` só em valores e títulos.
- Pesos: `font-medium` (500) e `font-semibold` (600). `font-bold`/`font-extrabold` só no título da página.
- **Sem MAIÚSCULAS** em etiquetas, cabeçalhos de tabela ou de grupo (`uppercase tracking-wider` não se usa).
  Escreve-se em minúsculas normais: "Total em aberto", não "TOTAL EM ABERTO".
- Cantos: `rounded-md` em botões/campos/itens, `rounded-lg` em blocos internos, `rounded-xl` em cartões.
  Não usar `rounded-2xl`/`rounded-3xl`.
- Espaçamento: `gap-3`/`space-y-4` entre blocos; cartões `p-4` (`CardBody`), cabeçalhos `px-4 py-3`.

## Componentes

| Precisa de… | Use |
|---|---|
| Botão | `<Button variant size>` — `md` (32px) nas barras da página, `sm` (28px) em linhas/cartões |
| Botão só com ícone | `<IconButton label>` |
| Número/KPI | `<Stat label value hint tone>` — a cor vai no valor, nunca na borda |
| Separadores / filtros de poucas opções | `<Segmented options value onChange aria-label>` |
| Tabela | `<Card className="overflow-hidden"><Table><THead><Tr><Th>…` — `Td numeric` para dinheiro |
| Bloco de conteúdo | `<Card>` + `<CardHeader title subtitle icon actions>` + `<CardBody>` |
| Campo de formulário | `<Field label>{(p) => <Input {...p} />}</Field>`, `Select`, `Textarea` |
| Estado | `<Badge tone>` |
| A carregar / vazio / erro | `LoadingState`, `EmptyState`, `ErrorState` |

Caixas de aviso (dentro de um cartão): `rounded-lg border px-3 py-2 text-xs` com
`bg-amber-50 border-amber-200 text-amber-900` (ou `emerald`/`rose`/`sky` equivalentes).
