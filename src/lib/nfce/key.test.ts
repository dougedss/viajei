import { describe, expect, it } from 'vitest';
import {
  checkDigit,
  emissionDate,
  emissionMonth,
  formatCnpj,
  isValidCnpj,
  parseAccessKey,
  parseNfceQr,
} from './key.ts';

/**
 * A chave do exemplo do Manual de Padrões do DANFE NFC-e e QR Code v6.0 (4.3.6.1, emissão online), com o
 * DV corrigido: a do manual termina em 4, mas o módulo 11 do MOC dá 8 (um exemplo fictício, que não
 * fecha); a do próprio MOC (abaixo) fecha.
 */
const EXAMPLE = '28170800156225000131650110000151341562040828';
/** O exemplo do MOC 7.0 Visão Geral, 2.2.6.2 (uma NF-e, modelo 55, com DV 5). */
const MOC_EXAMPLE = '52060433009911002506550120000007800267301615';

describe('a chave de acesso', () => {
  it('lê os campos da Tabela 2-1 do MOC 7.0 e confere o DV pelo módulo 11', () => {
    const key = parseAccessKey(EXAMPLE);
    expect(key).toEqual({
      key: EXAMPLE,
      uf: '28',
      year: 2017,
      month: 8,
      cnpj: '00156225000131',
      model: '65',
      series: '011',
      number: '000015134',
      emission: '1',
      code: '56204082',
      dv: 8,
    });
    expect(checkDigit(MOC_EXAMPLE.slice(0, 43))).toBe(5);
    expect(parseAccessKey(MOC_EXAMPLE)?.model).toBe('55');
  });

  it('aceita a chave em blocos de 4 (como impressa no DANFE) e recusa DV errado, tamanho errado e mês inválido', () => {
    expect(parseAccessKey('2817 0800 1562 2500 0131 6501 1000 0151 3415 6204 0828')?.key).toBe(
      EXAMPLE,
    );
    expect(parseAccessKey(`${EXAMPLE.slice(0, 43)}5`)).toBeNull();
    expect(parseAccessKey(EXAMPLE.slice(0, 43))).toBeNull();
    expect(parseAccessKey(`2813${EXAMPLE.slice(4)}`)).toBeNull();
  });

  it('o mês da emissão vem da chave; o dia, não', () => {
    const key = parseAccessKey(EXAMPLE);
    if (!key) throw new Error('chave inválida');
    expect(emissionMonth(key)).toBe('2017-08');
    expect(emissionDate({ key, day: null })).toBeNull();
    expect(emissionDate({ key, day: 2 })).toBe('2017-08-02');
  });
});

describe('o QR code da NFC-e', () => {
  it('a URL online da versão 2.00 (o exemplo do manual): a chave, a versão e o ambiente; sem dia nem total', () => {
    const qr = parseNfceQr(
      `http://www.sefazexemplo.gov.br/nfce/qrcode?p=${EXAMPLE}|2|1|1|DC6AE2C2B9A992BE59679AC365E29922DE6B7511`,
    );
    expect(qr?.key.cnpj).toBe('00156225000131');
    expect(qr).toMatchObject({ version: '2', environment: '1', day: null, total: null });
  });

  it('a contingência offline traz o dia e o valor total (versões 2.00 e 3.00)', () => {
    const offline2 = parseNfceQr(
      `http://www.sefazexemplo.gov.br/nfce/qrcode/?p=${EXAMPLE}|2|1|02|60.90|797A...|1|HASH`,
    );
    expect(offline2).toMatchObject({ version: '2', day: 2, total: 60.9 });
    expect(emissionDate(offline2 ?? { key: parseAccessKey(EXAMPLE)!, day: null })).toBe(
      '2017-08-02',
    );
    const offline3 = parseNfceQr(
      `https://sat.sef.sc.gov.br/nfce/consulta?p=${EXAMPLE}|3|1|12|187.40|2|12345678901|ASSINATURA==`,
    );
    expect(offline3).toMatchObject({ version: '3', environment: '1', day: 12, total: 187.4 });
    const online3 = parseNfceQr(`https://sat.sef.sc.gov.br/nfce/consulta?p=${EXAMPLE}|3|1`);
    expect(online3).toMatchObject({ version: '3', day: null, total: null });
  });

  it('o parâmetro pode vir codificado na URL', () => {
    const qr = parseNfceQr(
      `https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=${EXAMPLE}%7C2%7C1%7C1%7CABC`,
    );
    expect(qr?.version).toBe('2');
  });

  it('o que não é um QR de NFC-e: outro texto, outra versão, uma NF-e (modelo 55), DV errado', () => {
    expect(parseNfceQr('https://viajei.app/x')).toBeNull();
    expect(parseNfceQr(`?p=${EXAMPLE}|9|1`)).toBeNull();
    expect(parseNfceQr(`?p=${MOC_EXAMPLE}|2|1|1|HASH`)).toBeNull();
    expect(parseNfceQr(`?p=${EXAMPLE.slice(0, 43)}5|2|1|1|HASH`)).toBeNull();
    expect(parseNfceQr('')).toBeNull();
  });
});

describe('o CNPJ', () => {
  it('formata e confere os dígitos', () => {
    expect(formatCnpj('19131243000197')).toBe('19.131.243/0001-97');
    expect(isValidCnpj('19131243000197')).toBe(true);
    expect(isValidCnpj('19131243000198')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
    expect(isValidCnpj('123')).toBe(false);
  });
});
