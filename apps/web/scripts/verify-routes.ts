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
    "/app/payments",
    "/app/payments/",
    "/app/payments?source=sidebar",
    "/app/payments/index.html",
    "/app/profile",
    "/app/profile/",
    "/app/profile/index.html",
    "/app/disputes",
    "/app/disputes/",
    "/app/disputes/index.html",
    "/pay/test-link",
    "/pay/test-link/",
    "/pay/test-link?source=merchant",
  ]) {
    const response = await fetch(`${base}${path}`, {
      headers: { accept: "text/html" },
    });
    assert.equal(response.status, 200, `${name}: ${path}`);
    const html = await response.text();
    const dashboard = path.startsWith("/app");
    const checkout = path.startsWith("/pay");
    const payments = path.startsWith("/app/payments");
    const profile = path.startsWith("/app/profile");
    const disputes = path.startsWith("/app/disputes");
    assert.ok(
      html.includes(
        dashboard
          ? "merchant-main"
          : checkout
            ? "checkout-main"
            : "Good commerce.",
      ),
      `${name}: initial page content is missing at ${path}`,
    );
    assert.ok(
      html.includes("/fonts/dm-sans-latin.woff2"),
      `${name}: font preload is missing`,
    );
    assert.ok(
      !html.includes("fonts.googleapis.com"),
      `${name}: fonts must be served locally`,
    );
    assert.ok(
      html.includes(
        `<title>${payments ? "Payment links | ReservePay" : profile ? "Profile | ReservePay" : disputes ? "Disputes | ReservePay" : dashboard ? "Merchant dashboard | ReservePay" : checkout ? "Protected checkout | ReservePay" : site.title}</title>`,
      ),
      `${name}: wrong page at ${path}`,
    );
    if (dashboard) {
      const marker = payments
        ? "Your next payment,"
        : profile
          ? "Your name,"
          : disputes
            ? "Every dispute,"
            : "Your reserve,";
      assert.ok(
        html.includes(marker),
        `${name}: ${path} is missing its own page heading`,
      );
      for (const other of [
        "Your next payment,",
        "Your name,",
        "Every dispute,",
        "Your reserve,",
      ].filter((heading) => heading !== marker))
        assert.ok(
          !html.includes(other),
          `${name}: another page's heading appears at ${path}`,
        );
      assert.ok(
        html.includes(
          payments
            ? 'href="/app/payments" aria-label="Payment links" aria-current="page"'
            : profile
              ? 'href="/app/profile" aria-label="Profile" aria-current="page"'
              : disputes
                ? 'href="/app/disputes" aria-label="Disputes" aria-current="page"'
                : 'href="/app" aria-label="Overview" aria-current="page"',
        ),
        `${name}: active workspace navigation`,
      );
    }
    assert.equal(
      html.includes('name="robots" content="noindex, nofollow"'),
      dashboard || checkout,
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
