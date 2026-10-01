# Frontend — Finance AI

## Stack Tecnológico
- **Framework**: Next.js 15 (App Router)
- **Linguagem**: TypeScript
- **Estilos**: Tailwind CSS v4 + Vanilla CSS tokens
- **Componentes & UI**: Lucide Icons, Recharts, Radix UI primitives
- **Estado Global**: AppContext (`src/context/AppContext.tsx`)
- **Comunicação API**: `src/services/api.ts` e `src/services/data.ts`

## Convenções de Estrutura
- `src/app/(dashboard)/`: Rotas autenticadas da aplicação (Dashboard, Tesouraria, Documentos, Relatórios, etc.)
- `src/components/`: Componentes modulares organizados por domínio (`layout/`, `performance/`, `dashboard/`, etc.)
- `src/context/`: Contextos React (AppContext para empresa ativa, filtros globais, estado da UI)
- `src/types/`: Definições de tipos TypeScript compartilhados

## Diretrizes
1. Multi-empresa: Todas as chamadas de dados devem utilizar o contexto da empresa selecionada (`companyId`).
2. Validação monetária: Apresentar valores sempre formatados com precisão e símbolo de moeda (€ por padrão).
3. Responsividade: Garantir suporte completo desktop e mobile com menu retrátil.
