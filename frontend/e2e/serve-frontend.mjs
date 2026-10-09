// Compila o frontend com o NEXT_PUBLIC_API_URL dos testes e serve-o com
// `next start`. O URL da API fica gravado no código do navegador durante o
// build, por isso um build feito para outro backend não serve aqui.
// E2E_SKIP_BUILD=1 salta a compilação (quando já foi feita com o mesmo URL).
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');
const port = process.env.E2E_WEB_PORT || '3100';

if (process.env.E2E_SKIP_BUILD !== '1') {
  console.log(`[e2e] next build (NEXT_PUBLIC_API_URL=${process.env.NEXT_PUBLIC_API_URL})`);
  const build = spawnSync(process.execPath, [nextBin, 'build'], { stdio: 'inherit', env: process.env });
  if (build.status !== 0) {
    console.error('[e2e] next build falhou');
    process.exit(build.status ?? 1);
  }
}

const server = spawn(process.execPath, [nextBin, 'start', '-p', port, '-H', '127.0.0.1'], {
  stdio: 'inherit',
  env: process.env,
});
const stop = () => server.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', stop);
server.on('exit', (code) => process.exit(code ?? 0));
