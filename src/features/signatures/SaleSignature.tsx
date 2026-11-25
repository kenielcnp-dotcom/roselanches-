import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, PenLine } from 'lucide-react';
import { useLiveQuery } from '@/lib/offline/useLiveQuery';
import { supabase } from '@/lib/supabase/client';
import { signatureUrl } from '@/services/signatures';
import type { ConfirmationStatus } from '@/types/domain';
import { useSync } from '@/features/sync/SyncProvider';

/** Assinatura da venda: a do celular (ainda não enviada) ou a do servidor (URL de 2 minutos). */
export function SaleSignature({ saleId, confirmationStatus }: { saleId: string; confirmationStatus: ConfirmationStatus }) {
  const { db } = useSync();
  const local = useLiveQuery(() => db.localSignatures.where('saleId').equals(saleId).first(), [db, saleId]);
  const localUrl = useMemo(() => (local ? URL.createObjectURL(new Blob([local.png], { type: 'image/png' })) : null), [local]);
  useEffect(() => () => (localUrl ? URL.revokeObjectURL(localUrl) : undefined), [localUrl]);

  const remote = useQuery({
    queryKey: ['signature', saleId],
    queryFn: () => signatureUrl(supabase, saleId),
    enabled: !local && (confirmationStatus === 'SIGNED' || confirmationStatus === 'CANCELLED'),
    staleTime: 60_000,
  });

  const src = local ? localUrl : remote.data;
  if (!src) return null;

  return (
    <section aria-label="Assinatura do cliente" className="rounded-card bg-white p-4 ring-1 ring-line">
      <p className="flex items-center gap-2 font-extrabold text-brown">
        {local ? <Clock className="h-5 w-5 text-orange-darker" aria-hidden="true" /> : <PenLine className="h-5 w-5 text-orange" aria-hidden="true" />}
        {local
          ? 'Assinatura salva no celular, aguardando envio'
          : confirmationStatus === 'CANCELLED'
            ? 'Assinatura invalidada (venda cancelada)'
            : 'Assinatura do cliente'}
      </p>
      <img src={src} alt="Assinatura do cliente" className="mt-2 h-32 w-full rounded-xl bg-white object-contain ring-1 ring-line" />
      <p className="mt-2 text-xs text-brown-soft">
        A assinatura confirma que o cliente concordou com esta compra. Ela não serve para identificar a pessoa.
      </p>
    </section>
  );
}
