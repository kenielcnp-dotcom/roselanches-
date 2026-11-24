import { randomUUID } from 'node:crypto';
import {
  customerFormSchema,
  establishmentFormSchema,
  findPossibleDuplicates,
  phoneToE164,
  productFormSchema,
} from '@/domain/registry';
import { matchesPerson, matchesWords, normalizeText, rankByName } from '@/domain/search';

describe('busca', () => {
  it('ignora acentos, maiúsculas e espaços extras', () => {
    expect(normalizeText('  JOÃO   Pereira ')).toBe('joao pereira');
    expect(matchesWords('João Pereira', 'joao')).toBe(true);
    expect(matchesWords('João Pereira', 'pere jo')).toBe(true);
    expect(matchesWords('João Pereira', 'maria')).toBe(false);
  });

  it('acha pelo telefone com ou sem DDD, com ou sem máscara', () => {
    const maria = { name: 'Maria Silva', phoneE164: '+5511987654321' };
    expect(matchesPerson(maria, '4321')).toBe(true);
    expect(matchesPerson(maria, '98765-4321')).toBe(true);
    expect(matchesPerson(maria, '(11) 98765-4321')).toBe(true);
    expect(matchesPerson(maria, '+55 11 98765-4321')).toBe(true);
    expect(matchesPerson(maria, '1234')).toBe(false);
    expect(matchesPerson({ name: 'Sem Telefone', phoneE164: null }, '4321')).toBe(false);
  });

  it('nome com número continua sendo busca por nome', () => {
    expect(matchesPerson({ name: 'Box 12 Carlos', phoneE164: null }, 'box 12')).toBe(true);
  });

  it('quem começa com o termo vem primeiro', () => {
    const list = ['Ana Mariana', 'Mariana Costa', 'Bruno Lima'];
    expect(rankByName(list, 'mari', (x) => x)[0]).toBe('Mariana Costa');
  });
});

describe('formulário de cliente', () => {
  const base = { fullName: 'Maria Silva', phone: '', notes: '', isActive: true, establishmentIds: [] };

  it('exige nome e sobrenome (ou apelido que diferencie)', () => {
    expect(customerFormSchema.safeParse({ ...base, fullName: 'Maria' }).success).toBe(false);
    expect(customerFormSchema.safeParse({ ...base, fullName: 'Zé da Oficina' }).success).toBe(true);
  });

  it('telefone é opcional, mas se vier precisa ser válido', () => {
    expect(customerFormSchema.safeParse(base).success).toBe(true);
    const bad = customerFormSchema.safeParse({ ...base, phone: '(00) 1234' });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toMatch(/Telefone incompleto|DDD/);
    expect(phoneToE164('(65) 99988-7766')).toBe('+5565999887766');
    expect(phoneToE164('')).toBeNull();
  });

  it('avisa sobre possível cadastro duplicado (telefone ou nome igual)', () => {
    const others = [
      { id: randomUUID(), fullName: 'Maria Silva', phoneE164: null },
      { id: randomUUID(), fullName: 'Outra Pessoa', phoneE164: '+5511987654321' },
    ];
    const found = findPossibleDuplicates({ id: null, fullName: 'MARIA  silva', phoneE164: '+5511987654321' }, others);
    expect(found.map((d) => d.reason).sort()).toEqual(['name', 'phone']);
    expect(findPossibleDuplicates({ id: others[0]!.id, fullName: 'Maria Silva', phoneE164: null }, others)).toEqual([]);
  });
});

describe('formulários de estabelecimento e produto', () => {
  it('estabelecimento precisa de nome com 2 a 60 letras', () => {
    const ok = { name: 'Mercado Central', nickname: 'Mercado', address: '', notes: '', isActive: true };
    expect(establishmentFormSchema.safeParse(ok).success).toBe(true);
    expect(establishmentFormSchema.safeParse({ ...ok, name: 'M' }).success).toBe(false);
    expect(establishmentFormSchema.safeParse({ ...ok, nickname: 'x'.repeat(31) }).success).toBe(false);
  });

  it('produto precisa de preço inteiro em centavos e positivo', () => {
    const ok = { name: 'Coxinha', priceCents: 650, category: 'Salgados', isActive: true };
    expect(productFormSchema.safeParse(ok).success).toBe(true);
    expect(productFormSchema.safeParse({ ...ok, priceCents: 0 }).success).toBe(false);
    expect(productFormSchema.safeParse({ ...ok, priceCents: 6.5 }).success).toBe(false);
    expect(productFormSchema.safeParse({ ...ok, priceCents: -100 }).success).toBe(false);
  });
});
