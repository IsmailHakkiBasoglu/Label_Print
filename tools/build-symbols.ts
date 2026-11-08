import { readdirSync, readFileSync, writeFileSync } from "node:fs";
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
      else out.push({ id, category, tags: tags.split(",").map((t) => t.trim()), icon: { ...icon, paths: icon.paths.map(({ fillColor: _f, strokeColor: _s, ...path }) => path) } });
    } catch {
      problems.push(`${id}: dosya yok (${ref})`);
    }
  }
}
writeFileSync(join(lib, "catalog.generated.json"), JSON.stringify(out) + "\n");
console.log(`semboller=${out.length}`);
if (problems.length) console.log(problems.join("\n"));

/** Set FLUENT_EMOJI_DIR to a checkout of microsoft/fluentui-emoji to rebuild the colour catalog; it is not kept in this repository. */
const colorDir = process.env.FLUENT_EMOJI_DIR;
if (colorDir) {
  const colorSource: Record<string, [string, string][]> = JSON.parse(readFileSync(join(lib, "color-source.json"), "utf8"));
  const colored: unknown[] = [];
  const skipped: string[] = [];
  for (const [category, items] of Object.entries(colorSource)) {
    for (const [name, tags] of items) {
      try {
        const folder = join(colorDir, "assets", name, "Flat");
        const file = readdirSync(folder).find((f) => f.endsWith(".svg"))!;
        const text = readFileSync(join(folder, file), "utf8");
        const icon = /opacity/.test(text) ? { error: "saydamlık var" } : parseSvg(text);
        if ("error" in icon) skipped.push(`${name}: ${icon.error}`);
        else colored.push({ id: `color:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, category, tags: tags.split(",").map((t) => t.trim()), icon });
      } catch {
        skipped.push(`${name}: dosya yok`);
      }
    }
  }
  writeFileSync(join(lib, "catalog.color.generated.json"), JSON.stringify(colored) + "\n");
  console.log(`renkli=${colored.length}`);
  if (skipped.length) console.log(skipped.join("\n"));
}
