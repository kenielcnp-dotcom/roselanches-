import { formatPhone, maskPhone, normalizePhone, whatsappLink } from '@/domain/phone';

describe('telefone', () => {
  it.each([
    ['(11) 98765-4321', '+5511987654321'],
    ['11987654321', '+5511987654321'],
    ['+55 11 98765-4321', '+5511987654321'],
    ['011 98765-4321', '+5511987654321'],
    ['(21) 3456-7890', '+552134567890'],
  ])('normaliza %s', (input, e164) => {
    expect(normalizePhone(input)).toEqual({ ok: true, e164 });
  });

  it.each([
    ['', 'Informe'],
    ['98765-4321', 'incompleto'],
    ['(20) 98765-4321', 'DDD 20'],
    ['(11) 88765-4321', 'começar com 9'],
    ['(11) 8765-4321', '9 dígitos'],
  ])('recusa %s', (input, fragment) => {
    const result = normalizePhone(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(fragment);
  });

  it('o formato aceito é o mesmo que o banco aceita', () => {
    const dbPattern = /^\+55[1-9]{2}(9[0-9]{8}|[2-5][0-9]{7})$/; // migração 0200
    for (const input of ['11987654321', '2134567890', '(85) 99999-0000']) {
      const r = normalizePhone(input);
      expect(r.ok && dbPattern.test(r.e164)).toBe(true);
    }
  });

  it('formata, mascara e gera link do WhatsApp', () => {
    expect(formatPhone('+5511987654321')).toBe('(11) 98765-4321');
    expect(maskPhone('+5511987654321')).toBe('(11) •••••-4321');
    expect(maskPhone('+552134567890')).toBe('(21) ••••-7890');
    expect(whatsappLink('+5511987654321', 'Olá!')).toBe('https://wa.me/5511987654321?text=Ol%C3%A1!');
  });
});
