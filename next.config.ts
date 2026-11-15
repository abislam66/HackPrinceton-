import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev badge off the sidebar's "Reset demo" button.
  devIndicators: { position: "bottom-right" },
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
      // Last good live runs (scouting, dossiers) and their recordings, for the deployed demo.
      "./src/features/scout/snapshot/*.json",
      "./src/features/dossier/snapshot/*.json",
      "./src/features/*/recordings/*.ndjson",
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
