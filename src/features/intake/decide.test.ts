import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decideIntake, isToday, looksLikeItinerary } from './decide.ts';

const seedText = readFileSync('supabase/seed/viagem-rs.txt', 'utf8');
const seedViajei = readFileSync('supabase/seed/viagem-rs.viajei', 'utf8');
const seedJson = readFileSync('supabase/seed/viagem-rs.json', 'utf8');

const WHATSAPP = `[10/11 14:32] Ana: Gente, fechei o roteiro!
[10/11 14:33] Ana: Sábado saímos 6h de Curitiba
[10/11 14:33] Ana: 10h Estrada da Graciosa, parada no mirante
[10/11 14:35] Ana: almoço em Morretes 12h30 (barreado!)
[10/11 14:36] Bruno: e a pousada?
[10/11 14:36] Ana: check-in 15h, código PX-7781`;

const WHATSAPP_DIAS = `Dia 1: Gramado
Dia 2: Canela e o Caracol
Dia 3: Bento Gonçalves, vinícolas
Dia 4: volta`;

const go = (path: string) => ({ kind: 'go', path });

describe('o campo: qual caminho', () => {
  it('o formato do Viajei e o JSON do schema, com rede ou sem', () => {
    for (const text of [seedViajei, seedJson, `Aqui está:\n\`\`\`\n${seedViajei}\`\`\``]) {
      expect(decideIntake(text, true)).toEqual(go('format'));
      expect(decideIntake(text, false)).toEqual(go('format'));
    }
  });

  it('o roteiro em texto livre: o seed, a conversa do WhatsApp, o esqueleto dos dias, o e-mail longo', () => {
    expect(decideIntake(seedText, true)).toEqual(go('itinerary'));
    expect(decideIntake(WHATSAPP, true)).toEqual(go('itinerary'));
    expect(decideIntake(WHATSAPP_DIAS, true)).toEqual(go('itinerary'));
    const email = `Olá, Douglas!\nSua reserva está confirmada.\n${'Detalhes da hospedagem e do quarto. '.repeat(20)}`;
    expect(decideIntake(email, true)).toEqual(go('itinerary'));
  });

  it('a saída de hoje', () => {
    for (const text of [
      'quero sair hoje',
      'Hoje',
      'agora',
      'bate e volta',
      'Bate-volta pra praia?',
      'bora dar uma volta hoje à tarde',
      'vamos sair já',
    ]) {
      expect(decideIntake(text, true), text).toEqual(go('today'));
    }
  });

  it('a conversa: as descrições, as vontades e as frases curtas', () => {
    for (const text of [
      'Serra Gaúcha em dezembro, 4 dias, saindo de Papanduva',
      'Serra Gaúcha, 11 a 14 de dezembro',
      'Quero conhecer vinícolas no sábado',
      'bate e volta amanhã',
      'sair hoje e voltar no domingo',
      'praia',
      'Sexta 13/12 saímos 7h, sábado volta',
    ]) {
      expect(decideIntake(text, true), text).toEqual(go('conversation'));
    }
  });

  it('texto vazio não vai a lugar nenhum', () => {
    expect(decideIntake('', true)).toEqual({ kind: 'empty' });
    expect(decideIntake('  \n ', false)).toEqual({ kind: 'empty' });
  });

  it('sem rede, o caminho que precisa da IA espera, dizendo qual é', () => {
    expect(decideIntake(seedText, false)).toEqual({ kind: 'offline', path: 'itinerary' });
    expect(decideIntake('quero sair hoje', false)).toEqual({ kind: 'offline', path: 'today' });
    expect(decideIntake('Serra em dezembro', false)).toEqual({
      kind: 'offline',
      path: 'conversation',
    });
  });

  it('as réguas, uma a uma', () => {
    expect(looksLikeItinerary('7h saída\n9h café\n10h parque\n12h almoço')).toBe(true);
    expect(looksLikeItinerary('7h saída de Curitiba e 9h café em Morretes')).toBe(false);
    expect(looksLikeItinerary('11/12 Gramado\n12/12 Canela')).toBe(false);
    // a frase de hoje é curta: quatro linhas já são outra coisa
    expect(isToday('hoje\njantar em Gramado\npasseio no lago\nvolta tarde')).toBe(false);
    expect(isToday(`hoje ${'a'.repeat(160)}`)).toBe(false);
  });
});
