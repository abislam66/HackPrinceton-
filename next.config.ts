import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off on purpose: pages read the project files, model.json and the
  // proposals table on every request, so a new model or proposal shows up without a rebuild.
  cacheComponents: false,
  // The pre-loaded project, the model metadata and the committed fallback proposals are read
  // from disk at request time.
  outputFileTracingIncludes: {
    "/*": [
      "./data/**/*.json",
      "./public/models/**/*.json",
      "./src/features/proposal/fallback/*.json",
    ],
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

export default nextConfig;
