import { keyProblem } from '@/app/config';
import { toAppError } from '@/lib/supabase/errors';

describe('chave do Supabase no navegador', () => {
  it('aceita a chave publicável', () => {
    expect(keyProblem('sb_publishable_abc123')).toBeNull();
  });

  it('recusa chaves administrativas', () => {
    expect(keyProblem('sb_secret_abc123')).toMatch(/ADMINISTRATIVA/);
    expect(keyProblem('sbp_abc123')).toMatch(/ADMINISTRATIVA/);
    const payload = btoa(JSON.stringify({ role: 'service_role' })).replace(/=+$/, '');
    expect(keyProblem(`eyJhbGciOiJIUzI1NiJ9.${payload}.assinatura`)).toMatch(/ADMINISTRATIVA/);
  });
});

describe('tradução de erros', () => {
  it('falha de rede é transitória', () => {
    const e = toAppError(new TypeError('Failed to fetch'));
    expect(e.kind).toBe('network');
    expect(e.transient).toBe(true);
  });

  it('erro das nossas funções vira mensagem em português e é permanente', () => {
    const e = toAppError({ code: '23514', message: 'LDR_SALE_ITEMS_TOTAL' });
    expect(e.code).toBe('LDR_SALE_ITEMS_TOTAL');
    expect(e.message).toBe('O total da venda não confere com os produtos.');
    expect(e.transient).toBe(false);
  });

  it('sessão expirada é identificada', () => {
    expect(toAppError({ code: 'PGRST301', message: 'JWT expired' }).kind).toBe('session');
    expect(toAppError({ status: 401, message: 'x' }).kind).toBe('session');
  });

  it('servidor fora do ar e excesso de pedidos são transitórios', () => {
    expect(toAppError({ status: 503, message: 'x' }).transient).toBe(true);
    expect(toAppError({ status: 429, message: 'x' }).transient).toBe(true);
  });
});
