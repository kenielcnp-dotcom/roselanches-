import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from '@/app/config';
import type { Database } from './database.types';

export type Client = SupabaseClient<Database>;

/** Onde a sessão fica no aparelho (nome fixo: o app lê quando está sem internet). */
export const AUTH_STORAGE_KEY = 'ldr-auth';

// Só a chave publicável vai para o navegador; quem autoriza cada linha é o RLS.
export const supabase: Client = createClient<Database>(SUPABASE_URL || 'http://127.0.0.1:55321', SUPABASE_KEY || 'missing', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: AUTH_STORAGE_KEY,
  },
});
