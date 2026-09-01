import { type PluginObject, PluginPass } from "@babel/core";
import * as t from "@babel/types";
export default function (): PluginObject<PluginPass> {
  return {
    visitor: {
      ForOfStatement(path) {
        const right = path.node.right;
        if (!t.isSequenceExpression(right)) {
          return;
        }

        const expressions = right.expressions;
        const hoistedStatements = expressions
          .slice(0, -1)
          .map((expr) => t.expressionStatement(expr));

        path.node.right = expressions[expressions.length - 1];

        path.replaceWithMultiple([...hoistedStatements, path.node]);
      },

      ForInStatement(path) {
        const right = path.node.right;
        if (!t.isSequenceExpression(right)) {
          return;
        }

        const expressions = right.expressions;
        const hoistedStatements = expressions
          .slice(0, -1)
          .map((expr) => t.expressionStatement(expr));

        path.node.right = expressions[expressions.length - 1];

        path.replaceWithMultiple([...hoistedStatements, path.node]);
      },
    },
  };
}