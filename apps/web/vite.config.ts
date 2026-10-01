import { resolve } from "node:path";
import { defineConfig, type Connect } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { site, structuredData } from "./src/lib/seo.ts";

const routeDashboard: Connect.NextHandleFunction = (
  request,
  _response,
  next,
) => {
  const [path, ...query] = (request.url ?? "/").split("?");
  if (path === "/app" || path === "/app/") {
    request.url = `/app/index.html${query.length ? `?${query.join("?")}` : ""}`;
  }
  next();
};

export default defineConfig({
  appType: "mpa",
  cacheDir: resolve(
    import.meta.dirname,
    "node_modules/.vite",
    `dev-${process.pid}`,
  ),
  resolve: { dedupe: ["react", "react-dom"] },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "lucide-react",
      "convex/react",
      "@coral-xyz/anchor",
      "@solana/web3.js",
      "@solana/spl-token",
      "@wallet-standard/app",
      "bn.js",
      "buffer",
      "bs58",
    ],
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "reservepay-dashboard-route",
      configureServer(server) {
        server.middlewares.use(routeDashboard);
      },
      configurePreviewServer(server) {
        server.middlewares.use(routeDashboard);
      },
    },
    {
      name: "reservepay-initial-content",
      async transformIndexHtml(html, context) {
        if (!context.server) return html;
        const { render, renderMerchant } = await context.server.ssrLoadModule(
          "/src/entry-server.tsx",
        );
        const content = context.filename.endsWith("/app/index.html")
          ? renderMerchant()
          : render();
        return html.replace(
          '<div id="root"></div>',
          () => `<div id="root">${content}</div>`,
        );
      },
    },
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
