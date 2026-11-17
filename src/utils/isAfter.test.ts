import { parseSync, traverse } from "@babel/core";
import type { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { describe, expect, it } from "vite-plus/test";
import { isAfter } from "./isAfter";

const statementPathsOf = (code: string): NodePath[] => {
  const ast = parseSync(code, {
    ast: true,
    code: false,
    configFile: false,
    sourceType: "module",
  });
  if (!ast || typeof ast === "string") {
    throw new Error("failed to parse");
  }

  const result: NodePath[] = [];
  traverse(ast, {
    Statement(path) {
      result.push(path);
      path.skip();
    },
  });
  return result;
};

const declarationPathsOf = (
  declarations: t.VariableDeclaration[],
): NodePath[] => {
  const ast = t.file(t.program(declarations));

  const result: NodePath[] = [];
  traverse(ast, {
    VariableDeclaration(path) {
      result.push(path);
    },
  });
  return result;
};

describe("isAfter", () => {
  const code = `const a = 1;\nconst b = 2;`;

  it("returns true when the second node starts after the first ends", () => {
    const [first, second] = statementPathsOf(code);
    if (!first || !second) throw new Error("expected two statements");

    expect(isAfter(first, second)).toBe(true);
  });

  it("returns false when the second node comes before the first", () => {
    const [first, second] = statementPathsOf(code);
    if (!first || !second) throw new Error("expected two statements");

    expect(isAfter(second, first)).toBe(false);
  });

  it("returns false for the same node", () => {
    const [first] = statementPathsOf(code);
    if (!first) throw new Error("expected a statement");

    expect(isAfter(first, first)).toBe(false);
  });

  it("returns false when the nodes have no position information", () => {
    const [first, second] = declarationPathsOf([
      t.variableDeclaration("const", [
        t.variableDeclarator(t.identifier("a"), t.numericLiteral(1)),
      ]),
      t.variableDeclaration("const", [
        t.variableDeclarator(t.identifier("b"), t.numericLiteral(2)),
      ]),
    ]);
    if (!first || !second) throw new Error("expected two declarations");

    expect(isAfter(first, second)).toBe(false);
    expect(isAfter(second, first)).toBe(false);
  });
});
