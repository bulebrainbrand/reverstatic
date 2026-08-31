import { traverse } from "@babel/core";
import * as t from "@babel/types";
import { Result } from "@praha/byethrow";
import { describe, expect, it } from "vite-plus/test";
import { isActualUndefined } from "./isActualUndefined";

type IsActualUndefinedResult = ReturnType<typeof isActualUndefined>;

const isActualUndefinedAtPath = (
  node: t.Expression,
): IsActualUndefinedResult => {
  const ast = t.file(t.program([t.expressionStatement(node)]));
  let result: IsActualUndefinedResult | undefined;

  traverse(ast, {
    Expression(path) {
      if (path.node !== node) return;
      result = isActualUndefined(path);
      path.stop();
    },
  });

  if (!result) throw new Error("could not find the expression path");
  return result;
};

describe("isActualUndefined", () => {
  it("returns a failure for a non-identifier", () => {
    expect(isActualUndefinedAtPath(t.numericLiteral(1))).toEqual(
      Result.fail("non identifier"),
    );
  });

  it("returns a failure for an identifier other than `undefined`", () => {
    expect(isActualUndefinedAtPath(t.identifier("value"))).toEqual(
      Result.fail("name is not undefined"),
    );
  });

  it("returns true for an unbound `undefined` identifier", () => {
    expect(isActualUndefinedAtPath(t.identifier("undefined"))).toEqual(
      Result.succeed(true),
    );
  });

  it("returns false when `undefined` is shadowed by a local binding", () => {
    const reference = t.identifier("undefined");
    const ast = t.file(
      t.program([
        t.variableDeclaration("const", [
          t.variableDeclarator(t.identifier("undefined"), t.numericLiteral(1)),
        ]),
        t.expressionStatement(reference),
      ]),
    );
    let result: IsActualUndefinedResult | undefined;

    traverse(ast, {
      Expression(path) {
        if (path.node !== reference) return;
        result = isActualUndefined(path);
        path.stop();
      },
    });

    expect(result).toEqual(Result.succeed(false));
  });
  it("returns false when `undefined` is assinged", () => {
    const reference = t.identifier("undefined");
    const ast = t.file(
      t.program([
        t.expressionStatement(
          t.assignmentExpression(
            "=",
            t.identifier("undefined"),
            t.stringLiteral("foo"),
          ),
        ),
        t.expressionStatement(reference),
      ]),
    );
    let result: IsActualUndefinedResult | undefined;

    traverse(ast, {
      Expression(path) {
        if (path.node !== reference) return;
        result = isActualUndefined(path);
        path.stop();
      },
    });

    expect(result).toEqual(Result.succeed(true));
  });
});
