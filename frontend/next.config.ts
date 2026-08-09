import type { NextConfig } from "next";
import path from "path";

function apiRemotePatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (!raw) return [];

  try {
    const url = new URL(raw);
    const protocol = url.protocol === "http:" ? "http" : "https";
    return [
      {
        protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        pathname: "/uploads/**",
      },
    ];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    remotePatterns: apiRemotePatterns(),
  },
  // Avoid shipping source maps of server routes that hold keys.
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
};

export default nextConfig;
