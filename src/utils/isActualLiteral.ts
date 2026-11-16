import type { NodePath } from "@babel/core";
import { Result } from "@praha/byethrow";
type IsActualUndefinedError = "non identifier" | "name is not undefined";
type IsActualNaNError = "non identifier" | "name is not NaN";
type IsActualInfinityError = "non identifier" | "name is not Infinity";
type IsActualValueError<T extends string> =
  | "non identifier"
  | `name is not ${T}`;
const isActualValue = <const T extends string>(
  path: NodePath,
  name: T,
): Result.Result<boolean, IsActualValueError<T>> => {
  if (!path.isIdentifier()) return Result.fail("non identifier");
  if (path.node.name !== name) {
    // @ts-expect-error
    return Result.fail(`name is not ${name}`);
  }
  return Result.succeed(path.scope.getBinding(name) === undefined);
};
export const isActualUndefined = (
  path: NodePath,
): Result.Result<boolean, IsActualUndefinedError> =>
  isActualValue(path, "undefined");
export const isActualNaN = (
  path: NodePath,
): Result.Result<boolean, IsActualNaNError> => isActualValue(path, "NaN");
export const isActualInfinity = (
  path: NodePath,
): Result.Result<boolean, IsActualInfinityError> =>
  isActualValue(path, "Infinity");
