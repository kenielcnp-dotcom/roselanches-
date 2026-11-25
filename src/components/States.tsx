import type { ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from './Button';

export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 py-16 text-brown-soft">
      <Loader2 className="h-8 w-8 animate-spin text-orange-darker" aria-hidden="true" />
      <span className="font-semibold">{label}</span>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-white/70 px-6 py-10 text-center ring-1 ring-line">
      {icon && <div className="text-orange" aria-hidden="true">{icon}</div>}
      <h2 className="text-lg font-extrabold text-brown">{title}</h2>
      {children && <div className="text-brown-soft">{children}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-card bg-white px-6 py-8 text-center ring-1 ring-line">
      <AlertTriangle className="h-8 w-8 text-danger" aria-hidden="true" />
      <p className="font-semibold text-brown">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  );
}
