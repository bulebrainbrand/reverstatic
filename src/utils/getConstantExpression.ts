import { Result } from "@praha/byethrow";
import * as t from "@babel/types";

export type GetConstantExpressionError =
  | "not literal"
  | "template literal has expressions"
  | "unsupported unary expression";

export const getConstantExpression = (
  node: t.Node,
): Result.Result<t.Expression, GetConstantExpressionError> => {
  if (
    t.isNumericLiteral(node) ||
    t.isStringLiteral(node) ||
    t.isBooleanLiteral(node) ||
    t.isNullLiteral(node) ||
    t.isBigIntLiteral(node)
  ) {
    return Result.succeed(node);
  }

  if (t.isTemplateLiteral(node)) {
    return node.expressions.length === 0
      ? Result.succeed(node)
      : Result.fail("template literal has expressions");
  }

  if (t.isUnaryExpression(node)) {
    const argument = node.argument;
    if (
      node.operator === "-" &&
      (t.isNumericLiteral(argument) || t.isBigIntLiteral(argument))
    ) {
      return Result.succeed(node);
    }
    if (node.operator === "+" && t.isNumericLiteral(argument)) {
      return Result.succeed(node);
    }
    return Result.fail("unsupported unary expression");
  }

  return Result.fail("not literal");
};
