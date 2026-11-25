// "Pix copia e cola" estático (BR Code, padrão EMV do Banco Central).
// Estático = o mesmo código serve para vários pagamentos; o valor é opcional.
// O app só monta o texto: quem confere o pagamento é a Rose, no banco dela.

export interface BrCodeInput {
  key: string;
  receiverName: string;
  city: string;
  /** Opcional: sem valor, o cliente digita no banco. */
  amountCents?: number | null;
}

/** Campo EMV: id (2 dígitos) + tamanho (2 dígitos) + valor. */
function field(id: string, value: string): string {
  if (value.length > 99) throw new Error(`Campo ${id} do Pix grande demais.`);
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

/** Sem acentos e só caracteres simples, como pedem os bancos para nome e cidade. */
export function brCodeText(value: string, max: number): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), como no manual do BR Code. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function buildPixBrCode({ key, receiverName, city, amountCents }: BrCodeInput): string {
  const name = brCodeText(receiverName, 25);
  const town = brCodeText(city, 15);
  if (!key.trim() || !name || !town) throw new Error('Dados do Pix incompletos.');
  if (amountCents != null && (!Number.isSafeInteger(amountCents) || amountCents <= 0)) {
    throw new Error('Valor do Pix inválido.');
  }

  const parts = [
    field('00', '01'),
    field('26', field('00', 'br.gov.bcb.pix') + field('01', key.trim())),
    field('52', '0000'),
    field('53', '986'),
    amountCents != null ? field('54', `${Math.floor(amountCents / 100)}.${String(amountCents % 100).padStart(2, '0')}`) : '',
    field('58', 'BR'),
    field('59', name),
    field('60', town),
    field('62', field('05', '***')),
  ];
  const withoutCrc = `${parts.join('')}6304`;
  return withoutCrc + crc16(withoutCrc);
}
