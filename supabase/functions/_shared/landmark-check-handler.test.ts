import { describe, expect, it, vi } from 'vitest';
import { handleLandmarkCheck, type CheckDeps, type CheckTarget } from './landmark-check-handler.ts';
import { aiMessage, fakeFetch, IMAGE_INFO, json, png, RECIPE } from './landmark-fixtures.ts';

/**
 * A conferência pelo aparelho (fase 23): a função recebe as capturas, baixa as mesmas fotos do
 * registro, pede o veredito e grava. `ok` publica, `adjust` troca a receita (uma rodada), `rejected`
 * rejeita; a versão errada é `stale`; a cota; nada das capturas no log.
 */
const TARGET: CheckTarget = {
  id: '11111111-1111-4111-8111-111111111111',
  key: 'wikidata:Q94923',
  name: 'Jardim Botânico de Curitiba',
  version: 1,
  round: 0,
  recipe: RECIPE,
  modeled: { name: 'Estufa' },
  sources: {
    photos: [
      { title: 'File:Jardim Botanico Centro Curitiba.jpg' },
      { title: 'File:Estufa lateral.jpg' },
    ],
    wikidata: 'Q94923',
  },
  trip_id: 'trip-1',
};
const IMG = { media_type: 'image/png' as const, data: 'iVBORw0KGgo=', view: 'rest' as const };
const request = (body: unknown) =>
  new Request('https://x/functions/v1/landmarks', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

function depsOf(answer: unknown, over: Partial<CheckDeps> = {}) {
  const verdict = vi.fn((_id: string, _v: number, decision: 'ok' | 'adjust' | 'rejected') =>
    Promise.resolve(
      decision === 'ok'
        ? ('published' as const)
        : decision === 'adjust'
          ? ('adjusted' as const)
          : ('rejected' as const),
    ),
  );
  const record = vi.fn(() => Promise.resolve());
  const log: string[] = [];
  const { fetch } = fakeFetch([
    [/prop=imageinfo/, json(IMAGE_INFO)],
    [/upload\.wikimedia/, png()],
  ]);
  const deps: CheckDeps = {
    userId: 'user-1',
    claim: () => Promise.resolve('ok' as const),
    isLab: () => Promise.resolve(false),
    target: () => Promise.resolve(TARGET),
    verdict,
    record,
    fetch,
    ai: vi.fn(() => Promise.resolve(aiMessage(answer))),
    log: (l) => log.push(l),
    ...over,
  };
  return { deps, verdict, record, log };
}

describe('a conferência de um cartão-postal', () => {
  it('ok publica para todos; o log tem a chave e os números, não as capturas', async () => {
    const { deps, verdict, record, log } = depsOf({
      verdict: 'ok',
      notes: 'bate',
      recipe: { v: 1, shapes: [] },
    });
    const res = await handleLandmarkCheck(
      request({
        action: 'check',
        landmark_id: TARGET.id,
        version: 1,
        images: [IMG, { ...IMG, view: 'front' }],
      }),
      deps,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: string;
      version: number;
      usage: { model: string };
    };
    expect(body.result).toBe('published');
    expect(body.version).toBe(1);
    expect(verdict).toHaveBeenCalledWith(TARGET.id, 1, 'ok', null);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'succeeded',
        trip_id: 'trip-1',
        model: 'claude-sonnet-5-5',
      }),
    );
    // as duas fotos do registro (não a categoria inteira) e as duas capturas
    expect(log[0]).toContain('key=wikidata:Q94923 round=0 verdict=ok result=published');
    expect(log[0]).not.toContain('iVBOR');
    // a IA viu as fotos de referência (2) e as capturas (2)
    const params = (deps.ai as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      messages: { content: { type: string }[] }[];
    };
    expect(params.messages[0]!.content.filter((b) => b.type === 'image')).toHaveLength(4);
  });

  it('adjust troca a receita (uma rodada) e devolve a nova versão; na segunda rodada vira rejected', async () => {
    const fixed = { v: 1, shapes: [{ ...RECIPE.shapes[0], w: 5 }] };
    const { deps, verdict } = depsOf({
      verdict: 'adjust',
      notes: 'a base é mais larga',
      recipe: fixed,
    });
    const res = await handleLandmarkCheck(
      request({ action: 'check', landmark_id: TARGET.id, version: 1, images: [IMG] }),
      deps,
    );
    const body = (await res.json()) as { result: string; version: number; recipe: unknown };
    expect(body.result).toBe('adjusted');
    expect(body.version).toBe(2);
    expect(body.recipe).toEqual(fixed);
    expect(verdict).toHaveBeenCalledWith(TARGET.id, 1, 'adjust', fixed);

    const second = depsOf(
      { verdict: 'adjust', notes: 'ainda', recipe: fixed },
      { target: () => Promise.resolve({ ...TARGET, version: 2, round: 1 }) },
    );
    const res2 = await handleLandmarkCheck(
      request({ action: 'check', landmark_id: TARGET.id, version: 2, images: [IMG] }),
      second.deps,
    );
    expect(((await res2.json()) as { result: string }).result).toBe('rejected');
    expect(second.verdict).toHaveBeenCalledWith(TARGET.id, 2, 'rejected', null);
  });

  it('adjust com uma receita inválida conta como rejeitada', async () => {
    const { deps, verdict } = depsOf({
      verdict: 'adjust',
      notes: 'x',
      recipe: { v: 1, shapes: [{ k: 'teapot' }] },
    });
    const res = await handleLandmarkCheck(
      request({ action: 'check', landmark_id: TARGET.id, version: 1, images: [IMG] }),
      deps,
    );
    // a saída estruturada nem passa no schema do veredito: 502
    expect(res.status).toBe(502);
    expect(verdict).not.toHaveBeenCalled();
  });

  it('a versão que o aparelho desenhou já não é a do servidor: stale, sem gastar', async () => {
    const { deps } = depsOf({ verdict: 'ok', notes: '', recipe: { v: 1, shapes: [] } });
    const res = await handleLandmarkCheck(
      request({ action: 'check', landmark_id: TARGET.id, version: 7, images: [IMG] }),
      deps,
    );
    expect((await res.json()) as unknown).toEqual({ result: 'stale', version: 1 });
    expect(deps.ai).not.toHaveBeenCalled();
  });

  it('quem não é da viagem que pediu não acha a peça; a cota recusa; o pedido fora do formato', async () => {
    const { deps } = depsOf({}, { target: () => Promise.resolve(null) });
    expect(
      (
        await handleLandmarkCheck(
          request({ action: 'check', landmark_id: TARGET.id, version: 1, images: [IMG] }),
          deps,
        )
      ).status,
    ).toBe(404);
    const limited = depsOf({}, { claim: () => Promise.resolve('limit' as const) });
    expect(
      (
        await handleLandmarkCheck(
          request({ action: 'check', landmark_id: TARGET.id, version: 1, images: [IMG] }),
          limited.deps,
        )
      ).status,
    ).toBe(429);
    expect(
      (
        await handleLandmarkCheck(
          request({ action: 'check', landmark_id: 'x', version: 1, images: [] }),
          deps,
        )
      ).status,
    ).toBe(400);
  });

  it('o laboratório pode pedir o Opus; quem não é do laboratório fica no Sonnet', async () => {
    const lab = depsOf(
      { verdict: 'ok', notes: '', recipe: { v: 1, shapes: [] } },
      { isLab: () => Promise.resolve(true) },
    );
    await handleLandmarkCheck(
      request({
        action: 'check',
        landmark_id: TARGET.id,
        version: 1,
        images: [IMG],
        variant: 'opus',
      }),
      lab.deps,
    );
    expect(
      ((lab.deps.ai as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { model: string }).model,
    ).toBe('claude-opus-5-5');
    const user = depsOf({ verdict: 'ok', notes: '', recipe: { v: 1, shapes: [] } });
    await handleLandmarkCheck(
      request({
        action: 'check',
        landmark_id: TARGET.id,
        version: 1,
        images: [IMG],
        variant: 'opus',
      }),
      user.deps,
    );
    expect(
      ((user.deps.ai as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { model: string }).model,
    ).toBe('claude-sonnet-5-5');
  });
});
