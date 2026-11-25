import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QrCode } from 'lucide-react';
import { Button } from '@/components/Button';
import { SelectField, TextField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { formatPixKey, normalizePixKey, PIX_KEY_LABELS, type PixKeyType } from '@/domain/pix';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/supabase/errors';
import { updatePixSettings, type PixSettings } from '@/services/settings';

const KEY_HINTS: Record<PixKeyType, string> = {
  CPF: 'Só os números, ou com pontos e traço.',
  CNPJ: 'Só os números, ou com pontos, barra e traço.',
  EMAIL: 'O e-mail cadastrado como chave no seu banco.',
  PHONE: 'Com DDD, ex.: (65) 99988-7766.',
  EVP: 'Copie a chave aleatória no app do seu banco.',
};

/** Chave Pix que o cliente vê para pagar. Só a dona altera. */
export function PixSection({ businessId, canEdit, current }: { businessId: string; canEdit: boolean; current: PixSettings | null }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [keyType, setKeyType] = useState<PixKeyType>(current?.keyType ?? 'PHONE');
  const [key, setKey] = useState(current ? formatPixKey(current.keyType, current.key) : '');
  const [receiver, setReceiver] = useState(current?.receiverName ?? '');
  const [city, setCity] = useState(current?.city ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (pix: PixSettings | null) => updatePixSettings(supabase, businessId, pix),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', businessId] }),
  });

  const normalized = key.trim() === '' ? null : normalizePixKey(keyType, key);
  const keyError = normalized && !normalized.ok ? normalized.message : undefined;
  const receiverError = receiver.trim().length > 0 && receiver.trim().length < 2 ? 'Nome muito curto.' : undefined;
  const cityError = city.trim().length > 0 && city.trim().length < 2 ? 'Cidade muito curta.' : undefined;
  const valid = !!normalized?.ok && receiver.trim().length >= 2 && receiver.trim().length <= 60 && city.trim().length >= 2 && city.trim().length <= 30;

  const submit = async () => {
    if (!normalized?.ok) return;
    setError(null);
    try {
      await save.mutateAsync({ keyType, key: normalized.key, receiverName: receiver, city });
      setKey(formatPixKey(keyType, normalized.key));
      toast.show('Pix salvo. Os clientes já veem estes dados para pagar.');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <section aria-labelledby="pix" className="space-y-4 rounded-card bg-white/90 p-5 shadow-soft ring-1 ring-line">
      <h2 id="pix" className="flex items-center gap-2 text-lg font-extrabold text-brown">
        <QrCode className="h-5 w-5 text-orange" aria-hidden="true" />
        Pix para receber dos clientes
      </h2>
      <p className="text-sm text-brown-soft">
        O cliente vê esta chave para pagar pelo app do banco dele. O pagamento só abate a dívida quando você confirmar em Recebimentos.
      </p>
      <fieldset disabled={!canEdit} className="space-y-4">
        <SelectField
          label="Tipo de chave"
          value={keyType}
          onChange={(e) => setKeyType(e.target.value as PixKeyType)}
          options={(Object.keys(PIX_KEY_LABELS) as PixKeyType[]).map((t) => ({ value: t, label: PIX_KEY_LABELS[t] }))}
        />
        <TextField label="Chave Pix" value={key} onChange={(e) => setKey(e.target.value)} error={keyError} hint={KEY_HINTS[keyType]} autoComplete="off" />
        <TextField
          label="Nome de quem recebe"
          value={receiver}
          maxLength={60}
          onChange={(e) => setReceiver(e.target.value)}
          error={receiverError}
          hint="Como aparece no banco, para o cliente conferir."
        />
        <TextField label="Cidade" value={city} maxLength={30} onChange={(e) => setCity(e.target.value)} error={cityError} />
      </fieldset>
      {error && (
        <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 font-semibold text-danger">
          {error}
        </p>
      )}
      {canEdit && (
        <Button block loading={save.isPending} disabled={!valid} onClick={() => void submit()}>
          Salvar Pix
        </Button>
      )}
      {!canEdit && <p className="text-sm text-brown-soft">Só a dona do negócio altera o Pix.</p>}
    </section>
  );
}
