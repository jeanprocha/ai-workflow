import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  transpilePackages: ["@workflow/shared", "@workflow/ui", "@workflow/nodes"],
  allowedDevOrigins: ["192.168.1.100"],
};

// H1.4: sem SENTRY_AUTH_TOKEN (nao configurado ainda — precisa de conta
// Sentry), o upload de source maps so e pulado com um aviso, build nao
// quebra. Tambem so-opa hoje porque este app builda com Turbopack — o
// plugin de instrumentacao em build-time do Sentry e especifico de Webpack;
// a instrumentacao em runtime (instrumentation.ts/instrumentation-client.ts)
// funciona independente disso.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
});
