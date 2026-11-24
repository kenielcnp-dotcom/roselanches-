import { Chip } from '@/components/Controls';
import { METHOD_LABELS } from '@/domain/labels';
import { formatBRL } from '@/domain/money';
import { formatDateTime, PERIOD_LABELS } from '@/domain/period';
import { maskPhone } from '@/domain/phone';
import type { SaleIssue } from '@/domain/sale';
import type { CachedCustomer, CachedEstablishment } from '@/lib/offline/db';
import type { PaymentKind, PaymentMethod, Period, SaleItemDraft, SaleMode } from '@/types/domain';

interface Props {
  establishment: CachedEstablishment;
  customer: CachedCustomer;
  mode: SaleMode;
  items: SaleItemDraft[];
  description: string;
  totalCents: number;
  period: Period;
  onPeriod: (p: Period) => void;
  paymentKind: PaymentKind;
  onPaymentKind: (k: PaymentKind) => void;
  method: PaymentMethod;
  onMethod: (m: PaymentMethod) => void;
  issues: SaleIssue[];
  now: Date;
}

/** Conferência antes de salvar: quem, onde, o quê, quanto e como pagou. */
export function SummaryStep(p: Props) {
  return (
    <div className="space-y-4">
      <section aria-label="Resumo da venda" className="rounded-card bg-white p-5 shadow-soft ring-1 ring-line">
        <dl className="space-y-3 text-brown">
          <Row label="Cliente">
            <span className="text-lg font-black">{p.customer.fullName}</span>
            {p.customer.phoneE164 && <span className="block text-brown-soft">{maskPhone(p.customer.phoneE164)}</span>}
          </Row>
          <Row label="Estabelecimento">
            <span className="font-bold">{p.establishment.name}</span>
          </Row>
          <Row label="Data">
            <span className="font-bold">{formatDateTime(p.now)}</span>
          </Row>
          <Row label={p.mode === 'ITEMS' ? 'Produtos' : 'Descrição'}>
            {p.mode === 'ITEMS' ? (
              <ul>
                {p.items.map((i) => (
                  <li key={i.productId} className="flex justify-between gap-3">
                    <span>
                      {i.quantity}× {i.productName}
                    </span>
                    <span className="tabular text-brown-soft">{formatBRL(i.subtotalCents)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="font-bold">{p.description.trim()}</span>
            )}
          </Row>
        </dl>
        <div className="mt-4 flex items-end justify-between border-t border-line pt-3">
          <span className="text-lg font-bold text-brown">Total</span>
          <span className="tabular text-4xl font-black text-brown">{formatBRL(p.totalCents)}</span>
        </div>
      </section>

      <fieldset>
        <legend className="mb-1.5 font-bold text-brown">Período</legend>
        <div className="flex flex-wrap gap-2">
          {(['MORNING', 'AFTERNOON', 'NIGHT'] as const).map((period) => (
            <Chip key={period} selected={p.period === period} onClick={() => p.onPeriod(period)}>
              {PERIOD_LABELS[period]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 font-bold text-brown">Pagamento</legend>
        <div className="flex flex-wrap gap-2">
          <Chip selected={p.paymentKind === 'CREDIT'} onClick={() => p.onPaymentKind('CREDIT')}>
            Fiado
          </Chip>
          <Chip selected={p.paymentKind === 'PAID_NOW'} onClick={() => p.onPaymentKind('PAID_NOW')}>
            Pago agora
          </Chip>
        </div>
        {p.paymentKind === 'PAID_NOW' && (
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Forma de pagamento">
            {(['CASH', 'PIX'] as const).map((m) => (
              <Chip key={m} selected={p.method === m} onClick={() => p.onMethod(m)}>
                {METHOD_LABELS[m]}
              </Chip>
            ))}
          </div>
        )}
      </fieldset>

      {p.issues.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-2xl bg-danger/10 px-4 py-3 font-semibold text-danger">
          {p.issues.map((i) => (
            <li key={`${i.field}-${i.message}`}>{i.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-bold text-brown-soft">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
