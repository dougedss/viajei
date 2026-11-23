import { useEffect, useRef } from 'react';
import { driveKey, tableOf } from '@shared/drive-schema.ts';
import type { ImportState } from '@/features/import/useImport.ts';
import { driveTimes } from './drive-times.ts';
import { reschedule, unmeasuredLegs } from './reschedule.ts';

/**
 * A revisão da conversa mede o trecho que apareceu (a correção de 22/11/2026, D310): quando a pessoa
 * liga uma sugestão ou desmarca uma parada, o ponto anterior passa a ir direto a outro, e esse trecho
 * pode não ter sido medido ao traçar o caminho. Enquanto não é, as paradas depois dele ficam sem
 * horário (nunca com uma estimativa); este gancho pede o trecho à `drive-times`, guarda o que voltou
 * na tabela da revisão e refaz os horários dos dias que esperavam. O trecho que não deu para medir
 * não é pedido de novo em laço: só quando a pessoa mexer na revisão outra vez.
 */
export function useReviewDrive(imp: ImportState) {
  /** o `imp` de agora: a medição volta depois, e junta na revisão como ela estiver */
  const latest = useRef(imp);
  /** os pares a caminho do Google: não se pede o mesmo duas vezes ao mesmo tempo */
  const asked = useRef(new Set<string>());
  /** os pares que não deram na última tentativa: esperam a revisão mudar para tentar de novo */
  const failed = useRef(new Set<string>());
  useEffect(() => {
    latest.current = imp;
  });

  const stored = imp.stored;
  useEffect(() => {
    if (!stored) return;
    // a revisão mudou: o que não deu antes pode ser tentado de novo nesta volta (e só nesta)
    const skip = new Set([...asked.current, ...failed.current]);
    failed.current.clear();
    const waiting = unmeasuredLegs(stored.review, stored.schedule).filter(
      ({ pair }) => !skip.has(driveKey(pair[0], pair[1])),
    );
    if (waiting.length === 0) return;
    const pairs = waiting.map((w) => w.pair);
    const dates = [...new Set(waiting.map((w) => w.date))];
    for (const [a, b] of pairs) asked.current.add(driveKey(a, b));
    void driveTimes(pairs)
      .then((times) => {
        const added = tableOf(pairs, times);
        // medido (ou "sem estrada"): a tabela responde por ele daqui em diante
        for (const [a, b] of pairs) asked.current.delete(driveKey(a, b));
        latest.current.update((now) => {
          if (!now.schedule) return now;
          const schedule = { ...now.schedule, drive: { ...now.schedule.drive, ...added } };
          return {
            ...now,
            schedule,
            review: dates.reduce((r, date) => reschedule(r, schedule, date), now.review),
          };
        });
      })
      // sem resposta: as paradas ficam sem horário, e a tela diz; nada muda na revisão, então este
      // efeito não roda de novo sozinho (sem laço)
      .catch(() => {
        for (const [a, b] of pairs) {
          asked.current.delete(driveKey(a, b));
          failed.current.add(driveKey(a, b));
        }
      });
  }, [stored]);
}
