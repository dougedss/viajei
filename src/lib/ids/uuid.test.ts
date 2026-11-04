import { describe, expect, it } from 'vitest';
import { isUuid, uuidV4, uuidV5 } from './uuid.ts';

describe('uuid', () => {
  it('v4 é único e válido', () => {
    const a = uuidV4();
    const b = uuidV4();
    expect(a).not.toBe(b);
    expect(isUuid(a)).toBe(true);
    expect(a.charAt(14)).toBe('4');
  });

  it('v5 bate com o uuid_generate_v5 do Postgres (vetores calculados no banco)', async () => {
    // select extensions.uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'www.example.com')
    await expect(uuidV5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'www.example.com')).resolves.toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
    // o id do convite do seed: v5(trip_id, 'invite:' || email)
    await expect(
      uuidV5('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'invite:convidado@viajei.local'),
    ).resolves.toBe('64f3fe2f-7563-54a3-9ab5-1f6eb82bdba9');
    // o id da participação do dono: v5(trip_id, 'owner')
    await expect(uuidV5('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner')).resolves.toBe(
      '3b160377-5f3b-5e06-9754-b90075f95687',
    );
  });

  it('v5 é determinístico e sensível ao nome', async () => {
    const ns = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(await uuidV5(ns, 'x')).toBe(await uuidV5(ns, 'x'));
    expect(await uuidV5(ns, 'x')).not.toBe(await uuidV5(ns, 'y'));
  });

  it('v5 recusa namespace que não é uuid', async () => {
    await expect(uuidV5('nope', 'x')).rejects.toThrow('uuid inválido');
  });
});
