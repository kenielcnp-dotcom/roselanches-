import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ChevronRight, Info } from 'lucide-react';
import { Button } from '@/components/Button';
import { Chip, MoneyField, SearchField } from '@/components/Controls';
import { TextField } from '@/components/Field';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { METHOD_LABELS } from '@/domain/labels';
import { formatBRL } from '@/domain/money';
import { formatDateTime } from '@/domain/period';
import { maskPhone } from '@/domain/phone';
import { matchesPerson, rankByName } from '@/domain/search';
import type { CachedCustomer } from '@/lib/offline/db';
import { enqueuePayment } from '@/lib/offline/outbox';
import { useLiveQuery } from '@/lib/offline/useLiveQuery';
import { errorMessage } from '@/lib/supabase/errors';
import type { PaymentMethod } from '@/types/domain';
import { useSync } from '@/features/sync/SyncProvider';

const MAX_CENTS = 100_000_000;

/**
 * Pagamento recebido na rua (dinheiro ou Pix na hora), também sem internet.
 * Saldo mostrado = cópia do celular + o que ainda está no celular sem enviar.
 */
export function PaymentFormPage() {
  const { db, requestSync, catalogUpdatedAt } = useSync();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();

  const data = useLiveQuery(async () => {
    const [customers, sales, payments, ops] = await Promise.all([
      db.customers.toArray(),
      db.localSales.toArray(),
      db.localPayments.toArray(),
      db.outbox.toArray(),
    ]);
    const open = new Set(ops.filter((o) => o.state !== 'SYNCED').map((o) => o.opId));
    const pending = new Map<string, number>();
    for (const s of sales) {
      if (open.has(s.opId) && s.draft.paymentKind === 'CREDIT' && !s.cancel) {
        pending.set(s.draft.customerId, (pending.get(s.draft.customerId) ?? 0) + s.draft.totalCents);
      }
    }
    for (const p of payments) {
      if (open.has(p.opId)) pending.set(p.payload.customer_id, (pending.get(p.payload.customer_id) ?? 0) - p.payload.amount_cents);
    }
    return { customers: customers.filter((c) => c.isActive), pending };
  }, [db]);

  const [customerId, setCustomerId] = useState<string | null>(params.get('cliente'));
  const [search, setSearch] = useState('');
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [note, setNote] = useState('');
  const [paymentId, setPaymentId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);

  const shown = useMemo(
    () =>
      data
        ? rankByName(
            data.customers.filter((c) => matchesPerson({ name: c.fullName, phoneE164: c.phoneE164 }, search)),
            search,
            (c) => c.fullName,
          ).slice(0, 40)
        : [],
    [data, search],
  );

  if (!data) return <LoadingState />;
  const customer = data.customers.find((c) => c.id === customerId) ?? null;
  const owed = (c: CachedCustomer) => c.balanceCents + (data.pending.get(c.id) ?? 0);

  if (!customer) {
    return (
      <>
        <PageHeader title="Quem pagou?" back="/recebimentos" />
        <main className="mx-auto max-w-lg space-y-3 px-4 pt-2 pb-6">
          <SearchField label="Buscar cliente por nome ou telefone" value={search} onChange={setSearch} autoFocus />
          <ul className="divide-y divide-line overflow-hidden rounded-card bg-white shadow-soft ring-1 ring-line">
            {shown.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setCustomerId(c.id)}
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-cream-deep"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-extrabold text-brown">{c.fullName}</span>
                    <span className="block text-sm text-brown-soft">{c.phoneE164 ? maskPhone(c.phoneE164) : 'Sem telefone'}</span>
                  </span>
                  {owed(c) > 0 && <span className="tabular shrink-0 font-black text-orange-deep">{formatBRL(owed(c))}</span>}
                  <ChevronRight className="h-5 w-5 shrink-0 text-brown-soft" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {shown.length === 0 && <p className="py-6 text-center text-brown-soft">Nenhum cliente encontrado.</p>}
        </main>
      </>
    );
  }

  const debt = owed(customer);
  const leftover = debt - amount;

  const save = async () => {
    if (saving || amount <= 0 || amount > MAX_CENTS) return;
    setSaving(true);
    try {
      await enqueuePayment(
        db,
        {
          id: paymentId,
          customer_id: customer.id,
          amount_cents: amount,
          method,
          received_at: new Date().toISOString(),
          note: note.trim() === '' ? null : note.trim(),
        },
        customer.fullName,
      );
      toast.show('Pagamento salvo no celular.');
      void requestSync();
      setPaymentId(crypto.randomUUID());
      navigate('/recebimentos', { replace: true });
    } catch (e) {
      toast.show(`O pagamento NÃO foi salvo: ${errorMessage(e)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Registrar pagamento" back="/recebimentos" />
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-2 pb-6">
        <section className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-line">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-black text-brown">{customer.fullName}</span>
            <span className="block text-sm text-brown-soft">
              {debt > 0 ? `Deve ${formatBRL(debt)}` : debt < 0 ? `Tem crédito de ${formatBRL(-debt)}` : 'Em dia'}
              {catalogUpdatedAt ? ` · saldo de ${formatDateTime(new Date(catalogUpdatedAt))}` : ''}
            </span>
          </span>
          <button type="button" onClick={() => setCustomerId(null)} className="min-h-10 px-2 text-sm font-extrabold text-orange-deep">
            Trocar
          </button>
        </section>

        <MoneyField label="Valor recebido" valueCents={amount} onChange={setAmount} autoFocus />
        {debt > 0 && (
          <div className="flex flex-wrap gap-2">
            <Chip selected={amount === debt} onClick={() => setAmount(debt)}>
              Quitar tudo: {formatBRL(debt)}
            </Chip>
          </div>
        )}
        {amount > 0 && (
          <p className="flex items-start gap-2 rounded-2xl bg-cream-deep px-4 py-3 text-brown">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-orange-deep" aria-hidden="true" />
            {leftover > 0
              ? `Depois deste pagamento ainda fica devendo ${formatBRL(leftover)}.`
              : leftover === 0
                ? 'Com este pagamento a conta fica quitada.'
                : `Vai sobrar ${formatBRL(-leftover)} de crédito para o cliente. Verifique o valor antes de continuar.`}
          </p>
        )}

        <fieldset>
          <legend className="mb-1.5 font-bold text-brown">Forma</legend>
          <div className="flex gap-2">
            {(['CASH', 'PIX'] as const).map((m) => (
              <Chip key={m} selected={method === m} onClick={() => setMethod(m)}>
                {METHOD_LABELS[m]}
              </Chip>
            ))}
          </div>
        </fieldset>
        <TextField label="Observação (opcional)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />

        <Button block className="min-h-14 text-lg" loading={saving} disabled={amount <= 0 || amount > MAX_CENTS} onClick={() => void save()}>
          Salvar pagamento de {formatBRL(amount)}
        </Button>
      </main>
    </>
  );
}
