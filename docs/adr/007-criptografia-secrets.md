# ADR-007: Criptografia de secrets

Status: Aceito
Data: 2026-07-23

## Contexto

`credentials` e `variables` marcadas como secret guardam chaves de API, senhas de banco e tokens OAuth de terceiros. Nunca podem ser expostas em texto plano fora do momento de uso pela engine.

## Decisão

- Criptografia **AES-256-GCM** por valor, com chave mestre vinda de variável de ambiente (`SECRETS_ENCRYPTION_KEY`), nunca commitada.
- A API **nunca retorna o valor descriptografado** em nenhum GET/list — apenas metadados (nome, provider, criado em, últimos 4 caracteres quando aplicável).
- O valor só é descriptografado em memória, no momento da execução do node que o consome, dentro do worker.

## Alternativas consideradas

- **KMS gerenciado (AWS KMS, GCP KMS) desde o v1**: mais robusto, porém acopla a infraestrutura a um provedor de nuvem específico antes de o produto precisar disso — Railway/Vercel (stack do spec) não exigem isso no MVP. Revisitar quando a plataforma tiver requisitos de compliance mais formais.
- **Sem criptografia em repouso (apenas controle de acesso)**: inaceitável para chaves de API de terceiros e credenciais de banco de dados de clientes.

## Consequências

- Rotação de `SECRETS_ENCRYPTION_KEY` exige re-criptografar todos os secrets — processo de rotação deve ser desenhado antes do primeiro deploy de produção (Fase 12).
- Sanitização de secrets ao publicar no Marketplace (Fase 9) reaproveita esta mesma camada: itens publicados nunca carregam o valor criptografado, apenas placeholders exigidos na instalação.
- Secrets nunca aparecem em logs de execução (`execution_logs`) nem em exports — mascaramento é responsabilidade da engine antes de persistir qualquer payload.
