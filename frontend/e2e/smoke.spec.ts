import { test, expect, type Page } from '@playwright/test';

/**
 * Percurso mínimo de um utilizador novo, contra o backend real:
 * criar conta → painel → páginas principais → criar fornecedor →
 * terminar sessão → entrar outra vez.
 */

const stamp = Date.now();
const user = {
  name: 'Teste E2E',
  company: `Empresa E2E ${stamp}`,
  email: `e2e-${stamp}@example.com`,
  password: 'palavra-passe-e2e-segura',
};

/** Erros de página e da consola; um ecrã que rebenta tem de falhar o teste. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    // Nas páginas públicas (login/registo) o contexto da app ainda pergunta
    // quem é o utilizador e a API responde 401 — é o esperado sem sessão, e
    // o navegador regista-o na consola por conta própria.
    const here = new URL(page.url()).pathname;
    const onPublicPage = /^\/(login|register|invite|forgot-password|reset-password)(\/|$)/.test(here);
    if (onPublicPage && /status of 401/.test(msg.text())) return;
    errors.push(`console: ${msg.text()} @ ${msg.location().url} (page ${here})`);
  });
  return errors;
}

const pageTitle = (page: Page) => page.locator('header h1');

test.describe.configure({ mode: 'serial' });

test('novo utilizador: registo, navegação, fornecedor, sair e entrar', async ({ page }) => {
  const errors = watchErrors(page);

  await test.step('criar conta em /register', async () => {
    await page.goto('/register');
    await page.getByLabel(/o seu nome/i).fill(user.name);
    await page.getByLabel(/nome da empresa/i).fill(user.company);
    await page.getByLabel(/email/i).fill(user.email);
    await page.getByLabel(/palavra-passe/i).fill(user.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL('**/dashboard');
    await expect(pageTitle(page)).toHaveText('Painel');
  });

  const pages: { link: string; url: RegExp; title: string }[] = [
    { link: 'Fluxo de Caixa', url: /\/financial\/cash-flow$/, title: 'Fluxo de Caixa' },
    { link: 'Contas a Pagar', url: /\/financial\/payables$/, title: 'Contas a Pagar' },
    { link: 'Fornecedores', url: /\/registry\/suppliers$/, title: 'Fornecedores' },
    { link: 'Clientes', url: /\/registry\/customers$/, title: 'Clientes' },
    { link: 'Relatórios', url: /\/reports$/, title: 'Relatórios' },
    { link: 'Configurações', url: /\/settings$/, title: 'Configurações' },
  ];

  for (const p of pages) {
    await test.step(`abrir ${p.link} pelo menu lateral`, async () => {
      await page.locator('aside').getByRole('link', { name: p.link, exact: true }).click();
      await expect(page).toHaveURL(p.url);
      await expect(pageTitle(page)).toHaveText(p.title);
      // Deixa os pedidos da página terminarem antes de passar à seguinte.
      await page.waitForLoadState('networkidle');
    });
  }

  await test.step('criar um fornecedor pelo painel "Novo fornecedor"', async () => {
    const supplier = `Fornecedor E2E ${stamp}`;
    await page.locator('aside').getByRole('link', { name: 'Fornecedores', exact: true }).click();
    await expect(pageTitle(page)).toHaveText('Fornecedores');
    await expect(page.getByText('Ainda não há fornecedores')).toBeVisible();

    await page.getByRole('button', { name: 'Novo fornecedor' }).click();
    await page.getByLabel('Nome do Fornecedor').fill(supplier);
    await page.getByLabel('NIF / NIPC').fill('500000000');
    await page.getByRole('button', { name: 'Guardar Fornecedor' }).click();

    await expect(page.getByRole('link', { name: `Abrir ficha de ${supplier}` })).toBeVisible();
    await expect(page.getByText('Ainda não há fornecedores')).toHaveCount(0);
  });

  await test.step('terminar sessão', async () => {
    await page.locator('aside').getByRole('link', { name: 'Configurações', exact: true }).click();
    await expect(pageTitle(page)).toHaveText('Configurações');
    await page.getByRole('button', { name: 'Perfil' }).click();
    await page.getByRole('button', { name: /terminar sess/i }).click();
    await page.waitForURL('**/login');
    const token = await page.evaluate(() => localStorage.getItem('finance_ai_token'));
    expect(token).toBeNull();
  });

  await test.step('entrar outra vez', async () => {
    await page.getByLabel(/email/i).fill(user.email);
    await page.getByLabel(/palavra-passe/i).fill(user.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL('**/dashboard');
    await expect(pageTitle(page)).toHaveText('Painel');
  });

  expect(errors, errors.join('\n')).toEqual([]);
});

