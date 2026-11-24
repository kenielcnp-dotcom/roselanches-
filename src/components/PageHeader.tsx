import type { ReactNode } from 'react';
import { SyncPill } from './SyncPill';
import { useSyncPillState } from '@/features/sync/useSyncPillState';

/** Cabeçalho das telas internas: título grande + pílula de sincronização. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  const syncState = useSyncPillState();
  return (
    <header className="safe-top sticky top-0 z-20 bg-cream/95 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3">
        <h1 className="text-2xl font-black text-brown">{title}</h1>
        <div className="max-w-[11.5rem]">
          <SyncPill state={syncState} />
        </div>
      </div>
      {children}
    </header>
  );
}
