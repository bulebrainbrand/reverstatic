import { type PluginObject, PluginPass } from "@babel/core";
import * as t from "@babel/types";
import { isNoSideEffect } from "../../utils/isNoSideEffect";
export default function (): PluginObject<PluginPass> {
  return {
    visitor: {
      UnaryExpression(path) {
        const node = path.node;
        if (node.operator !== "void") return;
        const argPath = path.get("argument");
        if (argPath.isSequenceExpression()) {
          const expPath = argPath.get("expressions");
          const newExpressions = expPath.filter(
            (path) => !isNoSideEffect(path),
          );
          if (newExpressions.length === 0) {
            if (path.scope.getBinding("undefined")) {
              argPath.replaceWith(t.numericLiteral(0));
            } else {
              path.replaceWith(t.identifier("undefined"));
            }
          } else {
            argPath.node.expressions = newExpressions.map((path) => path.node);
          }
        }
        const result = isNoSideEffect(argPath);
        if (result) {
          if (path.scope.getBinding("undefined")) {
            argPath.replaceWith(t.numericLiteral(0));
          } else {
            path.replaceWith(t.identifier("undefined"));
          }
        }

        return;
      },
    },
  };
}
