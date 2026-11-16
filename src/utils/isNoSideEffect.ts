import type { NodePath } from "@babel/core";
import { isActualUndefined } from "./isActualLiteral";
import { Result } from "@praha/byethrow";

export const isNoSideEffect = (node: NodePath) => {
  if (node.isIdentifier()) return true;
  if (node.isLiteral()) {
    if (node.type === "TemplateLiteral") {
      return node.node.expressions.length === 0;
    }
    return true;
  }
  const isActualUndefinedResult = isActualUndefined(node);
  if (
    Result.isSuccess(isActualUndefinedResult) &&
    Result.unwrap(isActualUndefinedResult) === true
  ) {
    return true;
  }
  return false;
};
