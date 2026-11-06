import { useEffect, useState } from 'react';
import { detectSupport, type Support } from '../renderer.ts';

/** O que este aparelho consegue desenhar, antes de montar o Canvas; `pending` enquanto sonda. */
export function useSupport(): Support | 'pending' {
  const [support, setSupport] = useState<Support | 'pending'>('pending');
  useEffect(() => {
    let alive = true;
    void detectSupport().then((s) => {
      if (alive) setSupport(s);
    });
    return () => {
      alive = false;
    };
  }, []);
  return support;
}
