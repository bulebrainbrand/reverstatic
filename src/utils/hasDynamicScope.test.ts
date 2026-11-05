import { parseSync, traverse } from "@babel/core";
import type { NodePath } from "@babel/core";
import { describe, expect, it } from "vite-plus/test";
import { hasDynamicScope } from "./hasDynamicScope";

const programPathOf = (
  code: string,
  sourceType: "script" | "module" = "module",
): NodePath => {
  const ast = parseSync(code, {
    ast: true,
    code: false,
    configFile: false,
    sourceType,
  });
  if (!ast || typeof ast === "string") {
    throw new Error("failed to parse");
  }

  let result: NodePath | undefined;
  traverse(ast, {
    Program(path) {
      result = path;
      path.stop();
    },
  });
  if (result === undefined) throw new Error("could not find program");
  return result;
};

const check = (
  code: string,
  sourceType: "script" | "module" = "module",
): boolean => hasDynamicScope(programPathOf(code, sourceType));

const callPathOf = (code: string): NodePath => {
  let result: NodePath | undefined;
  programPathOf(code).traverse({
    CallExpression(path) {
      result = path;
      path.stop();
    },
  });
  if (result === undefined) throw new Error("could not find call expression");
  return result;
};

describe("hasDynamicScope", () => {
  it("returns false for ordinary code", () => {
    expect(check(`const a = 1;\nconsole.log(a);`)).toBe(false);
  });

  it("returns false for an eval member call", () => {
    expect(check(`obj.eval("console.log(a)");`)).toBe(false);
  });

  it("returns false for an eval reference", () => {
    expect(check(`const f = eval;`)).toBe(false);
  });

  it("returns true for a with statement", () => {
    expect(check(`with (o) {\n  console.log(a);\n}`, "script")).toBe(true);
  });

  it("returns true for a direct eval call", () => {
    expect(check(`eval("console.log(a)");`)).toBe(true);
  });

  it("returns true for eval inside a nested function", () => {
    expect(check(`function f() {\n  eval("x");\n}`)).toBe(true);
  });

  it("returns true when the path itself is an eval call", () => {
    expect(hasDynamicScope(callPathOf(`eval("x");`))).toBe(true);
  });
});
