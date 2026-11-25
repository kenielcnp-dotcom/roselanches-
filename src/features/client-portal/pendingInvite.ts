// O token do convite fica guardado só nesta aba enquanto a pessoa cria a conta
// ou entra; depois de usado (ou recusado), é apagado. Dois tipos de convite:
// de cliente (portal) e de vendedor (equipe da Rose).
export type InviteKind = 'customer' | 'team';

export interface PendingInvite {
  kind: InviteKind;
  token: string;
}

const KEY = 'ldr.invite';
const STORED = /^(?:(team):)?([A-Za-z0-9_-]{32})$/;

export function savePendingInvite(kind: InviteKind, token: string): void {
  try {
    sessionStorage.setItem(KEY, kind === 'team' ? `team:${token}` : token);
  } catch {
    /* navegador sem armazenamento: o convite segue só na memória da página */
  }
}

export function pendingInvite(): PendingInvite | null {
  try {
    const match = STORED.exec(sessionStorage.getItem(KEY) ?? '');
    if (!match?.[2]) return null;
    return { kind: match[1] ? 'team' : 'customer', token: match[2] };
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

export function invitePath(kind: InviteKind): string {
  return kind === 'team' ? '/convite-equipe' : '/convite';
}

/** Depois de entrar ou criar a conta: com convite pendente, vai usá-lo. */
export function afterAuthPath(): string {
  const p = pendingInvite();
  return p ? invitePath(p.kind) : '/';
}
