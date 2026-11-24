// Busca rápida, sem diferenciar acentos nem maiúsculas: "joao" acha "João".
// Roda no aparelho (os cadastros são poucas centenas de linhas), então também
// funciona sem internet quando os dados estiverem no celular.

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

/** Cada palavra digitada precisa aparecer no texto (em qualquer ordem). */
export function matchesWords(haystack: string, query: string): boolean {
  const words = normalizeText(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const text = normalizeText(haystack);
  return words.every((w) => text.includes(w));
}

/**
 * Nome ou telefone. Com 3 dígitos ou mais, compara com o telefone sem o +55
 * (aceita digitar com ou sem DDD).
 */
export function matchesPerson(person: { name: string; phoneE164: string | null }, query: string): boolean {
  const q = query.trim();
  if (q === '') return true;
  const digits = digitsOf(q);
  if (digits.length >= 3 && digits.length === q.replace(/[\s()+-]/g, '').length) {
    const phone = person.phoneE164 ? digitsOf(person.phoneE164).replace(/^55/, '') : '';
    return phone.includes(digits.replace(/^55(?=\d{10,11}$)/, '').replace(/^0(?=\d{10,11}$)/, ''));
  }
  return matchesWords(person.name, q);
}

/** Ordena por relevância: começa com o termo > contém; depois alfabética. */
export function rankByName<T>(items: readonly T[], query: string, name: (item: T) => string): T[] {
  const q = normalizeText(query);
  const score = (item: T) => (q !== '' && normalizeText(name(item)).startsWith(q) ? 0 : 1);
  return [...items].sort((a, b) => score(a) - score(b) || name(a).localeCompare(name(b), 'pt-BR'));
}
