import { AlertTriangle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { paymentLabel } from '@/domain/labels';
import type { SaleView } from './salesData';

/** Etiquetas da venda: pagamento, cancelada e se já chegou ao servidor. */
export function SaleBadges({ sale: s }: { sale: SaleView }) {
  return (
    <span className="mt-1 flex flex-wrap gap-1.5 text-xs font-bold">
      <span className={`rounded-full px-2 py-0.5 ${s.paymentKind === 'CREDIT' ? 'bg-peach text-brown' : 'bg-success/15 text-success'}`}>
        {paymentLabel(s.paymentKind, s.paidMethod)}
      </span>
      {s.status === 'CANCELLED' && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-danger">Cancelada</span>}
      {s.pendingCancel && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-danger">Cancelamento aguardando envio</span>}
      {s.sync === 'PENDING' && (
        <span className="inline-flex items-center gap-1 rounded-full bg-cream-deep px-2 py-0.5 text-orange-deep">
          <Clock className="h-3 w-3" aria-hidden="true" />
          No celular
        </span>
      )}
      {s.sync === 'SYNCING' && (
        <span className="inline-flex items-center gap-1 rounded-full bg-cream-deep px-2 py-0.5 text-orange-deep">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          Enviando
        </span>
      )}
      {s.sync === 'FAILED' && (
        <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-danger">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          Não enviada
        </span>
      )}
      {s.sync === 'SYNCED' && (
        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-success">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          Sincronizada
        </span>
      )}
    </span>
  );
}
