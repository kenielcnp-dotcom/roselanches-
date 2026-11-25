import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/Button';
import { Chip, MoneyField } from '@/components/Controls';
import { TextField } from '@/components/Field';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { formatBRL } from '@/domain/money';
import { localDateISO } from '@/domain/period';
import { errorMessage } from '@/lib/supabase/errors';
import { useCustomers } from '@/features/registry/queries';
import { useCreateAdjustment, useCreateOpeningBalance } from './paymentsData';

const MAX_CENTS = 100_000_000;

/**
 * Correções lançadas pela dona: "Saldo anterior" (dívida antiga do caderno) ou
 * ajuste de débito/crédito. Precisam de internet (o servidor confere a autorização).
 */
export function EntryFormPage({ kind }: { kind: 'OPENING_BALANCE' | 'ADJUSTMENT' }) {
  const { id: customerId = '' } = useParams();
  const customers = useCustomers();
  const navigate = useNavigate();
  const toast = useToast();
  const opening = useCreateOpeningBalance();
  const adjustment = useCreateAdjustment();
  const [entryId] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(() => localDateISO(new Date()));
  const [text, setText] = useState(kind === 'OPENING_BALANCE' ? 'Saldo do caderno' : '');
  const [direction, setDirection] = useState<'DEBIT' | 'CREDIT'>('CREDIT');
  const [error, setError] = useState<string | null>(null);

  if (customers.isPending) return <LoadingState />;
  const customer = customers.data?.find((c) => c.id === customerId);
  if (!customer) return <ErrorState message="Cliente não encontrado." />;

  const today = localDateISO(new Date());
  const textOk = kind === 'OPENING_BALANCE' ? text.trim().length >= 1 : text.trim().length >= 3;
  const valid = amount > 0 && amount <= MAX_CENTS && textOk && (kind === 'ADJUSTMENT' || date <= today);
  const busy = opening.isPending || adjustment.isPending;

  const save = async () => {
    setError(null);
    try {
      const status =
        kind === 'OPENING_BALANCE'
          ? await opening.mutateAsync({ id: entryId, customerId, amountCents: amount, referenceDate: date, note: text })
          : await adjustment.mutateAsync({ id: entryId, customerId, direction, amountCents: amount, reason: text });
      if (status === 'CONFLICT') {
        setError('Este lançamento já foi registrado com outros dados. Abra a tela de novo.');
        return;
      }
      toast.show(kind === 'OPENING_BALANCE' ? 'Saldo anterior registrado.' : 'Ajuste registrado.');
      navigate(`/clientes/${customerId}`, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader title={kind === 'OPENING_BALANCE' ? 'Saldo anterior' : 'Ajuste'} back={`/clientes/${customerId}`} />
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-2 pb-6">
        <p className="rounded-2xl bg-white px-4 py-3 font-bold text-brown ring-1 ring-line">{customer.fullName}</p>
        {kind === 'OPENING_BALANCE' ? (
          <p className="text-brown-soft">Use para passar para o app o que este cliente já devia no caderno. Aparece no extrato como "Saldo anterior".</p>
        ) : (
          <fieldset>
            <legend className="mb-1.5 font-bold text-brown">Tipo de ajuste</legend>
            <div className="flex flex-wrap gap-2">
              <Chip selected={direction === 'CREDIT'} onClick={() => setDirection('CREDIT')}>
                Diminuir a dívida
              </Chip>
              <Chip selected={direction === 'DEBIT'} onClick={() => setDirection('DEBIT')}>
                Aumentar a dívida
              </Chip>
            </div>
          </fieldset>
        )}
        <MoneyField label="Valor" valueCents={amount} onChange={setAmount} autoFocus />
        {kind === 'OPENING_BALANCE' && (
          <TextField
            label="Data de referência"
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            hint="Até quando vai essa dívida do caderno."
          />
        )}
        <TextField
          label={kind === 'OPENING_BALANCE' ? 'Observação' : 'Motivo (obrigatório)'}
          placeholder={kind === 'OPENING_BALANCE' ? 'Ex.: caderno de outubro' : 'Ex.: desconto combinado, lanche não anotado'}
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
        />
        {error && (
          <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 font-semibold text-danger">
            {error}
          </p>
        )}
        <Button block className="min-h-14 text-lg" loading={busy} disabled={!valid} onClick={() => void save()}>
          Registrar {formatBRL(amount)}
        </Button>
      </main>
    </>
  );
}
