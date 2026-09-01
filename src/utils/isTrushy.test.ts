import { describe, it, expect } from "vite-plus/test";
import { traverse } from "@babel/core";
import * as t from "@babel/types";
import { Result } from "@praha/byethrow";
import { isTruhy } from "./isTrushy";

const isTruhyAtPath = (node: t.Expression): Result.Result<boolean, string> => {
  const ast = t.file(
    t.program([
      t.variableDeclaration("const", [
        t.variableDeclarator(t.identifier("value"), node),
      ]),
    ]),
  );
  let result: Result.Result<boolean, string> | undefined;

  traverse(ast, {
    Expression(path) {
      if (path.node !== node) return;
      result = isTruhy(path);
      path.stop();
    },
  });

  if (!result) throw new Error("could not find the expression path");
  return result;
};

describe("isTrushy", () => {
  describe("BooleanLiteral", () => {
    it("returns the value of the node", () => {
      expect(isTruhyAtPath(t.booleanLiteral(true))).toEqual(
        Result.succeed(true),
      );
      expect(isTruhyAtPath(t.booleanLiteral(false))).toEqual(
        Result.succeed(false),
      );
    });
  });

  describe("NullLiteral", () => {
    it("returns Success(false)", () => {
      expect(isTruhyAtPath(t.nullLiteral())).toEqual(Result.succeed(false));
    });
  });

  describe("BigIntLiteral", () => {
    it("returns false for zero and true for non-zero values", () => {
      expect(isTruhyAtPath(t.bigIntLiteral(0n))).toEqual(Result.succeed(false));
      expect(isTruhyAtPath(t.bigIntLiteral(1n))).toEqual(Result.succeed(true));
    });
  });

  describe("NumericLiteral", () => {
    it("returns false for zero and true for non-zero values", () => {
      expect(isTruhyAtPath(t.numericLiteral(0))).toEqual(Result.succeed(false));
      expect(isTruhyAtPath(t.numericLiteral(1))).toEqual(Result.succeed(true));
    });
  });

  describe("RegExpLiteral", () => {
    it("returns Success(true)", () => {
      expect(isTruhyAtPath(t.regExpLiteral("foo"))).toEqual(
        Result.succeed(true),
      );
    });
  });

  describe("StringLiteral", () => {
    it("returns false for an empty string and true otherwise", () => {
      expect(isTruhyAtPath(t.stringLiteral(""))).toEqual(Result.succeed(false));
      expect(isTruhyAtPath(t.stringLiteral("foo"))).toEqual(
        Result.succeed(true),
      );
    });
  });

  describe("TemplateLiteral", () => {
    it("returns a failure because its value cannot be judged", () => {
      const node = t.templateLiteral(
        [t.templateElement({ raw: "template", cooked: "template" }, true)],
        [],
      );

      expect(isTruhyAtPath(node)).toEqual(
        Result.fail("can't judge template literal"),
      );
    });
  });
  describe("Identifiter", () => {
    it("returns a failure because its value cannot be judged", () => {
      expect(isTruhyAtPath(t.identifier("foo"))).toEqual(
        Result.fail("can't judge identifier"),
      );
    });
    it("returns Success(false) when `undefined`", () => {
      expect(isTruhyAtPath(t.identifier("undefined"))).toEqual(
        Result.succeed(false),
      );
    });
  });
});