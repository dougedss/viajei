import { expect, test, type Page } from '@playwright/test';
import { novaViagem } from './helpers/app.ts';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { makePng } from './helpers/images.ts';
import { criarUsuarioDescartavel, SENHA } from './helpers/users.ts';

/**
 * Compartilhar → Viajei (fase 18): o `share_target` do manifest é um POST `multipart/form-data` em
 * `/compartilhado`, que só o service worker vê (por isso o projeto `pwa`, contra o build). O navegador
 * não compartilha sozinho, mas o POST que o Android faria se prova com um formulário: o service
 * worker guarda o conteúdo e redireciona; com uma viagem só em andamento ou futura, a tela cai direto
 * em "Ler a confirmação" com o texto e o arquivo no lugar. O manifest gerado leva o bloco.
 */
async function entrar(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
}

const SHARE_FORM = `(async ([text, title, pngBase64]) => {
  const bytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0));
  const file = new File([bytes], 'voucher.png', { type: 'image/png' });
  const form = document.createElement('form');
  form.method = 'POST';
  form.enctype = 'multipart/form-data';
  form.action = '/compartilhado';
  const add = (name, value) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  };
  add('title', title);
  add('text', text);
  const files = document.createElement('input');
  files.type = 'file';
  files.name = 'files';
  const dt = new DataTransfer();
  dt.items.add(file);
  files.files = dt.files;
  form.appendChild(files);
  document.body.appendChild(form);
  form.submit();
})`;

test('o POST do share_target chega ao service worker e cai em "Ler a confirmação" com o texto e o arquivo', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = await criarUsuarioDescartavel('Compartilhar');
  await entrar(page, email);
  await novaViagem(page, {
    nome: `Compartilhado ${Date.now()}`,
    inicio: dateInSaoPaulo(30),
    fim: dateInSaoPaulo(31),
  });
  const tripUrl = page.url().replace(/\/detalhes$/, '');

  // o service worker assume a página (precache completo)
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)');
  await page.reload();
  await expect.poll(() => page.evaluate('navigator.serviceWorker.controller !== null')).toBe(true);

  // o que o Gmail mandaria: o assunto, o texto e o print
  await page.evaluate(SHARE_FORM, [
    'Reserva confirmada: Pousada Compartilhada, código SHR-1',
    'Fwd: Sua reserva',
    makePng(600, 400).toString('base64'),
  ]);
  // uma viagem futura só: a tela vai direto para a leitura dela, com o compartilhado
  await page.waitForURL(/\/reservas\/ler\?share=/, { timeout: 30_000 });
  expect(page.url()).toContain(`${tripUrl}/reservas/ler?share=`);
  await expect(page.getByRole('heading', { name: 'Ler a confirmação' })).toBeVisible();
  await expect(page.getByLabel('O texto da confirmação')).toHaveValue(
    'Fwd: Sua reserva\n\nReserva confirmada: Pousada Compartilhada, código SHR-1',
  );
  await expect(page.getByRole('list', { name: 'Anexo a ler' })).toContainText('voucher.jpg', {
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: 'Ler a confirmação' })).toBeEnabled();
});

test('o manifest publicado tem o share_target do Android, e um compartilhado vazio diz isso', async ({
  page,
}) => {
  const manifest = (await (await page.request.get('/manifest.webmanifest')).json()) as {
    share_target?: Record<string, unknown>;
  };
  expect(manifest.share_target).toEqual({
    action: '/compartilhado',
    method: 'POST',
    enctype: 'multipart/form-data',
    params: {
      title: 'title',
      text: 'text',
      url: 'url',
      files: [{ name: 'files', accept: ['image/*', 'application/pdf'] }],
    },
  });
  const email = await criarUsuarioDescartavel('Vazio');
  await entrar(page, email);
  await page.goto('/compartilhado?vazio=1');
  await expect(page.getByRole('heading', { name: 'Nada para ler' })).toBeVisible();
});
