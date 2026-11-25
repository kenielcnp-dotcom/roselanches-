// CSV para abrir no Excel/Planilhas em português: separador ";", vírgula decimal
// e marca BOM para os acentos aparecerem certos.

export type CsvCell = string | number | null | undefined;

const BOM = String.fromCharCode(0xfeff);

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Evita fórmula injetada ao abrir no Excel (=, +, -, @ no começo).
  if (/^[=+\-@\t\r]/.test(text) && typeof value === 'string') text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return `${BOM}${[header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`;
}

/** Centavos como número de planilha: 123456 → "1234,56". */
export function csvMoney(cents: number | null): string {
  if (cents === null) return '';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}
