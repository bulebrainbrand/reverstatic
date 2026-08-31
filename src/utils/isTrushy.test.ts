import { describe, it, expect } from "vite-plus/test";
import * as t from "@babel/types";
import { Result } from "@praha/byethrow";
import { isTruhy } from "./isTrushy";

describe("isTrushy", () => {
  describe("BooleanLiteral", () => {
    it("returns the value of the node", () => {
      expect(isTruhy(t.booleanLiteral(true))).toEqual(Result.succeed(true));
      expect(isTruhy(t.booleanLiteral(false))).toEqual(Result.succeed(false));
    });
  });

  describe("NullLiteral", () => {
    it("returns Success(false)", () => {
      expect(isTruhy(t.nullLiteral())).toEqual(Result.succeed(false));
    });
  });

  describe("BigIntLiteral", () => {
    it("returns false for zero and true for non-zero values", () => {
      expect(isTruhy(t.bigIntLiteral(0n))).toEqual(Result.succeed(false));
      expect(isTruhy(t.bigIntLiteral(1n))).toEqual(Result.succeed(true));
    });
  });

  describe("NumericLiteral", () => {
    it("returns false for zero and true for non-zero values", () => {
      expect(isTruhy(t.numericLiteral(0))).toEqual(Result.succeed(false));
      expect(isTruhy(t.numericLiteral(1))).toEqual(Result.succeed(true));
    });
  });

  describe("RegExpLiteral", () => {
    it("returns Success(true)", () => {
      expect(isTruhy(t.regExpLiteral("foo"))).toEqual(Result.succeed(true));
    });
  });

  describe("StringLiteral", () => {
    it("returns false for an empty string and true otherwise", () => {
      expect(isTruhy(t.stringLiteral(""))).toEqual(Result.succeed(false));
      expect(isTruhy(t.stringLiteral("foo"))).toEqual(Result.succeed(true));
    });
  });

  describe("TemplateLiteral", () => {
    it("returns a failure because its value cannot be judged", () => {
      const node = t.templateLiteral(
        [t.templateElement({ raw: "template", cooked: "template" }, true)],
        [],
      );

      expect(isTruhy(node)).toEqual(
        Result.fail("can't judge template literal"),
      );
    });
  });
});
