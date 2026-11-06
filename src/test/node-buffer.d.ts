/**
 * Só para os testes: o `Blob` nativo do Node, que sobrevive ao clone do fake-indexeddb (o do
 * happy-dom perde o conteúdo). O app não tem os tipos do Node; aqui basta a forma do Blob.
 */
declare module 'node:buffer' {
  export const Blob: typeof globalThis.Blob;
}
