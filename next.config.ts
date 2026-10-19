import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const posthogHost = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";
const posthogAssets = process.env.POSTHOG_ASSETS_HOST ?? "https://us-assets.i.posthog.com";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  // PostHog API calls use trailing slashes.
  skipTrailingSlashRedirect: true,
  // Labs were renamed to drills; keep old links working.
  async redirects() {
    return [
      { source: "/labs", destination: "/drills", permanent: true },
      { source: "/labs/:slug", destination: "/drills/:slug", permanent: true },
    ];
  },
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: `${posthogAssets}/static/:path*` },
      { source: "/ingest/array/:path*", destination: `${posthogAssets}/array/:path*` },
      { source: "/ingest/:path*", destination: `${posthogHost}/:path*` },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Turbopack needs plugins referenced by package name.
const withMDX = createMDX({ options: { remarkPlugins: [["remark-gfm", {}]] } });

export default withMDX(nextConfig);
