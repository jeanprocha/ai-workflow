# Integração Rein (ERP) — receita pronta

A plataforma não tem nenhum código específico da Rein — o node **HTTP Request**
(`api.httpRequest`) é genérico e cobre qualquer ERP com o mesmo formato de
autenticação assinada. Este documento é só a receita: os valores certos para
colar nos campos do node, pra fazer a busca de produto e a criação de pedido
funcionarem contra a API da Rein.

Contexto técnico completo (assinatura HMAC, `$auth`/`$sig`, gates de
segurança) está no node em si — ver `packages/nodes/src/definitions/http-request.ts`.

## 1. Como a Rein autentica

Toda requisição carrega 4 headers: `Token`, `Timestamp`, `Database`, `ClientId`.
O `Token` é uma assinatura HMAC-SHA256:

```
timestamp  = agora (unix, segundos) + 300  (5 minutos à frente — absorve deriva de clock)
dataToSign = "{path}.{database}.{timestamp}"   // path da URL, sem host nem query
Token      = HMAC-SHA256(dataToSign, client_secret), em hex
```

## 2. Criar a Conexão

Em **Configurações → Conexões** → **Adicionar conexão**, escolha o formato
**"Vários campos"** e preencha uma linha por parâmetro. Os tipos importam: o
que estiver marcado como **número** chega na Rein como `1`, não como `"1"` —
e a API recusa o pedido se receber string onde espera número.

| Campo | Tipo | Valor |
|---|---|---|
| `clientId` | texto | seu client id |
| `clientSecret` | texto | seu client secret |
| `database` | texto | nome do banco na Rein |
| `filialId` | **número** | id da filial |
| `vendedorId` | **número** | ver o aviso abaixo |
| `tabelaPrecoId` | **número** | id da tabela de preço |

Provider e nome da conexão são livres — este documento usa `rein` para os dois.

> **`vendedorId` não é o `Id` interno do usuário na Rein** — é o
> `CodigoUsuarioReferenciado` do vendedor. Usar o `Id` errado retorna
> "CodVendedor não encontrado"; e mesmo um código válido pode ser recusado
> com "Tabela de preço não permitida" se aquele vendedor não tiver vínculo
> cadastral com a tabela de preço configurada — isso não aparece em nenhuma
> consulta pública da API, só o suporte Rein confirma.

Para corrigir um campo depois, use o botão de editar na linha da conexão. Por
segurança os valores salvos nunca são exibidos de volta: as chaves e os tipos
voltam preenchidos, os valores vêm em branco, e salvar substitui o segredo
inteiro (deixar tudo em branco mantém o que já estava lá).

Dentro do node, esse conteúdo fica disponível como `{{ $auth.clientId }}`,
`{{ $auth.clientSecret }}`, `{{ $auth.database }}`, `{{ $auth.filialId }}`,
`{{ $auth.vendedorId }}`, `{{ $auth.tabelaPrecoId }}`.

## 3. Node — buscar produto (`GET /api/v1/produto`)

No node HTTP Request:

| Campo | Valor |
|---|---|
| Método | `GET` |
| URL | `https://api.rein.net.br/api/v1/produto` |
| Query → `termo` | `{{ $input.message }}` (ou o que guardar a busca do cliente) |
| Query → `page` | `1` |
| Conexão (em Avançado) | a conexão criada no passo 2 |

Headers:

| Nome | Valor |
|---|---|
| `Content-Type` | `application/json` |
| `Token` | `{{ $sig.signature }}` |
| `Timestamp` | `{{ $sig.timestamp }}` |
| `Database` | `{{ $auth.database }}` |
| `ClientId` | `{{ $auth.clientId }}` |

Assinatura (dentro de Avançado):

| Campo | Valor |
|---|---|
| Habilitar assinatura | ligado |
| Algoritmo | `sha256` |
| Codificação | `hex` |
| Segredo | `{{ $auth.clientSecret }}` |
| Template | `{{ $sig.path }}.{{ $auth.database }}.{{ $sig.timestamp }}` |
| Offset do timestamp | `300` |

A resposta chega em `{{ $node.<id-deste-node>.body.data.items }}` — o
formato é aninhado (preço em `ProdutoGrade.ProdutoMargem.Preco`, código em
`ProdutoGrade.Sku`), e a Rein costuma devolver a lista inteira, não só os
primeiros N. Antes de mandar isso pra um `ai.chat` formatar pro visitante,
intercale um node `logic.transformList`: Origem
`{{ $node.<id-deste-node>.body.data.items }}`, Limite (ex.: `5`) e os campos
que interessam (`sku` ← `ProdutoGrade.Sku`, `preco` ←
`ProdutoGrade.ProdutoMargem.Preco` etc.) — o `ai.chat` recebe só os 5 itens
já enxutos (`{{ $node.<id-do-transformList>.items }}`) em vez do JSON aninhado
inteiro de todos os resultados, e o campo `total` deixa a IA dizer "encontrei
37, mostrando 5" sem custo extra de IA pra isso.

Depois de montar, clique **"Salvar como predefinição"** no painel — próxima
vez que precisar deste node (neste ou em outro fluxo), é só escolher a
predefinição em vez de preencher tudo de novo.

## 4. Interpretar a escolha do cliente e montar o carrinho

Depois de mostrar a lista, o cliente responde de dois jeitos possíveis:
**informa o código de um item**, ou **digita uma busca nova**. O fluxo
validado (branch `escolhendo` de um node `Switch` chaveado em
`{{ $vars.etapa }}`) é:

1. **`If`** decidindo se a resposta é um código puro:
   - Valor esquerdo: `{{ $node.<id-do-trigger-chat>.message }}`
   - Operador: `matches`
   - Valor direito: `^\d+$`
2. **Branch `true` (é código)** → **`ai.extraction`**, comparando o código
   contra a lista já enxuta (`resultadosBusca`, gravada no `Set Variables`
   logo depois da busca):
   - Texto: instrua explicitamente a IA a **comparar** o código com o campo
     `id` de cada item — um texto vago tipo só colar a lista faz a IA
     "desistir" e devolver tudo vazio, mesmo com o dado certo lá (ver
     armadilha abaixo).
   - Schema: todo campo precisa de `"description"` explicando o que ele é —
     sem isso, mesmo com `"required"`, a IA tende a preencher o mínimo
     aceitável em vez de raciocinar sobre os dados.
   - Campos numéricos que vão aparecer em texto pro cliente (preço) devem
     ser `"type": "string"` já formatados (`"580,00"`, com vírgula e 2
     casas) — um `"type": "number"` perde zeros à direita na hora de virar
     texto (`105.00` vira `105`).
3. **Branch `false` (nova busca)** → reconecta direto no node HTTP Request
   da busca (passo 3) — reaproveita o pipeline inteiro, sem duplicar nada.
4. Confirmado o item (`encontrado == true`), grava `produtoEscolhidoId`/
   `Nome`/`Preco` em `$vars` e pergunta a quantidade.
5. Quantidade validada (`If` com `matches` + `^\d+$`) → node **`logic
   .appendToList`** ("Adicionar à lista") acrescenta `{ id, nome, preco,
   quantidade }` no `$vars.carrinho`:
   - Lista atual: `{{ $vars.carrinho }}` (ausente na primeira vez conta
     como lista vazia, não como erro)
   - Item novo: JSON com os 4 campos acima
6. Um `ai.classification` (categorias `["nova_busca", "finalizar"]`)
   decide se o cliente quer buscar mais ou fechar o pedido — mais simples e
   confiável que o `ai.extraction` do passo 2, porque é só rotular em 2
   categorias fixas, não procurar dado dentro de uma lista.

## 5. Node — criar pedido (`PUT /api/v1/pedido`)

| Campo | Valor |
|---|---|
| Método | `PUT` |
| URL | `https://api.rein.net.br/api/v1/pedido` |
| Conexão | a mesma conexão do passo 2 |

Headers: os mesmos 4 do passo 3 (Token/Timestamp/Database/ClientId) e
assinatura configurada da mesma forma.

Corpo (JSON, em Avançado):

```json
{
  "CodOrigem": 0,
  "CodDestino": 0,
  "CodEmpresaServico": {{ $auth.filialId }},
  "CodVendedor": {{ $auth.vendedorId }},
  "CanalVendaId": 0,
  "IndicadorPresenca": 1,
  "CodNatureza": "5102",
  "UsoMercadoria": "consumo",
  "Produto": [
    { "IdProduto": {{ $vars.produtoEscolhidoId }}, "CodProduto": 0, "CodTabelaPreco": {{ $auth.tabelaPrecoId }}, "QtdProduto": {{ $vars.quantidade }}, "ValorUnitario": {{ $vars.valorUnitario }} }
  ],
  "Pagamento": [
    { "ParcelaId": 0, "CodMeioPagamento": 1, "ValorPagamento": {{ $vars.valorTotal }}, "DataPagamento": "{{ $sig.timestamp }}" }
  ]
}
```

Os campos `$vars.*` acima (produto escolhido, quantidade, valor) vêm do
carrinho da conversa — normalmente escritos por um node `Set Variables` nos
passos anteriores do fluxo de chat, não direto neste node.

**Antes de apontar pra URL real da Rein**, valide o payload inteiro (CPF +
`$vars.carrinho`) apontando o node pro `/debug/echo` da própria API
(`{{ API_URL }}/debug/echo`, só existe com `OBS_DEBUG_ENDPOINT=1`, padrão em
dev) — ele devolve exatamente o corpo recebido, sem criar nada de verdade.
Confirmado o formato certo, é só trocar a URL — o resto do node continua
igual.

## 6. Armadilhas conhecidas

- **Testar a criação de pedido cria um pedido real** na Rein — combine
  cancelamento com o cliente/suporte antes de testar em produção.
- **Nunca cole o `clientSecret` em terminal, chat ou log.** Se isso
  acontecer, o valor precisa ser rotacionado na Rein (o node HTTP nunca
  registra segredo/assinatura/query nos logs de execução, mas o clipboard
  de quem digitou o valor não tem essa proteção).
- Um 400 na criação do pedido quase sempre é vínculo vendedor↔tabela de
  preço no cadastro Rein, não um bug de payload — confirme com o suporte
  Rein antes de variar campos por tentativa e erro.
- `filialId`/`vendedorId`/`tabelaPrecoId` não são autenticação — são
  contexto de negócio usado só no corpo do pedido; ficam na mesma Conexão
  por conveniência (evita repetir em cada node), mas nada os liga à
  assinatura HMAC em si.
- **`{{ $input }}` só existe quando o node anterior repassa o input** —
  `trigger.chat`, `logic.switch`, `logic.setVariables` e `chat.reply` fazem
  isso; `logic.if`, `ai.extraction`, `ai.classification` e `ai.chat`
  **não** (o output deles é o resultado da própria tarefa, não um
  passthrough). Referenciar `{{ $input.message }}` logo depois de um desses
  resolve pra vazio, em silêncio — dentro de um `ai.extraction` isso apareceu
  como "não encontrei esse código" mesmo com o código certo na lista, porque
  o texto mandado pra IA nunca tinha o código de verdade. Sempre que o node
  anterior não for um dos quatro que repassam, referencie o valor direto
  pelo id do node de origem (`{{ $node.<id-do-trigger-chat>.message }}`), não
  por `$input`.
- **Schema de saída estruturada (`ai.extraction`/`ai.classification`) sem
  `description` em cada campo tende a devolver o mínimo aceitável** (string
  vazia, `false`) em vez de realmente raciocinar sobre o texto — mesmo com
  os dados certos disponíveis. Descreva cada campo explicitamente (o que é,
  onde achar, que formato) e marque como `"required"` os campos que sempre
  devem vir preenchidos.

## 7. Fora de escopo (por enquanto)

- Guard de idempotência (reenviar "finalizar pedido" não deveria criar um
  segundo pedido) — o carrinho (`$vars.carrinho`, montado via
  `logic.appendToList`) já existe e funciona; falta só a trava contra
  reenvio duplicado.
- Validação de CPF/telefone — hoje aceita qualquer texto digitado, sem
  checar formato nem dígito verificador.
- Disparo real do "criar pedido" pra Rein — validado até aqui só simulado
  via `/debug/echo` (ver seção 5); trocar a URL é o único passo que falta,
  mas cada teste real cria um pedido de verdade (ver armadilha na seção 6).
- Mapeamento automático da resposta de busca (papéis tipo `list`/`price`) —
  hoje é referência direta ao caminho JSON (`$node.<id>.body.data.items`).
