import { brCodeText, buildPixBrCode, crc16 } from '@/domain/pix-brcode';

describe('Pix copia e cola (BR Code estático)', () => {
  it('CRC16-CCITT confere com o vetor padrão', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('reproduz o exemplo do manual do Banco Central', () => {
    expect(
      buildPixBrCode({ key: '123e4567-e12b-12d1-a456-426655440000', receiverName: 'Fulano de Tal', city: 'BRASILIA' }),
    ).toBe(
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D',
    );
  });

  it('valor opcional vai no campo 54, com ponto e duas casas', () => {
    const code = buildPixBrCode({ key: '+5565999887766', receiverName: 'Rose', city: 'Cuiaba', amountCents: 2550 });
    expect(code).toContain('540525.50');
    expect(code).toContain('0114+5565999887766');
    expect(code.slice(-4)).toBe(crc16(code.slice(0, -4)));
    expect(buildPixBrCode({ key: 'a@b.co', receiverName: 'Rose', city: 'Cuiaba', amountCents: 5 })).toContain('54040.05');
  });

  it('nome e cidade sem acento e no tamanho máximo', () => {
    expect(brCodeText('Rosângela da Conceição Ãçúcar Lanches', 25)).toBe('Rosangela da Conceicao Ac');
    expect(brCodeText('  Várzea   Grande ', 15)).toBe('Varzea Grande');
    const code = buildPixBrCode({ key: '12345678909', receiverName: 'José', city: 'Cuiabá' });
    expect(code).toContain('5904Jose');
    expect(code).toContain('6006Cuiaba');
  });

  it('recusa dados incompletos ou valor inválido', () => {
    expect(() => buildPixBrCode({ key: '', receiverName: 'Rose', city: 'Cuiaba' })).toThrow();
    expect(() => buildPixBrCode({ key: 'x@y.com', receiverName: '***', city: 'Cuiaba' })).toThrow();
    expect(() => buildPixBrCode({ key: 'x@y.com', receiverName: 'Rose', city: 'Cuiaba', amountCents: 0 })).toThrow();
    expect(() => buildPixBrCode({ key: 'x@y.com', receiverName: 'Rose', city: 'Cuiaba', amountCents: 1.5 })).toThrow();
  });
});
