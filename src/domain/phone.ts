// Telefones brasileiros em E.164 (+55 DDD número). O banco confere o formato;
// aqui também se confere se o DDD existe.
//   celular: +55 DD 9XXXX-XXXX (11 dígitos depois do +55)
//   fixo:    +55 DD [2-5]XXX-XXXX (10 dígitos depois do +55)

const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46,
  47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85,
  86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export type PhoneResult = { ok: true; e164: string } | { ok: false; message: string };

/** Aceita "(11) 98765-4321", "11987654321", "+55 11 98765-4321", "011 98765-4321"… */
export function normalizePhone(input: string): PhoneResult {
  let digits = input.replace(/\D/g, '');
  if (digits === '') return { ok: false, message: 'Informe o telefone.' };

  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
  else if ((digits.length === 11 || digits.length === 12) && digits.startsWith('0')) digits = digits.slice(1);

  if (digits.length !== 10 && digits.length !== 11) {
    return { ok: false, message: 'Telefone incompleto. Use DDD + número, por exemplo (11) 98765-4321.' };
  }

  const ddd = Number(digits.slice(0, 2));
  if (!VALID_DDDS.has(ddd)) return { ok: false, message: `DDD ${digits.slice(0, 2)} não existe.` };

  const local = digits.slice(2);
  if (local.length === 9 && !local.startsWith('9')) {
    return { ok: false, message: 'Celular precisa começar com 9 depois do DDD.' };
  }
  if (local.length === 8 && !/^[2-5]/.test(local)) {
    return { ok: false, message: 'Número incompleto. Celulares têm 9 dígitos depois do DDD.' };
  }
  return { ok: true, e164: `+55${digits}` };
}

function parts(e164: string): { ddd: string; local: string } | null {
  const m = /^\+55(\d{2})(\d{8,9})$/.exec(e164);
  return m ? { ddd: m[1]!, local: m[2]! } : null;
}

/** "+5511987654321" → "(11) 98765-4321". */
export function formatPhone(e164: string): string {
  const p = parts(e164);
  if (!p) return e164;
  const cut = p.local.length - 4;
  return `(${p.ddd}) ${p.local.slice(0, cut)}-${p.local.slice(cut)}`;
}

/** Telefone parcialmente oculto para conferência: "(11) •••••-4321". */
export function maskPhone(e164: string): string {
  const p = parts(e164);
  if (!p) return '';
  const cut = p.local.length - 4;
  return `(${p.ddd}) ${'•'.repeat(cut)}-${p.local.slice(cut)}`;
}

/** Link do WhatsApp com mensagem pronta (o número precisa estar em E.164). */
export function whatsappLink(e164: string, message: string): string {
  return `https://wa.me/${e164.replace(/^\+/, '')}?text=${encodeURIComponent(message)}`;
}

/** WhatsApp sem destinatário: a pessoa escolhe para quem mandar. */
export function whatsappShareLink(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
