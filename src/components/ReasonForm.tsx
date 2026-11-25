import { useState } from 'react';
import { Button } from './Button';
import { TextField } from './Field';

interface Props {
  label: string;
  placeholder?: string;
  hint?: string;
  confirmLabel: string;
  onConfirm: (reason: string) => Promise<void> | void;
  onCancel: () => void;
  danger?: boolean;
}

/** Correções nunca apagam: pedem um motivo (mínimo 3 letras) que fica no histórico. */
export function ReasonForm({ label, placeholder, hint, confirmLabel, onConfirm, onCancel, danger = true }: Props) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const short = reason.trim().length < 3;
  return (
    <div className="space-y-3 rounded-card bg-white p-5 ring-1 ring-line">
      <TextField
        label={label}
        placeholder={placeholder}
        value={reason}
        maxLength={200}
        autoFocus
        onChange={(e) => setReason(e.target.value)}
        error={reason.length > 0 && short ? 'Escreva pelo menos 3 letras.' : undefined}
        hint={hint}
      />
      <Button
        variant={danger ? 'danger' : 'primary'}
        block
        loading={busy}
        disabled={short}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm(reason.trim());
          } finally {
            setBusy(false);
          }
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" block onClick={onCancel}>
        Voltar
      </Button>
    </div>
  );
}
