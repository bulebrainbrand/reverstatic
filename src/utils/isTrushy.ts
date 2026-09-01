import { Result } from "@praha/byethrow";
import * as t from "@babel/types";
import type { NodePath } from "@babel/core";
import { isActualUndefined } from "./isActualUndefined";
export const isTruhy = (path: NodePath): Result.Result<boolean, string> => {
  if (t.isLiteral(path.node)) return isLitealTruhy(path.node);
  if (t.isIdentifier(path.node)) {
    const isUndefinedResult = isActualUndefined(path);
    if (
      Result.isSuccess(isUndefinedResult) &&
      Result.unwrap(isUndefinedResult) === true
    ) {
      return Result.succeed(false);
    }
    return Result.fail("can't judge identifier");
  }
  return Result.fail("unexpected node");
};

export const isLitealTruhy = (
  node: t.Literal,
): Result.Result<boolean, string> => {
  if (node.type === "BooleanLiteral") {
    return Result.succeed(node.value);
  }
  if (node.type === "NullLiteral") {
    return Result.succeed(false);
  }
  if (node.type === "BigIntLiteral") {
    return Result.succeed(node.value !== 0n);
  }
  if (node.type === "NumericLiteral") {
    return Result.succeed(node.value !== 0);
  }
  if (node.type === "RegExpLiteral") {
    return Result.succeed(true);
  }
  if (node.type === "StringLiteral") {
    return Result.succeed(node.value !== "");
  }
  if (node.type === "TemplateLiteral") {
    return Result.fail("can't judge template literal");
  }
  node satisfies never;
  return Result.fail("unexpected");
};
