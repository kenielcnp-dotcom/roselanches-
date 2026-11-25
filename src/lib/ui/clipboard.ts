/** Copia texto; devolve false quando o navegador não deixa (o usuário copia na mão). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
