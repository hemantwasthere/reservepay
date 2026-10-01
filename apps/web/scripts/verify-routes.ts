import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, preview, type PreviewServer } from "vite";
import { site } from "../src/lib/seo";

async function verify(server: PreviewServer["httpServer"], name: string) {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  for (const path of [
    "/",
    "/app",
    "/app/",
    "/app/index.html",
    "/app?source=header",
    "/app/?source=header",
  ]) {
    const response = await fetch(`${base}${path}`, {
      headers: { accept: "text/html" },
    });
    assert.equal(response.status, 200, `${name}: ${path}`);
    const html = await response.text();
    const dashboard = path !== "/";
    assert.ok(
      html.includes(
        `<title>${dashboard ? "Merchant dashboard | ReservePay" : site.title}</title>`,
      ),
      `${name}: wrong page at ${path}`,
    );
    assert.equal(
      html.includes('name="robots" content="noindex, nofollow"'),
      dashboard,
      `${name}: wrong indexing rules at ${path}`,
    );
  }
  for (const path of ["/does-not-exist", "/application", "/app/missing"]) {
    const response = await fetch(`${base}${path}`, {
      headers: { accept: "text/html" },
    });
    assert.equal(
      response.status,
      404,
      `${name}: ${path} must not fall back to the landing page`,
    );
    await response.body?.cancel();
  }
  console.log(
    `${name}: landing, dashboard URLs, query strings, and missing routes passed.`,
  );
}

const cacheDir = await mkdtemp(join(tmpdir(), "reservepay-route-check-"));
const development = await createServer({
  cacheDir,
  server: {
    host: "127.0.0.1",
    port: 0,
    watch: null,
    ws: false,
    preTransformRequests: false,
  },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  await development.listen();
  assert.ok(development.httpServer);
  await verify(development.httpServer, "Development");
} finally {
  await development.close();
  await rm(cacheDir, { recursive: true, force: true });
}

const production = await preview({ preview: { host: "127.0.0.1", port: 0 } });
try {
  await verify(production.httpServer, "Production preview");
} finally {
  await production.close();
}
