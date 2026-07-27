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
`ProdutoGrade.Sku`). Formatar a lista pro visitante costuma ficar melhor com
um node `ai.chat` logo depois, em vez de tentar montar o texto manualmente.

Depois de montar, clique **"Salvar como predefinição"** no painel — próxima
vez que precisar deste node (neste ou em outro fluxo), é só escolher a
predefinição em vez de preencher tudo de novo.

## 4. Node — criar pedido (`PUT /api/v1/pedido`)

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

## 5. Armadilhas conhecidas

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

## 6. Fora de escopo (por enquanto)

- Guard de idempotência (reenviar "finalizar pedido" não deveria criar um
  segundo pedido) — depende do fluxo de carrinho estar montado; não existe
  ainda nesta plataforma.
- Mapeamento automático da resposta de busca (papéis tipo `list`/`price`) —
  hoje é referência direta ao caminho JSON (`$node.<id>.body.data.items`).
