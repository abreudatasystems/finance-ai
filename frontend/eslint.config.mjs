import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    /**
     * Duas regras do **compilador do React** que este projeto faz cumprir como
     * erro, para que os padrões que elas apanham não voltem.
     */
    rules: {
      /**
       * `preserve-manual-memoization`: um `useMemo`/`useCallback` cujas
       * dependências o compilador não consegue provar estáveis (p. ex. porque
       * o valor é construído por mutação, ou depende de um array recriado a
       * cada render). O saldo acumulado do fluxo de caixa era assim; foi
       * reescrito sem mutação e com a lista filtrada também memoizada.
       */
      'react-hooks/preserve-manual-memoization': 'error',

      /**
       * `set-state-in-effect`: escrever estado de forma síncrona no corpo de
       * um efeito (directamente ou por uma função chamada dele, como o antigo
       *
       *     const load = useCallback(async () => { setLoading(true); … }, [x]);
       *     useEffect(() => { load(); }, [load]);
       *
       * que existia em ~20 componentes). Causa renders em cascata.
       *
       * Hoje há sítios próprios para cada caso:
       *  • ler dados da API → `useLoad` (src/lib/use-load.ts): o efeito só
       *    arranca o pedido e o estado só muda quando a resposta chega;
       *    `loading`, respostas antigas e `reload()` ficam tratados ali;
       *  • estado de formulário que parte dos dados lidos → pô-lo no
       *    `onSuccess` do `useLoad`;
       *  • estado que muda quando uma prop/URL muda → ajustá-lo durante o
       *    render (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
       *    ou remontar o componente com uma `key`.
       */
      'react-hooks/set-state-in-effect': 'error',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
