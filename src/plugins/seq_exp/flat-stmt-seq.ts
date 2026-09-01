import { type PluginObject, PluginPass } from "@babel/core";
import * as t from "@babel/types";
export default function (): PluginObject<PluginPass> {
  return {
    visitor: {
      ExpressionStatement(path) {
        const expr = path.node.expression;
        if (!t.isSequenceExpression(expr)) {
          return;
        }
        const statements = expr.expressions.map((expr) =>
          t.expressionStatement(expr),
        );

        path.replaceWithMultiple(statements);
      },
    },
  };
}
