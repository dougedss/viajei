/** O texto sem as pontas, ou null quando não sobra nada: o "não disse" de um campo de texto. */
export function filled(text: string | null | undefined): string | null {
  const t = text?.trim();
  if (t === undefined || t === '') return null;
  return t;
}
