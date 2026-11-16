import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { defineConfig } from "vite-plus";
import oxlintByethrowPlugin from "@praha/byethrow-oxlint";

function collectEntries(dir: string): Record<string, string> {
  const entries: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
      if (statSync(full).size === 0) continue;
      const entryName = basename(name, ".ts");
      if (entries[entryName] !== undefined) {
        throw new Error(
          `Duplicate entry name: ${entryName} (${entries[entryName]} vs ${full})`,
        );
      }
      entries[entryName] = full;
    }
  };
  walk(dir);
  return entries;
}

const allPluginEntries = collectEntries(join(process.cwd(), "src", "plugins"));
const allPresetEntries = collectEntries(join(process.cwd(), "src", "presets"));
const allEntries: Record<string, string> = { ...allPluginEntries };
for (const [entryName, full] of Object.entries(allPresetEntries)) {
  if (allEntries[entryName] !== undefined) {
    throw new Error(
      `Duplicate entry name across plugins and presets: ${entryName} (${allEntries[entryName]} vs ${full})`,
    );
  }
  allEntries[entryName] = full;
}

const onlyEntryName = process.env.REVERSTATIC_ENTRY;
let entries: Record<string, string>;
if (onlyEntryName === undefined) {
  entries = allEntries;
} else {
  const found = allEntries[onlyEntryName];
  if (found === undefined) {
    throw new Error(`Unknown entry: ${onlyEntryName}`);
  }
  entries = { [onlyEntryName]: found };
}
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: onlyEntryName === undefined,
    sourcemap: false,
    minify: false,
    lib: {
      entry: entries,
      formats: ["es", "cjs"],
      fileName: (format, entryName) =>
        `${entryName}.${format === "cjs" ? "cjs" : "js"}`,
    },
    rollupOptions: {
      external: [/^@babel\//],
      output: onlyEntryName === undefined ? {} : { codeSplitting: false },
    },
  },
  lint: {
    extends: [oxlintByethrowPlugin.recommended],
    options: { typeAware: true, typeCheck: true },
    rules: {
      "typescript/await-thenable": "error",
      "typescript/no-array-delete": "error",
      "typescript/no-unsafe-type-assertion": "error",
      "unicorn/no-empty-file": "off",
    },
    ignorePatterns: ["*.target.js"],
  },
  fmt: {
    endOfLine: "lf",
    singleQuote: false,
    quoteProps: "as-needed",
    printWidth: 80,
    insertFinalNewline: true,
    sortPackageJson: true,
    objectWrap: "collapse",
  },
  test: {
    globals: true,
    include: ["src/**/*.test.ts", "__tests__/**/*.test.ts"],
    coverage: { enabled: true, provider: "v8", reporter: "text" },
  },
  run: {
    tasks: {
      lint: ["vp lint"],
      test: ["vp test --run  --passWithNoTests"],
      fmt: ["vp fmt"],
      build: [
        "rm -rf dist && for f in $(find src/plugins src/presets -name '*.ts' ! -name '*.test.ts' ! -empty); do REVERSTATIC_ENTRY=$(basename $f .ts) vp build; done",
      ],
      check: ["vpr lint", "vpr test"],
    },
  },
});
