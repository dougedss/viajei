/** Junta classes ignorando falsy. Pequeno de propósito: não precisamos de clsx. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
