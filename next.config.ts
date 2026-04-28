import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@mariozechner/pi-coding-agent",
    "@mariozechner/clipboard",
    "pdf-parse",
    "xlsx",
  ],
};

export default nextConfig;
