/**
 * O preview da Vercel de uma branch, puro. A Vercel publica cada branch em
 * `<projeto>-git-<branch>-<escopo>.vercel.app`, com a branch em minúsculas e tudo o que não é letra
 * ou número trocado por hífen (`fase-8` → `viajei-git-fase-8-…`). O rótulo do subdomínio tem no
 * máximo 63 caracteres; acima disso a Vercel encurta com um hash, e aqui a branch fica recusada em
 * vez de adivinhar o hash.
 */
export const VERCEL_PROJECT = 'viajei';
export const VERCEL_SCOPE = 'qimkt38-gmailcoms-projects';

export function branchSlug(branch: string): string {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function previewOrigin(branch: string): string {
  const slug = branchSlug(branch);
  if (slug === '') throw new Error('branch vazia: não há preview para testar');
  const label = `${VERCEL_PROJECT}-git-${slug}-${VERCEL_SCOPE}`;
  if (label.length > 63) {
    throw new Error(
      `o nome do preview de "${branch}" passa de 63 caracteres; use uma branch curta`,
    );
  }
  return `https://${label}.vercel.app`;
}
