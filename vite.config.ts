import { defineConfig } from "vite-plus";
import oxlintByethrowPlugin from "@praha/byethrow-oxlint";
export default defineConfig({
  lint: {
    extends: [oxlintByethrowPlugin.recommended],
    options: { typeAware: true, typeCheck: true },
    rules: {
      "typescript/await-thenable": "error",
      "typescript/no-array-delete": "error",
      "typescript/no-unsafe-type-assertion": "error",
      "unicorn/no-empty-file": "off",
    },
    ignorePatterns: ["./target/**/*"],
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
      dev: ["vp dev --host"],
      tunnel: ["cloudflared tunnel --url http://localhost:5173"],
      check: ["vpr lint", "vpr test"],
    },
    cache: { tasks: false },
  },
});
