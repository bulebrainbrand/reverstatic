import type { NodePath } from "@babel/core";
import { Result } from "@praha/byethrow";
export const isActualUndefined = (
  path: NodePath,
): Result.Result<boolean, string> => {
  if (!path.isIdentifier()) return Result.fail("non identifier");
  if (path.node.name !== "undefined")
    return Result.fail("name is not undefined");
  return Result.succeed(path.scope.getBinding("undefined") === undefined);
};