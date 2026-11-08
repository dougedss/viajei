import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { findSecrets } from './secrets.ts';

/**
 * Reprova o build se o `dist/` levar um segredo (passo da CI depois do build). Uso:
 * `node scripts/security/scan-dist.ts dist`. Diz o arquivo, a posição e o tipo; nunca o valor.
 */
const root = process.argv[2] ?? 'dist';
const TEXT = /\.(js|mjs|cjs|html|css|json|webmanifest|map|txt|svg|xml)$/;

async function* files(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (TEXT.test(entry.name)) yield path;
  }
}

let scanned = 0;
let found = 0;
for await (const path of files(root)) {
  scanned++;
  for (const hit of findSecrets(await readFile(path, 'utf8'))) {
    found++;
    console.error(
      `::error file=${relative('.', path)}::${hit.kind} na posição ${String(hit.index)}`,
    );
  }
}
console.log(
  `varredura de segredos: ${String(scanned)} arquivos em ${root}, ${String(found)} achados`,
);
if (scanned === 0) {
  console.error(`::error::nada para varrer em ${root} (o build rodou?)`);
  process.exit(1);
}
if (found > 0) process.exit(1);
