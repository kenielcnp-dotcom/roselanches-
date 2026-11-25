// Chave Pix da Rose: tipos, validação (com dígitos verificadores) e formato
// guardado no banco (igual ao CHECK da migração 1100).
import { normalizePhone } from './phone';

export type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';

export const PIX_KEY_LABELS: Record<PixKeyType, string> = {
  CPF: 'CPF',
  CNPJ: 'CNPJ',
  EMAIL: 'E-mail',
  PHONE: 'Celular',
  EVP: 'Chave aleatória',
};

function cpfValid(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
}

function cnpjValid(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const digit = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return digit(12) === Number(d[12]) && digit(13) === Number(d[13]);
}

export type PixKeyResult = { ok: true; key: string } | { ok: false; message: string };

/** Normaliza a chave como fica guardada; devolve mensagem simples se não servir. */
export function normalizePixKey(type: PixKeyType, input: string): PixKeyResult {
  const raw = input.trim();
  switch (type) {
    case 'CPF': {
      const d = raw.replace(/\D/g, '');
      return cpfValid(d) ? { ok: true, key: d } : { ok: false, message: 'CPF inválido. Confira os 11 números.' };
    }
    case 'CNPJ': {
      const d = raw.replace(/\D/g, '');
      return cnpjValid(d) ? { ok: true, key: d } : { ok: false, message: 'CNPJ inválido. Confira os 14 números.' };
    }
    case 'EMAIL': {
      const e = raw.toLowerCase();
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 77 ? { ok: true, key: e } : { ok: false, message: 'E-mail inválido.' };
    }
    case 'PHONE': {
      const r = normalizePhone(raw);
      return r.ok ? { ok: true, key: r.e164 } : { ok: false, message: r.message };
    }
    case 'EVP': {
      const k = raw.toLowerCase();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(k)
        ? { ok: true, key: k }
        : { ok: false, message: 'Chave aleatória inválida. Copie do app do seu banco.' };
    }
  }
}

/** Chave para mostrar ao cliente: CPF e CNPJ com pontuação. */
export function formatPixKey(type: PixKeyType, key: string): string {
  if (type === 'CPF' && key.length === 11) return `${key.slice(0, 3)}.${key.slice(3, 6)}.${key.slice(6, 9)}-${key.slice(9)}`;
  if (type === 'CNPJ' && key.length === 14)
    return `${key.slice(0, 2)}.${key.slice(2, 5)}.${key.slice(5, 8)}/${key.slice(8, 12)}-${key.slice(12)}`;
  return key;
}
