import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MessageSquareWarning } from 'lucide-react';
import { Button } from '@/components/Button';
import { ReasonForm } from '@/components/ReasonForm';
import { useToast } from '@/components/Toast';
import { formatDateTime } from '@/domain/period';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/supabase/errors';
import { fetchSaleOnlineResponse, resolveDispute } from '@/services/invites';

/** Para a Rose: o que o cliente respondeu pelo app sobre esta compra. */
export function SaleResponseSection({ saleId, onServer, isOwner }: { saleId: string; onServer: boolean; isOwner: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [resolving, setResolving] = useState(false);
  const response = useQuery({
    queryKey: ['sale-response', saleId],
    queryFn: () => fetchSaleOnlineResponse(supabase, saleId),
    enabled: onServer,
    retry: false,
  });
  const r = response.data;
  if (!r) return null;

  if (r.status === 'CONFIRMED_ONLINE') {
    return (
      <section aria-label="Resposta do cliente" className="flex gap-3 rounded-card bg-success/10 p-4 text-brown ring-1 ring-success/30">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" aria-hidden="true" />
        <p>
          <strong>O cliente confirmou esta compra pelo celular</strong> em {formatDateTime(new Date(r.receivedAt))}.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Contestação do cliente" className="space-y-3 rounded-card bg-peach p-4 text-brown ring-2 ring-orange/40">
      <p className="flex gap-2 font-extrabold">
        <MessageSquareWarning className="mt-0.5 h-6 w-6 shrink-0 text-orange-deep" aria-hidden="true" />
        {r.resolvedAt ? 'Contestação encerrada' : 'O cliente contestou esta compra'}
      </p>
      <p>
        "{r.disputeReason}" <span className="text-sm text-brown-soft">({formatDateTime(new Date(r.receivedAt))})</span>
      </p>
      {r.resolvedAt ? (
        <p className="text-sm">
          Encerrada em {formatDateTime(new Date(r.resolvedAt))}: {r.resolutionNote}
        </p>
      ) : (
        <>
          <p className="text-sm text-brown-soft">
            A compra continua na conta. Converse com o cliente: se a venda estiver errada, cancele e registre de novo; se estiver
            certa, encerre a contestação contando o que combinaram.
          </p>
          {isOwner &&
            (resolving ? (
              <ReasonForm
                label="O que foi combinado?"
                placeholder="Ex.: conversamos, a compra está certa"
                hint="O cliente vê esta resposta no app."
                confirmLabel="Encerrar contestação"
                danger={false}
                onCancel={() => setResolving(false)}
                onConfirm={async (note) => {
                  try {
                    await resolveDispute(supabase, saleId, note);
                    setResolving(false);
                    toast.show('Contestação encerrada.');
                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: ['sale-response', saleId] }),
                      queryClient.invalidateQueries({ queryKey: ['sales'] }),
                      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
                      queryClient.invalidateQueries({ queryKey: ['disputes'] }),
                    ]);
                  } catch (e) {
                    toast.show(errorMessage(e), 'error');
                  }
                }}
              />
            ) : (
              <Button variant="secondary" block onClick={() => setResolving(true)}>
                Encerrar contestação
              </Button>
            ))}
        </>
      )}
    </section>
  );
}
