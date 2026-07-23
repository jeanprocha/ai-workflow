import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@workflow/shared", "@workflow/ui"],
};

export default nextConfig;
