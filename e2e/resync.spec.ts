import { expect, test } from '@playwright/test';
import {
  abrirDia,
  adicionarParada,
  atalho,
  chip,
  entrar,
  itemFeito,
  novaViagem,
  semMundoDeFora,
  voltar,
} from './helpers/app.ts';
import { linhas } from './helpers/db.ts';
import { localEnv, criarUsuarioDescartavel } from './helpers/users.ts';

/**
 * O aparelho atrasado (fase 12): ele puxou a viagem e ficou sem sinal; enquanto isso, alguém apagou
 * uma parada, e o expurgo levou a lápide de vez (o corte de agora, no lugar dos 90 dias, simula o
 * tempo passando). Um pull comum a partir do cursor dele nunca traria a exclusão: a parada ficaria
 * no aparelho para sempre. Com o horizonte, o servidor responde `resync` com o retrato inteiro, e o
 * aparelho tira a parada que o servidor não tem mais, sem perder o que fez sem sinal.
 *
 * Roda no projeto `expurgo`, depois de todos os outros: o expurgo com corte de agora alcança o banco
 * inteiro dos testes.
 */
/** O banco local pelo PostgREST, com a chave secreta (como o servidor faria). */
async function rest(path: string, body: unknown, method = 'POST'): Promise<unknown> {
  const env = localEnv();
  const secret = env.SECRET_KEY ?? env.SERVICE_ROLE_KEY ?? '';
  const res = await fetch(`${env.API_URL ?? ''}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} ${String(res.status)}: ${await res.text()}`);
  const text = await res.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

test('o aparelho atrasado recebe o resync: a parada expurgada sai, o que foi feito sem sinal sobe', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const email = await criarUsuarioDescartavel('Atrasado');
  const context = await browser.newContext({ ...test.info().project.use });
  await semMundoDeFora(context);
  const page = await context.newPage();
  await entrar(page, email);
  const nome = `Atrasado ${String(Date.now())}`;
  const tripUrl = await novaViagem(page, { nome, inicio: 30, fim: 31 });
  const tripId = tripUrl.split('/').at(-1) ?? '';

  // com rede: duas paradas e as listas abertas uma vez (os módulos do Vite de dev)
  await atalho(page, 'Listas');
  await expect(page.getByRole('heading', { name: 'Listas' })).toBeVisible();
  await voltar(page);
  await abrirDia(page);
  await adicionarParada(page, { tipo: 'Natureza', nome: 'Cascata do Caracol', horario: '10:00' });
  await adicionarParada(page, { tipo: 'Cidade', nome: 'Parada que vai sumir', horario: '15:00' });
  await expect(chip(page)).toHaveCount(0, { timeout: 15_000 });
  const [ghost] = await linhas(
    'stops',
    `trip_id=eq.${tripId}&name=eq.Parada que vai sumir&select=id`,
  );
  const ghostId = String(ghost?.id);

  await context.setOffline(true);
  // sem sinal, a pessoa marca um item da lista
  await voltar(page);
  await voltar(page);
  await atalho(page, 'Listas');
  await itemFeito(page, 'Novo item de antes de viajar', 'Calibrar os pneus');

  // enquanto isso, no servidor: a parada é apagada, e o expurgo leva a lápide de vez
  await rest(`stops?id=eq.${ghostId}`, { deleted_at: new Date().toISOString() }, 'PATCH');
  const report = (await rest('rpc/purge', {
    p_dry_run: false,
    p_trips_before: daysAgo(30),
    p_tombstones_before: new Date().toISOString(),
    p_logs_before: daysAgo(90),
    p_orphans_before: daysAgo(7),
  })) as { tombstones: Record<string, { count: number }> } | null;
  expect(report?.tombstones.stops?.count ?? 0).toBeGreaterThanOrEqual(1);
  expect(await linhas('stops', `id=eq.${ghostId}&select=id`)).toHaveLength(0);

  // o aparelho ainda mostra a parada (ele nunca viu a lápide)
  await voltar(page);
  await abrirDia(page);
  await expect(page.getByRole('group', { name: 'Parada que vai sumir' })).toBeVisible();

  // a rede volta: o push sobe o item, e o pull, com o cursor antes do horizonte, é um resync
  await context.setOffline(false);
  await expect(page.getByRole('group', { name: 'Parada que vai sumir' })).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(page.getByRole('group', { name: 'Cascata do Caracol' })).toBeVisible();
  await expect(chip(page)).toHaveCount(0, { timeout: 15_000 });
  await expect
    .poll(async () =>
      (await linhas('checklist_items', `trip_id=eq.${tripId}&select=text,done_at`)).map((i) => [
        i.text,
        i.done_at !== null,
      ]),
    )
    .toEqual([['Calibrar os pneus', true]]);
  await context.close();
});
