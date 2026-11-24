// Fusos do Brasil aceitos pelo banco (business_settings.timezone, migração 0700).
// A lista precisa ser IGUAL à do CHECK no banco; o teste de integração confere.

export interface BrazilTimeZone {
  id: string;
  label: string;
}

export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

export const BRAZIL_TIME_ZONES: readonly BrazilTimeZone[] = [
  { id: 'America/Sao_Paulo', label: 'Brasília (SP, RJ, MG, ES, Sul, GO, DF)' },
  { id: 'America/Cuiaba', label: 'Mato Grosso (Cuiabá)' },
  { id: 'America/Campo_Grande', label: 'Mato Grosso do Sul' },
  { id: 'America/Manaus', label: 'Amazonas (Manaus)' },
  { id: 'America/Eirunepe', label: 'Amazonas, oeste (Eirunepé)' },
  { id: 'America/Porto_Velho', label: 'Rondônia' },
  { id: 'America/Boa_Vista', label: 'Roraima' },
  { id: 'America/Rio_Branco', label: 'Acre' },
  { id: 'America/Belem', label: 'Pará, leste (Belém) e Amapá' },
  { id: 'America/Santarem', label: 'Pará, oeste (Santarém)' },
  { id: 'America/Araguaina', label: 'Tocantins' },
  { id: 'America/Fortaleza', label: 'Ceará, RN, PI e MA' },
  { id: 'America/Recife', label: 'Pernambuco e Paraíba' },
  { id: 'America/Maceio', label: 'Alagoas e Sergipe' },
  { id: 'America/Bahia', label: 'Bahia' },
  { id: 'America/Noronha', label: 'Fernando de Noronha' },
];

const IDS = new Set(BRAZIL_TIME_ZONES.map((z) => z.id));

export function isBrazilTimeZone(value: string): boolean {
  return IDS.has(value);
}

export function timeZoneLabel(id: string): string {
  return BRAZIL_TIME_ZONES.find((z) => z.id === id)?.label ?? id;
}

/** Fuso do aparelho, se for um dos aceitos. */
export function deviceTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isBrazilTimeZone(tz) ? tz : null;
  } catch {
    return null;
  }
}
