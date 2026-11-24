// Consultas e gravações dos cadastros, compartilhadas pelas telas de
// estabelecimentos, clientes, produtos e pela tela inicial.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { listCustomers, saveCustomer } from '@/services/customers';
import { fetchDashboard } from '@/services/dashboard';
import {
  createEstablishment,
  linkCustomer,
  listEstablishments,
  unlinkCustomer,
  updateEstablishment,
} from '@/services/establishments';
import { createProduct, listProducts, updateProduct } from '@/services/products';
import { fetchSettings, updateSalesSettings, type SalesSettingsForm } from '@/services/settings';
import type { CustomerForm, EstablishmentForm, ProductForm } from '@/domain/registry';

export const queryKeys = {
  dashboard: ['dashboard'] as const,
  establishments: ['establishments'] as const,
  customers: ['customers'] as const,
  products: ['products'] as const,
  settings: (businessId: string) => ['settings', businessId] as const,
};

export function useDashboard() {
  return useQuery({ queryKey: queryKeys.dashboard, queryFn: () => fetchDashboard(supabase) });
}

export function useEstablishments() {
  return useQuery({ queryKey: queryKeys.establishments, queryFn: () => listEstablishments(supabase) });
}

export function useCustomers() {
  return useQuery({ queryKey: queryKeys.customers, queryFn: () => listCustomers(supabase) });
}

export function useProducts() {
  return useQuery({ queryKey: queryKeys.products, queryFn: () => listProducts(supabase) });
}

export function useSettings(businessId: string) {
  return useQuery({ queryKey: queryKeys.settings(businessId), queryFn: () => fetchSettings(supabase, businessId) });
}

/** Depois de mexer em clientes ou vínculos, contagens e saldos mudam junto. */
function useInvalidateRegistry() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.customers }),
      qc.invalidateQueries({ queryKey: queryKeys.establishments }),
      qc.invalidateQueries({ queryKey: queryKeys.dashboard }),
    ]);
}

export function useSaveEstablishment() {
  const invalidate = useInvalidateRegistry();
  return useMutation({
    mutationFn: ({ id, form, isNew }: { id: string; form: EstablishmentForm; isNew: boolean }) =>
      isNew ? createEstablishment(supabase, id, form) : updateEstablishment(supabase, id, form),
    onSuccess: invalidate,
  });
}

export function useSaveCustomer() {
  const invalidate = useInvalidateRegistry();
  return useMutation({
    mutationFn: ({ id, form }: { id: string; form: CustomerForm }) => saveCustomer(supabase, id, form),
    onSuccess: invalidate,
  });
}

export function useLinkCustomer() {
  const invalidate = useInvalidateRegistry();
  return useMutation({
    mutationFn: ({ establishmentId, customerId, linked }: { establishmentId: string; customerId: string; linked: boolean }) =>
      linked ? linkCustomer(supabase, establishmentId, customerId) : unlinkCustomer(supabase, establishmentId, customerId),
    onSuccess: invalidate,
  });
}

export function useSaveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, form, isNew }: { id: string; form: ProductForm; isNew: boolean }) =>
      isNew ? createProduct(supabase, id, form) : updateProduct(supabase, id, form),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.products }),
  });
}

export function useSaveSalesSettings(businessId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: SalesSettingsForm) => updateSalesSettings(supabase, businessId, form),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.settings(businessId) }),
        qc.invalidateQueries({ queryKey: queryKeys.dashboard }),
      ]),
  });
}
