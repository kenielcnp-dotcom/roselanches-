# Regras de negócio

## Dinheiro

- Todo valor é um inteiro em centavos, no app (`src/domain/money.ts`) e no banco (`bigint`). Nunca ponto flutuante.
- `parseBRL` lê "18,50", "R$ 1.256,50" etc. sem passar por float; aceita no máximo duas casas decimais.

## Venda

Toda venda tem: UUID gerado no celular, cliente, estabelecimento, modo, período, data e hora da compra, total em centavos, operador, tipo de pagamento, estado da venda e estado de confirmação do cliente. O estado de sincronização existe só no celular.

| Modo | Regras |
|---|---|
| Por produtos (`ITEMS`) | pelo menos um produto; quantidade inteira entre 1 e o limite configurado (padrão 50); cada item guarda nome e preço **do momento da venda**; total = soma dos subtotais |
| Valor direto (`AMOUNT`) | valor maior que zero, no máximo duas casas; descrição obrigatória de até 150 caracteres |

- Limite por venda configurável (padrão R$ 500,00; teto absoluto R$ 100.000,00). Acima dele: "Verifique o valor antes de continuar."
- Períodos: manhã (5h–11h59), tarde (12h–17h59), noite (18h–4h59). O app sugere pela hora.
- **Fiada** (`CREDIT`) gera dívida. **Paga na hora** (`PAID_NOW`) grava a venda e o pagamento juntos, com líquido zero.
- Depois de gravada, a venda não muda. Correção = cancelamento com motivo (e, se for o caso, nova venda).

### Fluxo de venda

Lugar atual (lembrado no aparelho) → cliente (busca prioriza o lugar; "Buscar em todos os estabelecimentos"; aviso para cliente de fora, que não bloqueia) → Produtos ou Valor direto (o último modo usado fica lembrado) → conferência (cliente com telefone mascarado, lugar, data, período, itens ou descrição, total, fiado ou pago agora em dinheiro/Pix) → "Salvar venda". A venda é gravada no celular primeiro ("Venda salva no celular.") e enviada em seguida ("Venda sincronizada."). Tudo funciona sem internet, a partir da cópia do catálogo no celular.

Cancelar exige motivo e vai pela mesma fila; a venda continua no histórico como cancelada.

## Estabelecimentos e grupos

- Um estabelecimento tem vários clientes e um cliente pode estar em vários estabelecimentos (`customer_establishments`), sem cadastro duplicado.
- A venda guarda o próprio estabelecimento. Mudar ou remover um vínculo não altera vendas antigas.
- Estabelecimento com histórico não é apagado: é desativado.
- Cliente de fora do estabelecimento atual: aviso "Este cliente não está cadastrado neste estabelecimento. Deseja continuar?", que não bloqueia a venda.
- Antes de confirmar, o resumo mostra nome completo, telefone parcialmente oculto, estabelecimento, produtos ou descrição e total.

## Saldo

```
Saldo = vendas ativas + saldo anterior + ajustes de débito − pagamentos confirmados − ajustes de crédito
```

- Sempre derivado dos lançamentos; nunca guardado como número solto.
- Saldo negativo = o cliente tem crédito.
- "Saldo anterior" (dívida do caderno) tem valor, data de referência, observação e autor, e aparece com esse nome no extrato.

## Pagamentos

- Dinheiro ou Pix; parcial ou total. Cada pagamento tem UUID próprio, então um reenvio não gera dois recebimentos.
- Pagamentos quitam as dívidas mais antigas primeiro (FIFO derivado), o que define o "estado de pagamento" de cada venda e a "dívida originada" em cada estabelecimento.
- Aviso de Pix do cliente ("Já paguei") **não** reduz o saldo. Só a confirmação da Rose cria o pagamento, e um aviso vira no máximo um pagamento.
- Correção = estorno com motivo.

## Confirmação do cliente

| Estado | Significado |
|---|---|
| `PENDING` | sem confirmação (a venda é válida como lançamento administrativo) |
| `SIGNED` | assinatura desenhada na tela, presa ao hash do resumo canônico |
| `CONFIRMED_ONLINE` | o cliente confirmou pelo portal autenticado |
| `DISPUTED` | o cliente contestou; a dívida continua até a Rose analisar |
| `CANCELLED` | a venda foi cancelada e a confirmação invalidada |

- A assinatura é opcional por padrão (`require_signature = false`).
- Assinatura é evidência de concordância com o conteúdo mostrado, não prova de identidade. Não há extração biométrica.
- Venda assinada não é alterada em silêncio: cancelamento invalida a confirmação.

## Cadastros

- Cliente: nome com pelo menos duas palavras (nome e sobrenome, ou um apelido que diferencie, como "Zé da Oficina"); telefone opcional, validado e guardado em E.164.
- Mesmo telefone ou mesmo nome de outro cliente gera **aviso**, não bloqueio: a mesma pessoa em dois lugares deve ser um cadastro com dois estabelecimentos.
- Estabelecimento e produto: nome único por negócio (sem diferenciar maiúsculas). Desativar tira da seleção de vendas, mas mantém o histórico.
- O estabelecimento atual fica lembrado no aparelho, por conta, e já vem marcado ao cadastrar um cliente.
- "Quanto os clientes deste lugar devem, no total" soma o saldo inteiro dos clientes vinculados (inclui compras em outros lugares). Vendas e dívidas originadas em cada lugar entram nos relatórios.

## Datas

- `occurred_at` vem do relógio do celular; o servidor registra sempre o próprio `received_at`.
- O servidor recusa `occurred_at` mais de 10 minutos no futuro (e, a partir da RPC de venda, mais de 30 dias no passado).
- Datas, "hoje" e períodos seguem o **fuso do negócio** (`business_settings.timezone`, padrão Brasília), não o do aparelho nem o do servidor. A Rose escolhe em Configurações; o app avisa quando o celular está em outro fuso.
