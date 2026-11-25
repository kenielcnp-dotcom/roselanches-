// O token do convite fica guardado só nesta aba enquanto o cliente cria a conta
// ou entra; depois de usado (ou recusado), é apagado.
const KEY = 'ldr.invite';
const TOKEN = /^[A-Za-z0-9_-]{32}$/;

export function savePendingInvite(token: string): void {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    /* navegador sem armazenamento: o convite segue só na memória da página */
  }
}

export function pendingInvite(): string | null {
  try {
    const t = sessionStorage.getItem(KEY);
    return t && TOKEN.test(t) ? t : null;
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nada a fazer */
  }
}

/** Lê "#t=<token>" do link (o "#" nunca é enviado a servidor nenhum). */
export function inviteFromHash(hash: string): string | null {
  const match = /(?:^#|&)t=([A-Za-z0-9_-]{32})(?:&|$)/.exec(hash);
  return match?.[1] ?? null;
}

/** Depois de entrar ou criar a conta: com convite pendente, vai usá-lo. */
export function afterAuthPath(): string {
  return pendingInvite() ? '/convite' : '/';
}
