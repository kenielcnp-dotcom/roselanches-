# Offline e sincronização

> Situação (Fase 3): banco local, fila, motor de sincronização, retomada após fechar o app, espera crescente entre tentativas, pausa por sessão expirada, Web Lock, envio manual ("Enviar agora") e venda sem internet estão implementados e testados (`tests/unit/sync-engine.test.ts` e `tests/e2e/fase3-vendas.spec.ts`). Fase 5 (concluída): o app abre sem internet a partir do service worker, inclusive com o login vencido; telas de consulta caem na cópia do celular com a hora indicada; sair da conta é bloqueado com operações pendentes e apaga os dados do aparelho; aviso quando o navegador não garante o armazenamento. Testado com o build de PRODUÇÃO (`tests/e2e/fase5-offline.spec.ts`). Falta só o teste manual num Android real (ver abaixo).

## Abrir o app sem internet

- **Casco:** o service worker (vite-plugin-pwa, `generateSW`) guarda HTML, JS, CSS, ícones e fontes latinas; qualquer rota interna cai no `index.html` guardado.
- **Login vencido sem internet:** o supabase-js tenta renovar por até 30 s antes de desistir. O `AuthProvider` não espera: sem rede (ou após 4 s), usa a sessão guardada no aparelho (`localStorage`, chave `ldr-auth`). Só uma saída pedida (`SIGNED_OUT`) ou a recusa do servidor desloga. A identidade vem do aparelho e a renovação continua sozinha quando a conexão volta.
- **Telas de consulta** (painel, clientes, detalhe do cliente, estabelecimentos, produtos): servidor primeiro, com limite de 8 s; sem rede, a cópia do celular, com o aviso "Mostrando os dados guardados no celular em dd/mm às hh:mm" (`src/lib/offline/fallback.ts`). O detalhe do cliente soma "+ R$ X em vendas no celular, ainda não enviadas". O extrato completo só aparece com internet.
- **Consultas sempre rodam** (`networkMode: 'always'`): o TanStack Query não fica "pausado" esperando o navegador dizer que voltou a rede.

## Sair da conta

Com qualquer operação ainda não enviada, "Sair da conta" é recusado e oferece "Enviar agora e sair". Ao sair: apaga o banco do celular (`ldr-<userId>`), as preferências do app (`ldr.*`) e a identidade guardada.

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

Checklist (Android, com o app publicado e instalado na tela inicial):

1. Com internet: entrar, escolher o estabelecimento, abrir Vender, Clientes e Produtos uma vez.
2. Modo avião. Fechar o app (tirar da lista de recentes) e abrir de novo: deve abrir na área da Rose, com "Sem internet".
3. Registrar 2 vendas (uma com assinatura). A pílula mostra "2 vendas e 1 assinatura".
4. Reiniciar o celular. Abrir o app, ainda sem internet: as vendas continuam em Vendas, "No celular".
5. Tentar sair da conta: deve bloquear.
6. Tirar do modo avião: em até 30 s aparece "Venda sincronizada". Conferir no painel do Supabase uma venda para cada registro, sem duplicatas.

Antes do lançamento: Android real, desligar a internet, registrar vendas com e sem assinatura, fechar o navegador, reiniciar o celular, religar a internet e conferir uma única venda no banco para cada registro.
