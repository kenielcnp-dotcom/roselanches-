import { render, screen } from '@testing-library/react';
import { SyncPill } from '@/components/SyncPill';

describe('pílula de sincronização', () => {
  it('mostra sincronizado com a hora da última atualização (Brasília)', () => {
    render(<SyncPill state={{ kind: 'synced', at: new Date('2026-11-23T13:23:00Z') }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Sincronizado');
    expect(screen.getByRole('status')).toHaveTextContent('Atualizado às 10:23');
  });

  it('distingue vendas aguardando envio', () => {
    render(<SyncPill state={{ kind: 'pending', sales: 2, signatures: 1 }} />);
    expect(screen.getByRole('status')).toHaveTextContent('2 vendas e 1 assinatura');
  });

  it('sem internet avisa que as vendas ficam no celular', () => {
    render(<SyncPill state={{ kind: 'offline', pending: 3 }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Sem internet');
    expect(screen.getByRole('status')).toHaveTextContent('3 vendas no celular');
  });

  it('falha fica visível', () => {
    render(<SyncPill state={{ kind: 'failed', count: 1 }} />);
    expect(screen.getByRole('status')).toHaveTextContent('1 venda não enviada');
  });
});
