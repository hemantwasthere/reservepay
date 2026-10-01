import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { site, structuredData } from "./src/lib/seo.ts";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "reservepay-seo",
      transformIndexHtml: (_, context) =>
        context.filename.endsWith("/app/index.html")
          ? []
          : [
              { tag: "title", children: site.title },
              {
                tag: "meta",
                attrs: { name: "description", content: site.description },
              },
              { tag: "link", attrs: { rel: "canonical", href: site.url } },
              ...Object.entries({
                "og:type": "website",
                "og:site_name": site.name,
                "og:title": site.title,
                "og:description": site.description,
                "og:url": site.url,
                "og:locale": "en_US",
                "og:image": site.image,
                "og:image:width": "1200",
                "og:image:height": "630",
                "og:image:type": "image/png",
                "og:image:alt":
                  "ReservePay. Good commerce. Built on trust. Protected USDC payments on Solana.",
              }).map(([property, content]) => ({
                tag: "meta",
                attrs: { property, content },
              })),
              ...Object.entries({
                "twitter:card": "summary_large_image",
                "twitter:title": site.title,
                "twitter:description": site.description,
                "twitter:image": site.image,
                "twitter:image:alt":
                  "ReservePay. Good commerce. Built on trust. Protected USDC payments on Solana.",
              }).map(([name, content]) => ({
                tag: "meta",
                attrs: { name, content },
              })),
              {
                tag: "script",
                attrs: { type: "application/ld+json" },
                children: JSON.stringify(structuredData).replaceAll(
                  "<",
                  "\\u003c",
                ),
              },
            ].map((tag) => ({ ...tag, injectTo: "head" as const })),
    },
  ],
  build: {
    rollupOptions: {
      input: {
        landing: resolve(import.meta.dirname, "index.html"),
        app: resolve(import.meta.dirname, "app/index.html"),
      },
    },
  },
  server: { port: 4173 },
});
