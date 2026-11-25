import { csvMoney, toCsv } from '@/domain/csv';

const BOM = String.fromCharCode(0xfeff);

describe('CSV para planilha', () => {
  it('separador ";", BOM, aspas quando precisa e linhas CRLF', () => {
    const out = toCsv(['Cliente', 'Valor'], [['Ana; Silva', csvMoney(1250)], ['Zé "Oficina"', csvMoney(5)]]);
    expect(out).toBe(`${BOM}Cliente;Valor\r\n"Ana; Silva";12,50\r\n"Zé ""Oficina""";0,05\r\n`);
  });

  it('neutraliza fórmulas e trata vazios', () => {
    expect(toCsv(['a', 'b'], [['=HYPERLINK("x")', null]])).toBe(`${BOM}a;b\r\n"'=HYPERLINK(""x"")";\r\n`);
    expect(csvMoney(-150)).toBe('-1,50');
    expect(csvMoney(null)).toBe('');
  });
});
