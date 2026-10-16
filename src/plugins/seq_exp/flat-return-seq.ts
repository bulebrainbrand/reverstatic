import { type PluginObject, PluginPass } from "@babel/core";
import * as t from "@babel/types";
export default function (): PluginObject<PluginPass> {
  return {
    visitor: {
      ReturnStatement(path) {
        const expr = path.node.argument;
        if (!t.isSequenceExpression(expr)) {
          return;
        }
        const lastIndex = expr.expressions.length - 1;
        const statements = expr.expressions.map((expr, i) =>
          i === lastIndex
            ? t.returnStatement(expr)
            : t.expressionStatement(expr),
        );
        path.replaceWithMultiple(statements);
      },
    },
  };
}
