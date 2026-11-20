import { describe, expect, it } from 'vitest';
import type { ReadReceipt } from '@shared/read-protocol.ts';
import type { Merchant } from '@/lib/nfce/cnpj.ts';
import { parseAccessKey, type NfceQr } from '@/lib/nfce/key.ts';
import { needsAi, receiptMissing, suggestExpense, suggestionLine } from './to-expense.ts';

const KEY = parseAccessKey('28170800156225000131650110000151341562040828');
if (!KEY) throw new Error('chave de teste inválida');
const TRIP = { start_date: '2017-08-01', end_date: '2017-08-05' };
const ONLINE: NfceQr = { key: KEY, version: '3', environment: '1', day: null, total: null };
const OFFLINE: NfceQr = { key: KEY, version: '3', environment: '1', day: 2, total: 60.9 };
const MERCHANT: Merchant = {
  cnpj: KEY.cnpj,
  name: 'Posto da Serra',
  city: 'Canela',
  uf: 'RS',
  fetched_at: '2026-11-20T12:00:00Z',
};
const AI: ReadReceipt = {
  total: 187.4,
  merchant: 'POSTO SERRA LTDA',
  cnpj: '00156225000131',
  date: '2017-08-03',
  time: '15:42',
  category: 'fuel',
  access_key: null,
};
const money = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

describe('suggestExpense', () => {
  it('o QR online dá o CNPJ e o estabelecimento (pela BrasilAPI); o total, a data e a categoria vêm da IA', () => {
    expect(needsAi(ONLINE)).toBe(true);
    const s = suggestExpense({ qr: ONLINE, merchant: MERCHANT, ai: AI }, TRIP);
    expect(s).toEqual({
      amount: 187.4,
      date: '2017-08-03',
      category: 'fuel',
      merchant: 'Posto da Serra',
      cnpj: KEY.cnpj,
      sources: { amount: 'ai', date: 'ai', merchant: 'cnpj' },
    });
    expect(suggestionLine(s, money)).toBe('R$ 187,40 · Posto da Serra · 03/08');
    expect(receiptMissing(s)).toEqual([]);
  });

  it('a contingência offline traz o dia e o total: a IA não é chamada e o QR vence', () => {
    expect(needsAi(OFFLINE)).toBe(false);
    const s = suggestExpense({ qr: OFFLINE, merchant: MERCHANT, ai: null }, TRIP);
    expect(s.amount).toBe(60.9);
    expect(s.date).toBe('2017-08-02');
    expect(s.category).toBeNull();
    expect(s.sources).toEqual({ amount: 'qr', date: 'qr', merchant: 'cnpj' });
  });

  it('sem QR nem BrasilAPI, só a IA; sem IA, o que ninguém disse fica vazio e é listado', () => {
    const onlyAi = suggestExpense({ qr: null, merchant: null, ai: AI }, TRIP);
    expect(onlyAi.merchant).toBe('POSTO SERRA LTDA');
    expect(onlyAi.cnpj).toBe('00156225000131');
    expect(onlyAi.sources.merchant).toBe('ai');
    const nothing = suggestExpense({ qr: ONLINE, merchant: null, ai: null }, TRIP);
    expect(nothing.amount).toBeNull();
    expect(nothing.cnpj).toBe(KEY.cnpj);
    expect(receiptMissing(nothing)).toEqual(['o total', 'a data', 'o estabelecimento']);
    expect(suggestionLine(nothing, money)).toBe('');
  });

  it('uma data fora da viagem não entra (um campo vazio é melhor que um errado)', () => {
    const s = suggestExpense({ qr: null, merchant: null, ai: { ...AI, date: '2026-08-03' } }, TRIP);
    expect(s.date).toBeNull();
    expect(s.sources.date).toBeNull();
    expect(needsAi(null)).toBe(true);
  });
});
