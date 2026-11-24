import { Outlet } from 'react-router';
import { BottomNav } from '@/components/BottomNav';
import { SyncProvider } from '@/features/sync/SyncProvider';

/** Área da Rose: fila do celular + conteúdo + navegação inferior fixa. */
export function AdminLayout() {
  return (
    <SyncProvider>
      <div className="min-h-dvh pb-28">
        <Outlet />
        <BottomNav />
      </div>
    </SyncProvider>
  );
}
