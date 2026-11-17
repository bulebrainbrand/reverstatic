import { parseSync, traverse } from "@babel/core";
import type { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { describe, expect, it } from "vite-plus/test";
import { isWriteTarget } from "./isWriteTarget";

const memberPathOf = (code: string): NodePath<t.MemberExpression> => {
  const ast = parseSync(`var vC = [];\n${code}`, {
    ast: true,
    code: false,
    configFile: false,
    sourceType: "script",
  });
  if (!ast || typeof ast === "string") {
    throw new Error("failed to parse");
  }

  let result: NodePath<t.MemberExpression> | undefined;
  traverse(ast, {
    MemberExpression(path) {
      if (!t.isIdentifier(path.node.object, { name: "vC" })) return;
      result = path;
      path.stop();
    },
  });
  if (result === undefined) throw new Error("could not find the member path");
  return result;
};

const isTarget = (code: string): boolean => isWriteTarget(memberPathOf(code));

describe("isWriteTarget", () => {
  it("detects direct writes", () => {
    for (const code of [
      `vC[0] = 1;`,
      `vC[0] += 1;`,
      `vC[0]++;`,
      `++vC[0];`,
      `delete vC[0];`,
      `for (vC[0] of values) {}`,
      `for (vC[0] in value) {}`,
    ]) {
      expect(isTarget(code), code).toBe(true);
    }
  });

  it("detects destructuring writes", () => {
    for (const code of [
      `[vC[0]] = value;`,
      `({ a: vC[0] } = value);`,
      `({ ...vC[0] } = value);`,
      `[...vC[0]] = value;`,
      `[vC[0] = 1] = value;`,
      `({ a: vC[0] = 1 } = value);`,
      `[[vC[0]]] = value;`,
      `({ a: { b: vC[0] } } = value);`,
      `for ([vC[0]] of values) {}`,
      `for ({ a: vC[0] } in value) {}`,
    ]) {
      expect(isTarget(code), code).toBe(true);
    }
  });

  it("does not treat reads as writes", () => {
    for (const code of [
      `console.log(vC[0]);`,
      `const x = vC[0];`,
      `[x = vC[0]] = value;`,
      `({ a = vC[0] } = value);`,
      `({ a: x = vC[0] } = value);`,
      `({ [vC[0]]: x } = value);`,
      `const x = [vC[0]];`,
      `const x = { a: vC[0] };`,
      `const x = { [vC[0]]: 1 };`,
      `const x = [...vC[0]];`,
      `const x = { ...vC[0] };`,
      `for (x of vC[0]) {}`,
    ]) {
      expect(isTarget(code), code).toBe(false);
    }
  });
});
