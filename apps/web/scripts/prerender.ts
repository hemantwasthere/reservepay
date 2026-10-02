import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "vite";
import { site } from "../src/lib/seo";

const cacheDir = await mkdtemp(join(tmpdir(), "reservepay-prerender-"));
const server = await createServer({
  cacheDir,
  server: { middlewareMode: true, watch: null, ws: false },
  appType: "custom",
});

try {
  const { render, renderMerchant, renderCheckout } = await server.ssrLoadModule(
    "/src/entry-server.tsx",
  );
  for (const [file, content] of [
    ["dist/index.html", render()],
    ["dist/app/index.html", renderMerchant()],
    ["dist/app/payments/index.html", renderMerchant("payments")],
    ["dist/pay/index.html", renderCheckout()],
  ]) {
    const path = resolve(file);
    const template = await readFile(path, "utf8");
    const marker = file.includes("/payments/")
      ? '<div id="root" data-page="payments"></div>'
      : '<div id="root"></div>';
    if (!template.includes(marker))
      throw new Error("Prerender root is missing.");
    await writeFile(
      path,
      template.replace(marker, () => `${marker.slice(0, -6)}${content}</div>`),
    );
  }
  await writeFile(
    resolve("dist/robots.txt"),
    `User-agent: *\nAllow: /\n\nSitemap: ${site.url}sitemap.xml\n`,
  );
  await writeFile(
    resolve("dist/sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${site.url}</loc></url></urlset>\n`,
  );
  console.log(
    "Prerendered landing and dashboard pages, robots.txt, and sitemap.xml.",
  );
} finally {
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
}
