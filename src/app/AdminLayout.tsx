import { Outlet } from 'react-router';
import { BottomNav } from '@/components/BottomNav';

/** Área da Rose: conteúdo + navegação inferior fixa. */
export function AdminLayout() {
  return (
    <div className="min-h-dvh pb-28">
      <Outlet />
      <BottomNav />
    </div>
  );
}
