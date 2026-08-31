import { type Literal } from "@babel/types";
import { Result } from "@praha/byethrow";

export const isTruhy = (node: Literal): Result.Result<boolean, string> => {
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
  return Result.fail("unexpected node");
};
