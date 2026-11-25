import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { METHOD_LABELS, paymentLabel } from '@/domain/labels';
import { formatBRL } from '@/domain/money';
import { formatDate, formatDateTime, PERIOD_LABELS } from '@/domain/period';
import type { StatementEntry } from '@/services/sales';

interface Props {
  entry: StatementEntry;
  /** Para onde a linha leva (null = não abre nada). */
  to: string | null;
  /** O cliente vê textos sem jargão e o estado da confirmação de cada compra. */
  audience: 'staff' | 'customer';
}

/** Uma linha do extrato: compra, pagamento, saldo anterior ou ajuste. */
export function StatementEntryRow({ entry: e, to, audience }: Props) {
  const cancelled = e.status === 'CANCELLED' || e.status === 'REVERSED';
  const credit = e.kind === 'PAYMENT' || e.kind === 'ADJUSTMENT_CREDIT';
  const when = new Date(e.occurredAt);
  const customer = audience === 'customer';

  let title: string;
  let detail: string;
  switch (e.kind) {
    case 'SALE':
      title =
        e.mode === 'ITEMS' && e.items ? e.items.map((i) => `${i.quantity}× ${i.productName}`).join(' + ') : (e.description ?? 'Venda');
      detail = `${formatDateTime(when)}${e.period ? ` · ${PERIOD_LABELS[e.period]}` : ''}${e.establishmentName ? ` · ${e.establishmentName}` : ''}`;
      break;
    case 'PAYMENT':
      title = `Pagamento${e.method ? ` em ${METHOD_LABELS[e.method].toLowerCase()}` : ''}`;
      detail = `${formatDateTime(when)}${e.description ? ` · ${e.description}` : ''}`;
      break;
    case 'OPENING_BALANCE':
      title = customer ? 'Saldo anterior (caderno)' : 'Saldo anterior';
      detail = `${formatDate(when)}${e.description ? ` · ${e.description}` : ''}`;
      break;
    default:
      title =
        e.kind === 'ADJUSTMENT_CREDIT'
          ? customer
            ? 'Desconto ou acerto a seu favor'
            : 'Ajuste (crédito)'
          : customer
            ? 'Acerto na conta'
            : 'Ajuste (débito)';
      detail = `${formatDateTime(when)} · ${e.description ?? ''}`;
  }

  const confirmationChip: ReactNode =
    customer && e.kind === 'SALE' && !cancelled
      ? {
          PENDING: <span className="rounded-full bg-orange-deep px-2 py-0.5 text-white">Confirme esta compra</span>,
          SIGNED: <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">Assinada</span>,
          CONFIRMED_ONLINE: <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">Confirmada</span>,
          DISPUTED: <span className="rounded-full bg-danger/10 px-2 py-0.5 text-danger">Contestada</span>,
          CANCELLED: null,
        }[e.confirmationStatus ?? 'CANCELLED']
      : null;

  const row = (
    <>
      <span className="min-w-0 flex-1">
        <span className={`block font-bold ${cancelled ? 'text-brown-soft line-through' : 'text-brown'}`}>{title}</span>
        <span className="block text-sm text-brown-soft">{detail}</span>
        <span className="mt-0.5 flex flex-wrap gap-1.5 text-xs font-bold">
          {e.kind === 'SALE' && e.paymentKind && (
            <span className="rounded-full bg-cream-deep px-2 py-0.5 text-brown">{paymentLabel(e.paymentKind, e.method)}</span>
          )}
          {cancelled && (
            <span className="rounded-full bg-danger/10 px-2 py-0.5 text-danger">
              {e.status === 'REVERSED' ? 'Estornado' : 'Cancelado'}
              {e.statusReason ? `: ${e.statusReason}` : ''}
            </span>
          )}
          {!cancelled && e.openCents !== null && e.kind !== 'PAYMENT' && e.paymentKind !== 'PAID_NOW' && (
            <span className={`rounded-full px-2 py-0.5 ${e.openCents === 0 ? 'bg-success/10 text-success' : 'bg-peach text-orange-darker'}`}>
              {e.openCents === 0 ? 'Quitado' : e.openCents === e.amountCents ? 'Em aberto' : `Falta ${formatBRL(e.openCents)}`}
            </span>
          )}
          {confirmationChip}
        </span>
      </span>
      <span className={`tabular shrink-0 font-black ${cancelled ? 'text-brown-soft line-through' : credit ? 'text-success' : 'text-brown'}`}>
        {credit ? '−' : ''}
        {formatBRL(e.amountCents)}
      </span>
    </>
  );

  return (
    <li>
      {to ? (
        <Link to={to} className="flex items-start gap-3 px-4 py-3 active:bg-cream-deep">
          {row}
        </Link>
      ) : (
        <div className="flex items-start gap-3 px-4 py-3">{row}</div>
      )}
    </li>
  );
}
