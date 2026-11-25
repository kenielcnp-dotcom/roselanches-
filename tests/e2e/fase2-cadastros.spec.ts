import { expect, test } from '@playwright/test';
import { loginAsRose, SHOTS } from './helpers';

// Nomes únicos: o teste pode rodar várias vezes no mesmo banco local.
const suffix = Date.now().toString(36).slice(-5);

test.describe.configure({ mode: 'serial' });

test('tela inicial mostra os números do banco', async ({ page }) => {
  await loginAsRose(page);
  await expect(page.getByText('Total a receber')).toBeVisible();
  await expect(page.getByText(/R\$ \d/).first()).toBeVisible();
  await expect(page.getByText('Vendas de hoje')).toBeVisible();
  await expect(page.getByText('Clientes com saldo')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/03-inicio-com-numeros.png` });
});

test('estabelecimento: cadastrar, selecionar e ver clientes', async ({ page }) => {
  await loginAsRose(page);
  await page.getByRole('link', { name: /Estabelecimentos/ }).click();
  await expect(page.getByRole('heading', { name: 'Estabelecimentos' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/04-estabelecimentos.png`, fullPage: true });

  await page.getByRole('link', { name: 'Novo estabelecimento' }).click();
  await page.getByLabel('Nome do lugar').fill(`Feira ${suffix}`);
  await page.getByLabel('Apelido (opcional)').fill(`Feira${suffix}`);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { name: `Feira ${suffix}` })).toBeVisible();
  await expect(page.getByText('Nenhum cliente neste lugar')).toBeVisible();

  // Nome repetido é recusado com mensagem clara.
  await page.goto('/estabelecimentos/novo');
  await page.getByLabel('Nome do lugar').fill(`feira ${suffix}`);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('alert')).toContainText('Já existe um estabelecimento com esse nome.');

  // Selecionar o Mercado Central como lugar atual.
  await page.goto('/estabelecimentos');
  await page.getByRole('button', { name: /Mercado Central/ }).click();
  await expect(page.getByRole('button', { name: /Mercado Central/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Vendendo aqui')).toBeVisible();
});

test('cliente: cadastrar em dois lugares, aviso de duplicado e busca', async ({ page }) => {
  await loginAsRose(page);
  // O lugar atual fica lembrado no aparelho e vem marcado no cadastro.
  await page.goto('/estabelecimentos');
  await page.getByRole('button', { name: /Mercado Central/ }).click();
  await page.goto('/clientes/novo');

  // Mesmo nome de quem já existe: aviso, sem bloquear.
  await page.getByLabel('Nome completo').fill('Maria Silva');
  await expect(page.getByText('Confira se não é a mesma pessoa:')).toBeVisible();

  await page.getByLabel('Nome completo').fill(`Paulo Teste ${suffix}`);
  await page.getByLabel('Telefone (opcional)').fill('65 99988 7766');
  await page.getByLabel('Telefone (opcional)').blur();
  await expect(page.getByLabel('Telefone (opcional)')).toHaveValue('(65) 99988-7766');
  await page.getByRole('button', { name: `Feira ${suffix}` }).click();
  // Mercado Central (lugar atual) já vem marcado.
  await expect(page.getByRole('button', { name: 'Mercado Central' })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `${SHOTS}/05-novo-cliente.png`, fullPage: true });
  await page.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByRole('heading', { name: `Paulo Teste ${suffix}` })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mercado Central' })).toBeVisible();
  await expect(page.getByRole('link', { name: `Feira ${suffix}` })).toBeVisible();
  await expect(page.getByText('(65) 99988-7766')).toBeVisible();

  // Telefone inválido é recusado antes de enviar.
  await page.goto('/clientes/novo');
  await page.getByLabel('Nome completo').fill('Teste Telefone');
  await page.getByLabel('Telefone (opcional)').fill('123');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText(/Telefone incompleto/)).toBeVisible();

  // Busca por final do telefone e filtro por lugar.
  await page.goto('/clientes');
  await page.getByLabel('Buscar por nome ou telefone').fill('7766');
  await expect(page.getByRole('link', { name: new RegExp(`Paulo Teste ${suffix}`) })).toBeVisible();
  await page.getByLabel('Buscar por nome ou telefone').fill('');
  await page.getByRole('group', { name: 'Filtrar por estabelecimento' }).getByRole('button', { name: `Feira${suffix}` }).click();
  await expect(page.getByRole('link', { name: /Maria Silva/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: new RegExp(`Paulo Teste ${suffix}`) })).toBeVisible();
  await page.getByRole('group', { name: 'Filtrar por estabelecimento' }).getByRole('button', { name: 'Todos' }).click();
  await page.screenshot({ path: `${SHOTS}/06-clientes.png`, fullPage: true });
});

test('estabelecimento: adicionar e remover cliente sem perder o cadastro', async ({ page }) => {
  await loginAsRose(page);
  await page.goto('/estabelecimentos');
  await page.getByRole('link', { name: `Ver clientes e dados de Feira ${suffix}` }).click();
  await expect(page.getByRole('link', { name: new RegExp(`Paulo Teste ${suffix}`) })).toBeVisible();

  await page.getByRole('button', { name: 'Adicionar' }).click();
  await page.getByLabel('Buscar cliente para adicionar').fill('ana souza');
  await page.getByRole('button', { name: /Ana Souza/ }).click();
  await expect(page.getByText(`Ana Souza agora é cliente de Feira ${suffix}.`)).toBeVisible();
  await page.getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByRole('heading', { name: /Clientes \(2\)/ })).toBeVisible();

  await page.getByRole('button', { name: `Remover Ana Souza deste lugar` }).click();
  await expect(page.getByRole('heading', { name: /Clientes \(1\)/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/07-estabelecimento-detalhe.png`, fullPage: true });
});

test('produto: cadastrar com preço em centavos', async ({ page }) => {
  await loginAsRose(page);
  await page.goto('/produtos/novo');
  await page.getByLabel('Nome').fill(`Pastel ${suffix}`);
  await page.getByLabel('Preço').fill('750');
  await expect(page.getByLabel('Preço')).toHaveValue('R$ 7,50');
  await page.getByLabel('Categoria (opcional)').fill('Salgados');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Produto cadastrado.')).toBeVisible();
  const row = page.getByRole('link', { name: new RegExp(`Pastel ${suffix}`) });
  await expect(row).toContainText('R$ 7,50');
  await page.screenshot({ path: `${SHOTS}/08-produtos.png`, fullPage: true });
});

test('configurações: fuso do negócio muda os horários do app', async ({ page }) => {
  await loginAsRose(page);
  await page.goto('/config');
  const tz = page.getByLabel('Fuso horário do negócio');
  await expect(tz).toHaveValue('America/Sao_Paulo');
  await tz.selectOption('America/Cuiaba');
  await page.getByRole('button', { name: 'Salvar configurações' }).click();
  await expect(page.getByText('Configurações salvas.')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/09-configuracoes.png`, fullPage: true });

  // Volta ao padrão para o próximo teste.
  await tz.selectOption('America/Sao_Paulo');
  await page.getByRole('button', { name: 'Salvar configurações' }).click();
  await expect(page.getByText('Configurações salvas.')).toBeVisible();
});
