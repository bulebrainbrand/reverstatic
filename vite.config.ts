import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { defineConfig } from "vite-plus";
import oxlintByethrowPlugin from "@praha/byethrow-oxlint";

function collectPluginEntries(): Record<string, string> {
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
          `Duplicate plugin entry name: ${entryName} (${entries[entryName]} vs ${full})`,
        );
      }
      entries[entryName] = full;
    }
  };
  walk(join(process.cwd(), "src", "plugins"));
  return entries;
}

const allPluginEntries = collectPluginEntries();

const onlyPluginName = process.env.REVERSTATIC_PLUGIN;
let pluginEntries: Record<string, string>;
if (onlyPluginName === undefined) {
  pluginEntries = allPluginEntries;
} else {
  const found = allPluginEntries[onlyPluginName];
  if (found === undefined) {
    throw new Error(`Unknown plugin: ${onlyPluginName}`);
  }
  pluginEntries = { [onlyPluginName]: found };
}
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: onlyPluginName === undefined,
    sourcemap: false,
    minify: false,
    lib: {
      entry: pluginEntries,
      formats: ["es", "cjs"],
      fileName: (format, entryName) =>
        `${entryName}.${format === "cjs" ? "cjs" : "js"}`,
    },
    rollupOptions: {
      external: [/^@babel\//],
      output: onlyPluginName === undefined ? {} : { codeSplitting: false },
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
    ignorePatterns: ["./target/**/*", "./dist/**/*"],
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
        "rm -rf dist && for f in $(find src/plugins -name '*.ts' ! -name '*.test.ts' ! -empty); do REVERSTATIC_PLUGIN=$(basename $f .ts) vp build; done",
      ],
      check: ["vpr lint", "vpr test"],
    },
  },
});
