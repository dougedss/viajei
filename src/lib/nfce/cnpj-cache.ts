import { db } from '@/lib/db/schema.ts';
import type { CnpjCache } from './cnpj.ts';

/** O cache do estabelecimento por CNPJ no Dexie (a store `cnpj`, v6): só neste aparelho, nunca sincroniza. */
export const dexieCnpjCache: CnpjCache = {
  get: (cnpj) => db.cnpj.get(cnpj),
  put: async (merchant) => {
    await db.cnpj.put(merchant);
  },
};
