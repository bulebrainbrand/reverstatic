import * as t from "@babel/types";
import { Result } from "@praha/byethrow";
import { describe, expect, it } from "vite-plus/test";
import { getConstantExpression } from "./getConstantExpression";

describe("getConstantExpression", () => {
  it("accepts primitive literals", () => {
    expect(getConstantExpression(t.numericLiteral(1))).toEqual(
      Result.succeed(t.numericLiteral(1)),
    );
    expect(getConstantExpression(t.stringLiteral("x"))).toEqual(
      Result.succeed(t.stringLiteral("x")),
    );
    expect(getConstantExpression(t.booleanLiteral(true))).toEqual(
      Result.succeed(t.booleanLiteral(true)),
    );
    expect(getConstantExpression(t.nullLiteral())).toEqual(
      Result.succeed(t.nullLiteral()),
    );
    expect(getConstantExpression(t.bigIntLiteral(1n))).toEqual(
      Result.succeed(t.bigIntLiteral(1n)),
    );
  });

  it("accepts a template literal without expressions", () => {
    const node = t.templateLiteral([t.templateElement({ raw: "x" })], []);
    expect(getConstantExpression(node)).toEqual(Result.succeed(node));
  });

  it("rejects a template literal with expressions", () => {
    const node = t.templateLiteral(
      [t.templateElement({ raw: "x" }), t.templateElement({ raw: "" })],
      [t.identifier("a")],
    );
    expect(getConstantExpression(node)).toEqual(
      Result.fail("template literal has expressions"),
    );
  });

  it("accepts signed numeric and bigint literals", () => {
    const negative = t.unaryExpression("-", t.numericLiteral(1));
    const negativeBigInt = t.unaryExpression("-", t.bigIntLiteral(1n));
    const positive = t.unaryExpression("+", t.numericLiteral(1));
    expect(getConstantExpression(negative)).toEqual(Result.succeed(negative));
    expect(getConstantExpression(negativeBigInt)).toEqual(
      Result.succeed(negativeBigInt),
    );
    expect(getConstantExpression(positive)).toEqual(Result.succeed(positive));
  });

  it("rejects unsupported unary expressions", () => {
    expect(
      getConstantExpression(t.unaryExpression("+", t.bigIntLiteral(1n))),
    ).toEqual(Result.fail("unsupported unary expression"));
    expect(
      getConstantExpression(t.unaryExpression("-", t.identifier("a"))),
    ).toEqual(Result.fail("unsupported unary expression"));
    expect(
      getConstantExpression(t.unaryExpression("void", t.numericLiteral(0))),
    ).toEqual(Result.fail("unsupported unary expression"));
  });

  it("rejects non-literal expressions", () => {
    expect(getConstantExpression(t.regExpLiteral("x"))).toEqual(
      Result.fail("not literal"),
    );
    expect(getConstantExpression(t.arrayExpression([]))).toEqual(
      Result.fail("not literal"),
    );
    expect(getConstantExpression(t.objectExpression([]))).toEqual(
      Result.fail("not literal"),
    );
    expect(getConstantExpression(t.identifier("a"))).toEqual(
      Result.fail("not literal"),
    );
  });
});
