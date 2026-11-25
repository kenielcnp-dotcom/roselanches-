import { Link, Outlet } from 'react-router';
import { WifiOff } from 'lucide-react';
import { Awning } from '@/components/Awning';
import { Logo } from '@/components/Logo';
import { useConnectionStatus } from '@/app/ConnectionProvider';

/** Casca do portal: toldo, logo e aviso de "sem internet" (o portal não guarda nada no aparelho). */
export function PortalLayout() {
  const { status } = useConnectionStatus();
  return (
    <div className="min-h-dvh">
      <Awning />
      <header className="mx-auto flex max-w-lg items-center justify-between px-4 pt-3">
        <Link to="/conta" aria-label="Início da sua conta">
          <Logo />
        </Link>
      </header>
      {status === 'offline' && (
        <p role="status" className="mx-auto mt-3 flex max-w-lg items-center gap-2 px-4 font-bold text-brown">
          <WifiOff className="h-5 w-5 shrink-0 text-orange-deep" aria-hidden="true" />
          Sem internet. Sua conta aparece quando a conexão voltar.
        </p>
      )}
      <Outlet />
    </div>
  );
}
