import type { NodePath } from "@babel/core";
import * as t from "@babel/types";

const isEvalCall = (path: NodePath): boolean => {
  if (!path.isCallExpression()) return false;
  return t.isIdentifier(path.node.callee, { name: "eval" });
};

export const hasDynamicScope = (path: NodePath): boolean => {
  if (path.isWithStatement() || isEvalCall(path)) return true;

  let found = false;
  path.traverse({
    WithStatement(innerPath) {
      found = true;
      innerPath.stop();
    },
    CallExpression(innerPath) {
      if (t.isIdentifier(innerPath.node.callee, { name: "eval" })) {
        found = true;
        innerPath.stop();
      }
    },
  });
  return found;
};
