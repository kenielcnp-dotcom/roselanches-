// Vetor de teste do resumo canônico v1, usado nos testes unitários (TS) e nos
// de integração (o mesmo conteúdo gravado no banco precisa dar o mesmo hash).
import type { CanonicalSale } from '@/domain/canonical';

export const ITEMS_SALE: CanonicalSale = {
  saleId: '0b6a8c1e-5f2d-4c3b-9a7e-1d2c3b4a5f60',
  customerId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  establishmentId: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
  occurredAt: '2026-11-23T13:45:12.345Z',
  mode: 'ITEMS',
  items: [
    {
      productId: '3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b',
      quantity: 2,
      unitPriceCents: 650,
      subtotalCents: 1300,
      productName: 'Coxinha de frango',
    },
    {
      productId: '4f5a6b7c-8d9e-4fa0-9b2c-3d4e5f6a7b8c',
      quantity: 1,
      unitPriceCents: 700,
      subtotalCents: 700,
      productName: 'Suco de maracujá',
    },
  ],
  description: null,
  totalCents: 2000,
};

export const ITEMS_SALE_TEXT = [
  'LDR-SALE-CONFIRMATION|1',
  'sale:0b6a8c1e-5f2d-4c3b-9a7e-1d2c3b4a5f60',
  'customer:1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  'establishment:2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
  'occurred_at_ms:1795441512345',
  'mode:ITEMS',
  'item:3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b|2|650|1300|Coxinha de frango',
  'item:4f5a6b7c-8d9e-4fa0-9b2c-3d4e5f6a7b8c|1|700|700|Suco de maracujá',
  'total:2000',
  'terms:v1',
].join('\n');

export const AMOUNT_SALE: CanonicalSale = {
  saleId: '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d',
  customerId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  establishmentId: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
  occurredAt: '2026-11-22T20:10:00.000Z',
  mode: 'AMOUNT',
  items: [],
  description: 'Lanches da tarde — pão de queijo',
  totalCents: 1850,
};

export const AMOUNT_SALE_TEXT = [
  'LDR-SALE-CONFIRMATION|1',
  'sale:5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d',
  'customer:1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  'establishment:2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
  'occurred_at_ms:1795378200000',
  'mode:AMOUNT',
  'description:Lanches da tarde — pão de queijo',
  'total:1850',
  'terms:v1',
].join('\n');
