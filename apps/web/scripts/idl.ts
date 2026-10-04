import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const sources = {
  json: join(root, "target/idl/reservepay.json"),
  ts: join(root, "target/types/reservepay.ts"),
};
const committed = {
  json: join(root, "apps/web/src/merchant/reservepay.json"),
  ts: join(root, "apps/web/src/merchant/reservepay.ts"),
};

async function formatFor(path: string, source: string): Promise<string> {
  // Honor a Prettier config if the project ever adds one; today there is none.
  const config = await prettier.resolveConfig(path);
  return prettier.format(source, { ...config, filepath: path });
}

async function render(): Promise<{ json: string; ts: string }> {
  // prettier's JSON printer keeps objects expanded when the source has them
  // expanded, so re-print with 2-space indent instead of compact stringify.
  const idl = JSON.parse(readFileSync(sources.json, "utf8"));
  const json = await formatFor(committed.json, JSON.stringify(idl, null, 2));
  const rawTs = readFileSync(sources.ts, "utf8");
  const stripped = rawTs.replace(/^\/\*\*[\s\S]*?\*\//, "").trimStart();
  const ts = await formatFor(committed.ts, stripped);
  return { json, ts };
}

async function sync() {
  const rendered = await render();
  writeFileSync(committed.json, rendered.json);
  writeFileSync(committed.ts, rendered.ts);
  console.log(
    "Synced apps/web/src/merchant/reservepay.{json,ts} from target/.",
  );
}

async function check() {
  const rendered = await render();
  let drifted = false;
  for (const kind of ["json", "ts"] as const) {
    const current = readFileSync(committed[kind], "utf8");
    if (current === rendered[kind]) continue;
    drifted = true;
    const dir = mkdtempSync(join(tmpdir(), "idl-check-"));
    try {
      const expected = join(dir, `reservepay.${kind}`);
      writeFileSync(expected, rendered[kind]);
      const diff = spawnSync(
        "git",
        ["diff", "--no-index", "--color=never", committed[kind], expected],
        { encoding: "utf8" },
      );
      // Without git (minimal containers) still report the drift clearly.
      if (diff.error || typeof diff.stdout !== "string")
        console.error(
          `${committed[kind]} differs from the build output ` +
            "(install git to see the diff).",
        );
      else process.stderr.write(diff.stdout);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  if (drifted) {
    console.error(
      "IDL drift: run `anchor build --ignore-keys && bun run idl:sync` " +
        "(do not run `anchor keys sync` — it would rewrite the program ID)",
    );
    process.exit(1);
  }
  console.log("Committed IDL matches target/.");
}

const command = process.argv[2];
if (command === "sync") {
  await sync();
} else if (command === "check") {
  await check();
} else {
  console.error("usage: bun apps/web/scripts/idl.ts <sync|check>");
  process.exit(2);
}
