import { formatPixKey, normalizePixKey } from '@/domain/pix';

describe('chave Pix', () => {
  it('CPF e CNPJ com dígito verificador', () => {
    expect(normalizePixKey('CPF', '123.456.789-09')).toEqual({ ok: true, key: '12345678909' });
    expect(normalizePixKey('CPF', '123.456.789-00').ok).toBe(false);
    expect(normalizePixKey('CPF', '111.111.111-11').ok).toBe(false);
    expect(normalizePixKey('CNPJ', '11.222.333/0001-81')).toEqual({ ok: true, key: '11222333000181' });
    expect(normalizePixKey('CNPJ', '11.222.333/0001-82').ok).toBe(false);
  });

  it('e-mail, celular e chave aleatória', () => {
    expect(normalizePixKey('EMAIL', ' Rose@Exemplo.com ')).toEqual({ ok: true, key: 'rose@exemplo.com' });
    expect(normalizePixKey('EMAIL', 'rose@').ok).toBe(false);
    expect(normalizePixKey('PHONE', '(65) 99988-7766')).toEqual({ ok: true, key: '+5565999887766' });
    expect(normalizePixKey('EVP', '123E4567-E89B-12D3-A456-426614174000')).toEqual({
      ok: true,
      key: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(normalizePixKey('EVP', 'abc').ok).toBe(false);
  });

  it('formata CPF e CNPJ para mostrar', () => {
    expect(formatPixKey('CPF', '12345678909')).toBe('123.456.789-09');
    expect(formatPixKey('CNPJ', '11222333000181')).toBe('11.222.333/0001-81');
    expect(formatPixKey('EMAIL', 'rose@exemplo.com')).toBe('rose@exemplo.com');
  });
});
