import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@workflow/shared", "@workflow/ui", "@workflow/nodes"],
  allowedDevOrigins: ["192.168.1.100"],
};

export default nextConfig;
