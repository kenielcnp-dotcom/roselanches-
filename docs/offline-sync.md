# Offline e sincronização

> Situação (Fase 3): banco local, fila, motor de sincronização, retomada após fechar o app, espera crescente entre tentativas, pausa por sessão expirada, Web Lock, envio manual ("Enviar agora") e venda sem internet estão implementados e testados (`tests/unit/sync-engine.test.ts` e `tests/e2e/fase3-vendas.spec.ts`). Ficam para a Fase 5: service worker testado sem internet ao recarregar, guarda ao sair da conta, aviso quando o navegador negar armazenamento persistente e saldos do celular nas telas de clientes.

Código: `src/lib/offline/` (`db.ts`, `outbox.ts`, `sync-engine.ts`, `catalog.ts`) e `src/features/sync/SyncProvider.tsx`.

## Princípio

Rose registra uma venda mesmo sem internet. A venda é gravada **primeiro no celular** e enviada depois. A interface sempre diferencia "salva no celular" de "sincronizada".

## Banco local (Dexie / IndexedDB)

Nome: `ldr-<userId>`, um por conta.

| Tabela | Conteúdo |
|---|---|
| `meta` | configurações de venda e hora da última cópia do catálogo |
| `establishments`, `customers` (com os ids dos estabelecimentos e o saldo da última cópia), `products` | cache renovado por inteiro ao abrir, a cada 5 min e depois de cada envio (volume pequeno) |
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

- Quando roda: ao abrir o app, quando o servidor volta a responder, ao voltar o foco, a cada 30 s com pendências, ao renovar a sessão e no botão "Enviar agora" (que ignora a espera entre tentativas).
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

> Implementada na Fase 4 (`src/features/signatures/`, `src/services/signatures.ts`, `supabase/functions/signature-upload/`). Testada em integração (`tests/integration/assinatura.test.ts`) e no navegador, inclusive sem internet (`tests/e2e/fase4-assinatura.spec.ts`).

No celular: a venda, a assinatura (PNG + sha256 + hash do resumo canônico, com a data/hora mostrada no resumo) e as duas operações são gravadas na MESMA transação. Mudar a venda depois de assinar (voltar, trocar cliente ou lugar) descarta a assinatura. Se a venda for cancelada antes de a assinatura subir, o servidor responde `SKIPPED` e a operação termina.

1. `CREATE_SALE` fica `SYNCED`.
2. POST multipart com o JWT para a Edge Function `signature-upload`.
3. A função valida o usuário, confere o PNG (bytes mágicos, IHDR, até 200 KB), calcula o sha256 e chama `signature_prepare` (verifica membro do negócio, venda ativa, hash do resumo igual ao recalculado no servidor e ausência de outra assinatura válida), que devolve o caminho determinístico `{business_id}/{sale_id}/{confirmation_id}.png`.
4. Upload com `upsert: false`: arquivo já existente com o mesmo sha256 segue; sha256 diferente é conflito.
5. `signature_finalize` insere com `ON CONFLICT (id)` (idempotente).
6. Só então a operação vira `SYNCED` e o PNG sai do celular.

Falha entre upload e registro se resolve repetindo a operação, sem duplicar arquivo nem confirmação.

## Teste em aparelho real

Antes do lançamento: Android real, desligar a internet, registrar vendas com e sem assinatura, fechar o navegador, reiniciar o celular, religar a internet e conferir uma única venda no banco para cada registro.
