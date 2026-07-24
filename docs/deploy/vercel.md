# Deploy do frontend no Vercel

O `apps/web` (Next.js) roda no Vercel; `apps/api` + worker rodam no Railway
(ver `docs/deploy/railway.md`). Projeto Vercel: `jeanprochas-projects/web`.

## Como esta configurado

- **Root Directory do projeto**: `apps/web` (setado via API do Vercel, nao
  pela CLI — nao existe flag direta pra isso em `vercel link`/`vercel deploy`).
  Isso faz o Vercel detectar o monorepo pnpm automaticamente: instala as
  dependencias a partir da raiz do repo (resolve os workspaces), depois builda
  a partir de `apps/web` com deteccao zero-config do Next.js.
- **`.vercelignore`** na raiz do repo: exclui `node_modules`, `.turbo`,
  `.next`, `dist`, `build`, `.git`, `.pnpm-store`, `docker` do upload. Sem
  isso a CLI tenta subir o repo inteiro (~5GB+ com node_modules) e esbarra no
  limite de 100MB por arquivo do Vercel.
- **Variavel de ambiente** `NEXT_PUBLIC_API_URL` (Production) = URL da API no
  Railway (`https://api-production-cb36.up.railway.app`). Publica de
  proposito (prefixo `NEXT_PUBLIC_`) — e so a URL da API, nao um segredo.

## Deploy

```bash
cd /caminho/do/repo
vercel --prod --yes
```

Rodar sempre a partir da RAIZ do monorepo (nao de dentro de `apps/web`) —
a raiz e onde `pnpm-workspace.yaml`/`pnpm-lock.yaml` vivem, necessarios pro
install resolver os packages internos (`@workflow/shared`, `@workflow/ui`,
`@workflow/nodes`).

## Se precisar recriar o Root Directory

```bash
TOKEN=$(python3 -c "import json; print(json.load(open('$HOME/.local/share/com.vercel.cli/auth.json'))['token'])")
curl -s -X PATCH "https://api.vercel.com/v9/projects/<project-id>?teamId=<team-id>" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"rootDirectory": "apps/web"}'
```

IDs do projeto atual estao em `.vercel/project.json` (nao versionado).
