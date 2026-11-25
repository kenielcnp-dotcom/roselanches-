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
- Aviso de Pix do cliente ("Já paguei") **não** reduz o saldo. Só a confirmação da Rose cria o pagamento, e um aviso vira no máximo um pagamento. Ao confirmar, a Rose informa o valor que **viu no banco** (pode ser diferente do avisado). Recusar exige motivo, que o cliente vê.
- Registrar pagamento (dinheiro ou Pix recebido direto) funciona sem internet, pela fila. A tela sugere "Quitar tudo" e avisa quanto ainda fica devendo, ou quanto vira crédito.
- Pagamento de venda paga na hora não se estorna sozinho: cancela-se a venda, e o pagamento é estornado junto.
- **Só a dona** estorna pagamentos e lança ou cancela saldo anterior e ajustes ("Diminuir a dívida" = crédito; "Aumentar a dívida" = débito). Tudo com motivo, autor e data.
- Saldo anterior não pode ter data de referência no futuro.
- Correção = estorno com motivo.

## Confirmação do cliente

| Estado | Significado |
|---|---|
| `PENDING` | sem confirmação (a venda é válida como lançamento administrativo) |
| `SIGNED` | assinatura desenhada na tela, presa ao hash do resumo canônico |
| `CONFIRMED_ONLINE` | o cliente confirmou pelo portal autenticado |
| `DISPUTED` | o cliente contestou; a dívida continua até a Rose analisar |
| `CANCELLED` | a venda foi cancelada e a confirmação invalidada |

- A assinatura é opcional por padrão (`require_signature = false`). No resumo da venda: "Pedir assinatura" ou "Salvar sem assinatura". Com a opção "Assinatura obrigatória" ligada em Configurações, só "Pedir assinatura".
- A tela de assinatura mostra cliente, lugar, compra, total e o texto v1. "Confirmar assinatura" só libera com um traço de verdade (um toque ou ponto não vale).
- Assinatura é evidência de concordância com o conteúdo mostrado, não prova de identidade. Não há extração biométrica.
- Venda assinada não é alterada em silêncio: cancelamento invalida a confirmação.
- No portal, o cliente confirma ou contesta cada compra vendo o mesmo texto de confirmação; o servidor confere o hash do resumo canônico. Pode mudar de ideia: a manifestação anterior é invalidada (não apagada) e a nova entra no lugar.
- **A contestação não mexe na dívida.** A Rose vê "compras contestadas" no painel, conversa com o cliente e: se a venda estiver errada, cancela e registra de novo; se estiver certa, encerra a contestação com uma resposta, que o cliente vê. Encerrada, a compra volta a "sem confirmação" e o cliente pode confirmar.

## Portal do cliente

- A Rose convida pela ficha do cliente: link pelo WhatsApp do cadastro, link copiado ou QR na tela. O link vale 3 dias, funciona uma vez, e gerar outro cancela o anterior.
- O cliente abre o link, cria a conta (e-mail e senha) ou entra, e o vínculo acontece na hora. Conta da Rose nunca vira conta de cliente.
- O portal mostra saldo, avisos de pagamento, extrato com o local de cada compra, o estado de pagamento e de confirmação, e filtros (a confirmar, em aberto, compras, pagamentos, local).
- "Pagar com Pix": chave para copiar e QR estático (BR Code do Banco Central) com valor opcional ("Tudo", outro valor ou digitar no banco). "Já paguei" manda um aviso; o saldo só muda quando a Rose confirma.
- A observação de um pagamento e o motivo de cancelamentos, estornos e ajustes aparecem para o cliente no extrato. As observações do cadastro do cliente, não.
- A dona pode tirar o acesso (com motivo) e mandar um convite novo, por exemplo quando o cliente perde a senha.

## Cadastros

- Cliente: nome com pelo menos duas palavras (nome e sobrenome, ou um apelido que diferencie, como "Zé da Oficina"); telefone opcional, validado e guardado em E.164.
- Mesmo telefone ou mesmo nome de outro cliente gera **aviso**, não bloqueio: a mesma pessoa em dois lugares deve ser um cadastro com dois estabelecimentos.
- Estabelecimento e produto: nome único por negócio (sem diferenciar maiúsculas). Desativar tira da seleção de vendas, mas mantém o histórico.
- O estabelecimento atual fica lembrado no aparelho, por conta, e já vem marcado ao cadastrar um cliente.
- "Quanto os clientes deste lugar devem, no total" soma o saldo inteiro dos clientes vinculados (inclui compras em outros lugares). Vendas e dívidas originadas em cada lugar entram nos relatórios.

## Relatórios

- Período: hoje, semana (segunda até hoje), mês (dia 1 até hoje), mês passado ou datas escolhidas (até um ano), sempre no fuso do negócio. Filtros por local e por cliente; a lista de vendas filtra também por situação do pagamento (em aberto, paga em parte, quitada, paga na hora, cancelada) e por confirmação.
- **Por local, três números separados, que não se somam entre si:**
  - **Vendido aqui:** vendas feitas no local, no período.
  - **Dívida que nasceu aqui:** quanto falta receber hoje de compras feitas no local. Os pagamentos quitam primeiro as dívidas mais antigas, de qualquer local (FIFO derivado).
  - **Saldo dos clientes daqui:** quanto os clientes vinculados devem hoje no total, incluindo compras em outros locais. O mesmo cliente aparece em todos os locais a que pertence, por isso este número não se soma entre locais.
  - A dívida originada de todos os locais + a dívida sem local (saldo anterior e ajustes) = total em aberto. Os testes conferem essa conta.
- "Recebido" conta os pagamentos de fiado (dinheiro e Pix); a venda paga na hora aparece em "Pago na hora". Pagamento não tem local: com filtro de local, o recebido não se aplica.
- "Em aberto agora" e a idade da dívida (até 7, 8 a 30, 31 a 60, mais de 60 dias) não dependem do período escolhido.
- Relatórios precisam de internet; sem conexão, a tela avisa em vez de mostrar números velhos.
- Planilha (CSV com ";" e vírgula decimal, para Excel/Planilhas em português) das vendas filtradas, até 2.000 por vez. Textos que começam com "=", "+", "-" ou "@" são neutralizados para não virarem fórmula.

## Datas

- `occurred_at` vem do relógio do celular; o servidor registra sempre o próprio `received_at`.
- O servidor recusa `occurred_at` mais de 10 minutos no futuro (e, a partir da RPC de venda, mais de 30 dias no passado).
- Datas, "hoje" e períodos seguem o **fuso do negócio** (`business_settings.timezone`, padrão Brasília), não o do aparelho nem o do servidor. A Rose escolhe em Configurações; o app avisa quando o celular está em outro fuso.
