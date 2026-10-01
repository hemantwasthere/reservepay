import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { site } from "../src/lib/seo";

const html = await readFile("dist/index.html", "utf8");
assert.match(html, /<html lang="en">/);
assert.match(html.slice(0, 1024), /<meta charset="UTF-8"/);
assert.equal(
  [...html.matchAll(/<h1(?:\s|>)/g)].length,
  1,
  "One visible page heading is required.",
);
assert.match(html, /Good commerce\./);
assert.match(html, /Who can issue a refund\?/);
assert.match(html, /does not submit payment transactions/);
assert.equal([...html.matchAll(/<title>/g)].length, 1);
assert.ok(html.includes(`<title>${site.title}</title>`));
assert.equal([...html.matchAll(/rel="canonical"/g)].length, 1);
assert.ok(html.includes(`href="${site.url}"`));
assert.ok(html.includes(`content="${site.description}"`));
assert.match(
  html,
  /name="robots" content="index, follow, max-image-preview:large"/,
);
assert.match(html, /name="twitter:card" content="summary_large_image"/);
assert.match(html, /property="og:image"/);
const json = html.match(
  /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
)?.[1];
assert.ok(json, "Structured data must be present in the initial HTML.");
const schema = JSON.parse(json);
assert.equal(schema["@context"], "https://schema.org");
assert.equal(
  schema["@graph"].find(
    (item: { "@type": string }) => item["@type"] === "WebSite",
  ).url,
  site.url,
);

const ids = new Set(
  [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]),
);
for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) {
  assert.ok(ids.has(anchor), `Broken section link: #${anchor}`);
}
for (const [, asset] of html.matchAll(
  /(?:href|src)="(\/[^"?#]+)(?:[?#][^"]*)?"/g,
)) {
  await access(`dist${asset}`);
}
const image = await readFile("dist/og-image.png");
assert.equal(image.readUInt32BE(16), 1200);
assert.equal(image.readUInt32BE(20), 630);
const touchIcon = await readFile("dist/apple-touch-icon.png");
assert.equal(touchIcon.readUInt32BE(16), 180);
assert.equal(touchIcon.readUInt32BE(20), 180);
const robots = await readFile("dist/robots.txt", "utf8");
assert.ok(robots.includes("User-agent: *\nAllow: /"));
assert.ok(robots.includes(`Sitemap: ${site.url}sitemap.xml`));
const sitemap = await readFile("dist/sitemap.xml", "utf8");
assert.ok(sitemap.includes(`<loc>${site.url}</loc>`));
assert.equal([...sitemap.matchAll(/<loc>/g)].length, 1);
console.log(
  "SEO checks passed: prerendered content, metadata, structured data, links, icons, and crawler files.",
);

const dashboard = await readFile("dist/app/index.html", "utf8");
assert.match(dashboard, /<title>Merchant dashboard \| ReservePay<\/title>/);
assert.match(dashboard, /name="robots" content="noindex, nofollow"/);
assert.ok(!dashboard.includes("application/ld+json"));
assert.ok(!dashboard.includes('rel="canonical"'));
assert.ok(html.includes('href="/app"'));
