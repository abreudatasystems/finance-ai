import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Testes de ponta a ponta: arrancam o backend (uvicorn, base SQLite
 * descartável) e o frontend compilado (`next start`) em portas próprias, para
 * nunca tocarem na base de dados nem nos servidores de desenvolvimento.
 *
 * Variáveis opcionais:
 *   PYTHON          interpretador do backend (por omissão o venv do backend,
 *                   ou `python` se não houver venv — o caso da CI).
 *   E2E_API_PORT    porta do backend  (8765)
 *   E2E_WEB_PORT    porta do frontend (3100)
 *   E2E_SKIP_BUILD  "1" para reutilizar um `next build` feito com o
 *                   NEXT_PUBLIC_API_URL deste ficheiro (ver e2e/serve-frontend.mjs).
 */

const API_PORT = Number(process.env.E2E_API_PORT || 8765);
const WEB_PORT = Number(process.env.E2E_WEB_PORT || 3100);
const API_URL = `http://127.0.0.1:${API_PORT}/api/v1`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

const backendDir = path.resolve(__dirname, '..', 'backend');

function defaultPython(): string {
  const candidates =
    process.platform === 'win32'
      ? [path.join(backendDir, 'venv', 'Scripts', 'python.exe')]
      : [path.join(backendDir, 'venv', 'bin', 'python'), path.join(backendDir, '.venv', 'bin', 'python')];
  return candidates.find((p) => fs.existsSync(p)) ?? 'python';
}
const python = process.env.PYTHON || defaultPython();

// Uma base nova a cada execução (o ficheiro de configuração também é avaliado
// pelos workers, por isso o caminho fica fixo numa variável de ambiente).
process.env.E2E_DB_PATH ||= path.join(os.tmpdir(), `finance-ai-e2e-${Date.now()}.db`);
const dbUrl = `sqlite:///${process.env.E2E_DB_PATH.replace(/\\/g, '/')}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'backend',
      command: `"${python}" -m uvicorn app.main:app --host 127.0.0.1 --port ${API_PORT}`,
      cwd: backendDir,
      url: `http://127.0.0.1:${API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        DATABASE_URL: dbUrl,
        SECRET_KEY: 'e2e-secret-key-not-used-anywhere-else-0123456789',
        SCHEDULER_ENABLED: '0',
        ENVIRONMENT: 'development',
        BACKEND_CORS_ORIGINS: `${WEB_URL},http://localhost:${WEB_PORT}`,
        APP_BASE_URL: WEB_URL,
        ANTHROPIC_API_KEY: '',
        SMTP_HOST: '',
        PYTHONUTF8: '1',
      },
    },
    {
      name: 'frontend',
      command: `node e2e/serve-frontend.mjs`,
      cwd: __dirname,
      url: `${WEB_URL}/login`,
      reuseExistingServer: false,
      // Inclui o `next build`.
      timeout: 600_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NEXT_PUBLIC_API_URL: API_URL,
        E2E_WEB_PORT: String(WEB_PORT),
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
});
