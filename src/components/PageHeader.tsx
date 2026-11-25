import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { SyncPill } from './SyncPill';
import { useSyncPillState } from '@/features/sync/useSyncPillState';

interface PageHeaderProps {
  title: string;
  /** Mostra "Voltar". O caminho é usado quando a tela foi aberta direto (sem histórico). */
  back?: string;
  /** Pílula de sincronização (padrão: nas telas principais, não nos formulários). */
  showSync?: boolean;
  /** Pílula só com o ícone (padrão: quando há "Voltar", para caber o título). */
  compactSync?: boolean;
  children?: ReactNode;
}

/** Cabeçalho das telas internas: voltar + título grande + pílula de sincronização. */
export function PageHeader({ title, back, showSync = !back, compactSync = !!back, children }: PageHeaderProps) {
  return (
    <header className="safe-top sticky top-0 z-20 bg-cream/95 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-1">
          {back && <BackButton fallback={back} />}
          <h1 className="truncate text-2xl font-black text-brown">{title}</h1>
        </div>
        {showSync && <HeaderSyncPill compact={compactSync} />}
      </div>
      {children}
    </header>
  );
}

function HeaderSyncPill({ compact }: { compact: boolean }) {
  const syncState = useSyncPillState();
  return (
    <div className={compact ? 'shrink-0' : 'max-w-[11.5rem] shrink-0'}>
      <SyncPill state={syncState} compact={compact} />
    </div>
  );
}

function BackButton({ fallback }: { fallback: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <button
      type="button"
      aria-label="Voltar"
      onClick={() => (location.key === 'default' ? navigate(fallback, { replace: true }) : navigate(-1))}
      className="-ml-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-brown active:bg-peach"
    >
      <ArrowLeft className="h-7 w-7" strokeWidth={2.5} aria-hidden="true" />
    </button>
  );
}
