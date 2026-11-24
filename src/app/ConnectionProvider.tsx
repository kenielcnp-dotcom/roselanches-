import { createContext, useContext, type ReactNode } from 'react';
import { useConnection, type ConnectionState } from '@/hooks/useConnection';

const ConnectionContext = createContext<ConnectionState | null>(null);

/** Uma única verificação de conexão para o app inteiro. */
export function ConnectionProvider({ children }: { children: ReactNode }) {
  const state = useConnection();
  return <ConnectionContext.Provider value={state}>{children}</ConnectionContext.Provider>;
}

export function useConnectionStatus(): ConnectionState {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error('useConnectionStatus precisa estar dentro de <ConnectionProvider>');
  return ctx;
}
