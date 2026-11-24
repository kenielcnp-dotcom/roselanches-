# Identidade visual

O mockup da tela inicial da Rose é a referência principal. As outras telas usam os mesmos componentes e tokens.

## Tokens (`src/styles/index.css`, `@theme` do Tailwind)

| Token | Cor | Uso |
|---|---|---|
| `cream` / `cream-deep` | `#FFF4E6` / `#FCEBD7` | fundo (gradiente suave) |
| `peach` | `#FDE3C8` | cartões secundários |
| `orange` | `#E86A16` | ícones, brilhos e detalhes grandes |
| `orange-deep` | `#C94D0B` | botões e aba ativa (texto branco 4,6:1) |
| `orange-darker` | `#A93F09` | fim do gradiente do botão principal |
| `brown` | `#542713` | texto principal |
| `brown-soft` | `#7A4A2E` | texto secundário |
| `brown-nav` | `#5A2814` | navegação inferior |
| `logo-red` | `#B3141C` | só no logo |
| `success` | `#238447` | sincronizado, pagamento confirmado |
| `danger` | `#B42318` | erros |
| `line` | `#F1D9BF` | bordas |

Cartões com raio de 22 px e sombra quente. Números com `tabular-nums`.

## Tipografia

Nunito (variável) no app inteiro; Pacifico só em "Rose" no logo. As duas vêm do `@fontsource`, instaladas localmente, então funcionam sem internet. Só os subconjuntos latinos entram no cache do service worker.

## Elementos

| Elemento | Implementação |
|---|---|
| Toldo | `Awning`: faixa laranja recortada, só na tela inicial, login e portal |
| Logo | `Logo`: hambúrguer em SVG próprio + "Lanches da" + "Rose" cursiva com traço laranja |
| Pílula de estado | `SyncPill`: conexão, sincronização e pendências num lugar só (sincronizado, enviando, aguardando envio, sem internet, precisa de atenção) |
| Saudação | Bom dia / Boa tarde / Boa noite pelo horário do negócio |
| Nova venda | botão enorme, gradiente `orange-deep` → `orange-darker`, círculo branco com + |
| Atalhos | linha de 3 cartões (Clientes, Recebimentos, Relatórios) + Produtos e Estabelecimentos |
| Navegação inferior | barra marrom arredondada, aba ativa em pílula `orange-deep`: Início, Vender, Clientes, Relatórios, Config. |
| Marca d'água | `FoodWatermark`, baixa opacidade, `aria-hidden` |

## Acessibilidade (ajustes em relação ao mockup)

- Texto branco sobre `#E86A16` dá só 3,2:1. O botão principal e a aba ativa usam `#C94D0B` ou mais escuro (≥ 4,6:1).
- Alvos de toque com pelo menos 48 px.
- Ícones sempre acompanhados de rótulo.
- `prefers-reduced-motion` desliga animações.

## Dados

Os números do mockup são ilustrativos. O app mostra só valores reais e, sem dados, "R$ 0,00" ou "Nenhuma venda hoje".
