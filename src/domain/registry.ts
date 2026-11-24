// Formulários dos cadastros (estabelecimento, cliente e produto). Os mesmos
// limites existem como CHECK no banco (migração 0200); aqui a Rose vê o
// problema antes de enviar.
import { z } from 'zod';
import { normalizePhone } from './phone';
import { hasControlChars } from './sale';
import { normalizeText } from './search';

const noControl = (v: string) => !hasControlChars(v);

const name = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `Informe ${label}.`)
    .max(max, `No máximo ${max} caracteres.`)
    .refine(noControl, 'Há caracteres inválidos.');

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `No máximo ${max} caracteres.`)
    .refine(noControl, 'Há caracteres inválidos.');

// -----------------------------------------------------------------------------
// Estabelecimento
// -----------------------------------------------------------------------------
export const establishmentFormSchema = z.object({
  name: name(2, 60, 'o nome do lugar'),
  nickname: optionalText(30),
  address: z.string().trim().max(200, 'No máximo 200 caracteres.'),
  notes: z.string().trim().max(300, 'No máximo 300 caracteres.'),
  isActive: z.boolean(),
});
export type EstablishmentForm = z.infer<typeof establishmentFormSchema>;

// -----------------------------------------------------------------------------
// Cliente
// -----------------------------------------------------------------------------
export const customerFormSchema = z.object({
  fullName: name(2, 80, 'o nome completo').refine(
    (v) => v.split(/\s+/).length >= 2,
    'Use nome e sobrenome (ou um apelido que diferencie, como "Zé da Oficina").',
  ),
  phone: z
    .string()
    .trim()
    .superRefine((v, ctx) => {
      if (v === '') return;
      const r = normalizePhone(v);
      if (!r.ok) ctx.addIssue({ code: 'custom', message: r.message });
    }),
  notes: z.string().trim().max(300, 'No máximo 300 caracteres.'),
  isActive: z.boolean(),
  establishmentIds: z.array(z.uuid()).max(50),
});
export type CustomerForm = z.infer<typeof customerFormSchema>;

/** Telefone do formulário em E.164, ou null se vazio. */
export function phoneToE164(phone: string): string | null {
  const r = normalizePhone(phone);
  return r.ok ? r.e164 : null;
}

export interface PossibleDuplicate {
  id: string;
  fullName: string;
  reason: 'phone' | 'name';
}

/**
 * Avisos (não bloqueiam): outro cliente com o mesmo telefone ou o mesmo nome.
 * Mesma pessoa em dois lugares deve ser UM cadastro com dois estabelecimentos.
 */
export function findPossibleDuplicates(
  form: { id: string | null; fullName: string; phoneE164: string | null },
  customers: readonly { id: string; fullName: string; phoneE164: string | null }[],
): PossibleDuplicate[] {
  const name = normalizeText(form.fullName);
  const out: PossibleDuplicate[] = [];
  for (const c of customers) {
    if (c.id === form.id) continue;
    if (form.phoneE164 && c.phoneE164 === form.phoneE164) out.push({ id: c.id, fullName: c.fullName, reason: 'phone' });
    else if (name !== '' && normalizeText(c.fullName) === name) out.push({ id: c.id, fullName: c.fullName, reason: 'name' });
  }
  return out;
}

// -----------------------------------------------------------------------------
// Produto
// -----------------------------------------------------------------------------
export const PRODUCT_MAX_CENTS = 10_000_000;

export const productFormSchema = z.object({
  name: name(2, 60, 'o nome do produto'),
  priceCents: z
    .number()
    .int('Use no máximo duas casas decimais.')
    .min(1, 'Informe o preço.')
    .max(PRODUCT_MAX_CENTS, 'Preço alto demais. Verifique o valor antes de continuar.'),
  category: optionalText(30),
  isActive: z.boolean(),
});
export type ProductForm = z.infer<typeof productFormSchema>;

/** Converte "" em null para colunas opcionais. */
export function emptyToNull(value: string): string | null {
  const v = value.trim();
  return v === '' ? null : v;
}
