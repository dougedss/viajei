import { describe, expect, it } from 'vitest';
import { AI_REQUEST, AI_REQUEST_EXAMPLE, AI_REQUEST_KINDS } from './ai-request.ts';
import { readViajei } from './format.ts';

describe('o pedido para outras IAs', () => {
  it('o exemplo passa pelo leitor do formato, com cada parte', () => {
    const result = readViajei(AI_REQUEST_EXAMPLE, '2026-11-15');
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const { trip, data } = result.doc;
    expect(trip).toMatchObject({ name: 'Curitiba e Morretes', start_date: '2027-03-20' });
    expect(data.days.map((d) => d.stops.length)).toEqual([4, 2]);
    expect(data.reservations).toHaveLength(1);
    expect(data.checklist_pack).toEqual(['Casaco leve']);
    expect(data.quests[0]?.stop_ref).toBe('Estrada da Graciosa');
    // a outra IA nunca escreve coordenada
    expect(data.days.flatMap((d) => d.stops).every((s) => s.lat === null)).toBe(true);
  });

  it('o pedido inteiro, colado de volta como a outra IA responderia (num bloco de código), é lido', () => {
    const answer = `Aqui está:\n\n\`\`\`\n${AI_REQUEST_EXAMPLE}\n\`\`\`\n\nBoa viagem!`;
    expect(readViajei(answer, '2026-11-15').ok).toBe(true);
  });

  it('lista todos os tipos de parada, com o Posto, e pede o bloco de código', () => {
    for (const word of AI_REQUEST_KINDS) expect(AI_REQUEST).toContain(word);
    expect(AI_REQUEST).toContain('posto');
    expect(AI_REQUEST).toContain('bloco de código');
    expect(AI_REQUEST).toContain('Nunca escreva coordenadas');
  });
});
