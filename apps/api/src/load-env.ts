/**
 * Precisa ser o PRIMEIRO import em main.ts/worker.main.ts (import statements
 * sao hoisted — entre varios imports, a ordem de execucao segue a ordem em
 * que aparecem no arquivo, entao isso roda antes de qualquer outro modulo
 * ser avaliado, inclusive QueueModule/CacheModule que leem process.env.* no
 * corpo da classe/decorator, nao dentro de uma funcao).
 *
 * Antes desta correcao, o carregamento de .env dependia de um efeito
 * colateral do PrismaClient (que carrega .env sozinho para resolver
 * DATABASE_URL) — funcionava na maior parte das vezes so por sorte de ordem
 * de instanciacao do Nest, e falhou silenciosamente numa dessas vezes:
 * REDIS_URL ficou undefined, o QueueModule caiu no fallback
 * ("redis://localhost:6379") e o processo conectou no Redis de OUTRO
 * projeto na mesma maquina.
 */
try {
  process.loadEnvFile();
} catch {
  // Sem .env (ex.: producao no Railway) — variaveis vem do proprio ambiente.
}

export {};
