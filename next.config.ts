import type { NextConfig } from "next";
import { normalizeBasePath } from "./src/lib/base-path";

const nextConfig: NextConfig = {
  // Build-time value: the client bundle and router bake it in, so changing the
  // base path requires a rebuild with a different NEXT_PUBLIC_BASE_PATH.
  basePath: normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH),
  output: "standalone",
  poweredByHeader: false,
  typedRoutes: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: "base-uri 'self'; object-src 'none'; frame-ancestors 'self'",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
