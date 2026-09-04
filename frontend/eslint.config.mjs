import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    /**
     * Duas regras do **compilador do React**, que este projeto não tem ligado
     * (não há `reactCompiler` no next.config.ts). Reportam o que aconteceria
     * se estivesse — informação útil, mas não defeitos no código que corre.
     * Ficam como avisos: continuam visíveis sem parar a CI por uma
     * hipótese. Tudo o resto — código morto, `any`, impurezas, estado
     * derivado escrito em efeitos — foi corrigido e continua a ser erro.
     */
    rules: {
      /**
       * `preserve-manual-memoization`: o `useMemo` que constrói o saldo
       * acumulado do fluxo de caixa fá-lo por mutação, e o compilador não
       * consegue provar que a memoização se mantém. Sem compilador ligado
       * não se perde nada — e o memo é correcto e necessário, porque isto
       * corre sobre centenas de lançamentos a cada render.
       */
      'react-hooks/preserve-manual-memoization': 'warn',

      /**
       * Carregar dados num efeito.
       *
       * A regra está certa em geral, e errada para o padrão que este projeto
       * usa de propósito em 23 componentes:
       *
       *     const load = useCallback(async () => { setLoading(true); … }, [x]);
       *     useEffect(() => { load(); }, [load]);
       *
       * Dispara porque o `setLoading(true)` acontece antes do primeiro
       * `await`. Não é um defeito: é o que a documentação do React descreve
       * para ir buscar dados sem uma biblioteca. O que a removeria de vez é
       * mover as leituras para uma camada própria — o React Query, ou Server
       * Components a carregar antes de renderizar — e isso é uma decisão de
       * arquitetura, não uma limpeza de lint.
       *
       * Fica como aviso para continuar visível sem parar a CI por algo que
       * ninguém deve "corrigir" ficheiro a ficheiro.
       */
      'react-hooks/set-state-in-effect': 'warn',
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
