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
  const { render } = await server.ssrLoadModule("/src/entry-server.tsx");
  const path = resolve("dist/index.html");
  const template = await readFile(path, "utf8");
  const marker = '<div id="root"></div>';
  if (!template.includes(marker)) throw new Error("Prerender root is missing.");
  await writeFile(
    path,
    template.replace(marker, () => `<div id="root">${render()}</div>`),
  );
  await writeFile(
    resolve("dist/robots.txt"),
    `User-agent: *\nAllow: /\n\nSitemap: ${site.url}sitemap.xml\n`,
  );
  await writeFile(
    resolve("dist/sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${site.url}</loc></url></urlset>\n`,
  );
  console.log("Prerendered landing page, robots.txt, and sitemap.xml.");
} finally {
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
}
