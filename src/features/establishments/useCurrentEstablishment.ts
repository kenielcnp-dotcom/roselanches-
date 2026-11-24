// Estabelecimento onde a Rose está vendendo agora. Fica lembrado NESTE aparelho
// (por conta), para a próxima venda já abrir no lugar certo.
import { useCallback, useSyncExternalStore } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';

const listeners = new Set<() => void>();

function storageKey(userId: string): string {
  return `ldr.${userId}.establishment`;
}

function read(key: string | null): string | null {
  if (!key) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function useCurrentEstablishmentId(): [string | null, (id: string | null) => void] {
  const { session } = useAuth();
  const key = session ? storageKey(session.user.id) : null;
  const value = useSyncExternalStore(subscribe, () => read(key), () => null);

  const set = useCallback(
    (id: string | null) => {
      if (!key) return;
      try {
        if (id) localStorage.setItem(key, id);
        else localStorage.removeItem(key);
      } catch {
        /* sem armazenamento: só não fica lembrado */
      }
      listeners.forEach((l) => l());
    },
    [key],
  );

  return [value, set];
}
