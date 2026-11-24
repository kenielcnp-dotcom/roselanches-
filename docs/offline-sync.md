# Offline e sincronização

> Situação: a Fase 1 entregou a detecção de conexão real (`useConnection`) e a pílula de estado. O banco local, a fila e o motor de sincronização entram nas Fases 3 e 5. Este documento descreve o desenho aprovado e será atualizado conforme as partes forem implementadas.

## Princípio

Rose registra uma venda mesmo sem internet. A venda é gravada **primeiro no celular** e enviada depois. A interface sempre diferencia "salva no celular" de "sincronizada".

## Banco local (Dexie / IndexedDB)

Nome: `ldr-<userId>`, um por conta.

| Tabela | Conteúdo |
|---|---|
| `meta` | deviceId, último estabelecimento usado, lastSyncAt |
| `establishments`, `customers`, `customerEstablishments`, `products`, `settings`, `balances` | cache renovado por inteiro a cada sincronização (volume pequeno) |
| `localSales` | vendas criadas no celular |
| `localSignatures` | PNG da assinatura (ArrayBuffer) + sha256 |
| `outbox` | fila persistente de operações |

- Gravar uma venda é **uma** transação Dexie (venda + assinatura + operações). "Venda salva no celular." só aparece depois do commit.
- `navigator.storage.persist()` é pedido; se negado, o app avisa.
- Saldos mostrados sem internet aparecem como "Saldo de dd/mm hh:mm + vendas no celular".
- O portal do cliente não guarda nada financeiro no aparelho.
- Ao sair da conta: se houver pendências, o app bloqueia e oferece "Enviar agora"; ao sair, apaga o IndexedDB.

## Fila (outbox)

Estados: `PENDING` → `SYNCING` → `SYNCED`, ou `FAILED`.

| Operação | Depende de |
|---|---|
| `CREATE_SALE` | — |
| `UPLOAD_SIGNATURE` | `CREATE_SALE` da mesma venda |
| `CANCEL_SALE` | `CREATE_SALE` da mesma venda |
| `REGISTER_PAYMENT` | — |

- Quando roda: ao abrir o app, no evento `online`, ao voltar o foco, a cada 30 s com pendências e no botão "Enviar agora".
- Web Lock `ldr-sync`: duas abas não sincronizam ao mesmo tempo.
- Não confia em `navigator.onLine`: só a resposta do servidor decide.
- Operação que ficou em `SYNCING` (app fechado no meio) volta para `PENDING` ao abrir — seguro por causa da idempotência.
- Nada sai da fila antes de o servidor responder `CREATED` ou `DUPLICATE`. Itens `SYNCED` são podados após 7 dias.

## Erros

| Erro | Classe | Ação |
|---|---|---|
| Falha de rede, timeout, 5xx, 408, 429 | transitório | backoff exponencial 5 s × 2ⁿ com jitter, teto de 15 min |
| 401 / sessão expirada | sessão | pausa a fila: "Entre de novo para enviar as vendas". Nada é descartado |
| Validação (`LDR_*`), `CONFLICT`, venda com mais de 30 dias | permanente | `FAILED`, visível, com ação "Revisar" |

## Idempotência

- UUID da venda, do pagamento e da confirmação gerado **antes** do primeiro salvamento; o botão de salvar trava.
- `create_sale` responde `CREATED`, `DUPLICATE` (mesmo id e mesmo `request_hash`: sucesso) ou `CONFLICT` (mesmo id com dados diferentes: registrado na auditoria e devolvido sem exceção, para o log não ser desfeito).

## Regras de conflito

| Situação | Regra |
|---|---|
| Preço do produto mudou depois da venda offline | vale o preço mostrado na hora (o cliente pode ter assinado); auditoria `PRICE_CHANGED` |
| Cliente, estabelecimento ou produto desativado depois da venda | venda aceita (o lanche foi entregue); auditoria `INACTIVE_AT_SYNC` e aviso |
| Venda fora de ordem | indiferente: o saldo é derivado |
| Resposta perdida após timeout | o reenvio devolve `DUPLICATE` e a operação vira `SYNCED` |
| Relógio do celular errado | `occurred_at` até 10 min no futuro e até 30 dias no passado; `received_at` do servidor sempre registrado |

## Assinatura

1. `CREATE_SALE` fica `SYNCED`.
2. POST multipart com o JWT para a Edge Function `signature-upload`.
3. A função valida o usuário, confere o PNG (bytes mágicos, IHDR, até 200 KB), calcula o sha256 e chama `signature_prepare` (verifica membro do negócio, venda ativa, hash do resumo igual ao recalculado no servidor e ausência de outra assinatura válida), que devolve o caminho determinístico `{business_id}/{sale_id}/{confirmation_id}.png`.
4. Upload com `upsert: false`: arquivo já existente com o mesmo sha256 segue; sha256 diferente é conflito.
5. `signature_finalize` insere com `ON CONFLICT (id)` (idempotente).
6. Só então a operação vira `SYNCED` e o PNG sai do celular.

Falha entre upload e registro se resolve repetindo a operação, sem duplicar arquivo nem confirmação.

## Teste em aparelho real

Antes do lançamento: Android real, desligar a internet, registrar vendas com e sem assinatura, fechar o navegador, reiniciar o celular, religar a internet e conferir uma única venda no banco para cada registro.
