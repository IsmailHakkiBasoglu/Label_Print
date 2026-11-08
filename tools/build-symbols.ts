import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseSvg } from "../src/library/symbols/svg";

const root = join(import.meta.dirname, "..");
const lib = join(root, "src/library/symbols");
const source: Record<string, [string, string, string][]> = JSON.parse(readFileSync(join(lib, "source.json"), "utf8"));

const fileFor: Record<string, (name: string) => string> = {
  l: (n) => join(root, "node_modules/lucide-static/icons", `${n}.svg`),
  t: (n) => join(root, "node_modules/@tabler/icons/icons/outline", `${n}.svg`),
  o: (n) => join(lib, "own", `${n}.svg`),
};

const out: unknown[] = [];
const problems: string[] = [];
for (const [category, items] of Object.entries(source)) {
  for (const [id, ref, tags] of items) {
    const [pack, name] = ref.split(":");
    try {
      const icon = parseSvg(readFileSync(fileFor[pack](name), "utf8"));
      if ("error" in icon) problems.push(`${id}: ${icon.error}`);
      else out.push({ id, category, tags: tags.split(",").map((t) => t.trim()), icon });
    } catch {
      problems.push(`${id}: dosya yok (${ref})`);
    }
  }
}
writeFileSync(join(lib, "catalog.generated.json"), JSON.stringify(out) + "\n");
console.log(`semboller=${out.length}`);
if (problems.length) console.log(problems.join("\n"));
