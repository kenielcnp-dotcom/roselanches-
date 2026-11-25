// Consultas do portal. Ficam só na memória (nada financeiro do cliente é
// gravado no aparelho) e levam o id do cadastro na chave, para uma conta
// nunca ver o cache de outra no mesmo celular.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  confirmPortalSale,
  disputePortalSale,
  fetchPortalPix,
  fetchPortalSale,
  fetchPortalStatement,
  fetchPortalSummary,
  notifyPayment,
  type NotifyPaymentInput,
  type PortalFilter,
  type SaleResponseInput,
} from '@/services/portal';

const PAGE = 20;

function usePortalKey(): string {
  const { identity } = useAuth();
  return identity?.customer?.customerId ?? 'sem-cadastro';
}

export function usePortalSummary() {
  const me = usePortalKey();
  return useQuery({ queryKey: ['portal', me, 'summary'], queryFn: () => fetchPortalSummary(supabase) });
}

export function usePortalStatement(filter: PortalFilter, establishmentId: string | null) {
  const me = usePortalKey();
  return useInfiniteQuery({
    queryKey: ['portal', me, 'statement', filter, establishmentId],
    initialPageParam: null as { beforeAt: string; beforeId: string } | null,
    queryFn: ({ pageParam }) => fetchPortalStatement(supabase, filter, establishmentId, pageParam, PAGE),
    getNextPageParam: (last) => {
      const tail = last[last.length - 1];
      return last.length === PAGE && tail ? { beforeAt: tail.occurredAt, beforeId: tail.id } : undefined;
    },
  });
}

export function usePortalSale(saleId: string) {
  const me = usePortalKey();
  return useQuery({ queryKey: ['portal', me, 'sale', saleId], queryFn: () => fetchPortalSale(supabase, saleId) });
}

export function usePortalPix() {
  const me = usePortalKey();
  return useQuery({ queryKey: ['portal', me, 'pix'], queryFn: () => fetchPortalPix(supabase), staleTime: 5 * 60_000 });
}

function useRefreshPortal() {
  const queryClient = useQueryClient();
  const me = usePortalKey();
  return () => queryClient.invalidateQueries({ queryKey: ['portal', me] });
}

export function useConfirmSale() {
  const refresh = useRefreshPortal();
  return useMutation({ mutationFn: (input: SaleResponseInput) => confirmPortalSale(supabase, input), onSettled: refresh });
}

export function useDisputeSale() {
  const refresh = useRefreshPortal();
  return useMutation({
    mutationFn: (input: SaleResponseInput & { reason: string }) => disputePortalSale(supabase, input),
    onSettled: refresh,
  });
}

export function useNotifyPayment() {
  const refresh = useRefreshPortal();
  return useMutation({ mutationFn: (input: NotifyPaymentInput) => notifyPayment(supabase, input), onSettled: refresh });
}
