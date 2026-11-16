import { type PluginObject, PluginPass } from "@babel/core";
import * as t from "@babel/types";

export default function (): PluginObject<PluginPass> {
  return {
    visitor: {
      IfStatement(path) {
        const test = path.node.test;
        if (!t.isSequenceExpression(test)) {
          return;
        }

        const expressions = test.expressions;
        if (expressions.length < 2) {
          return;
        }

        const hoistedStatements = expressions
          .slice(0, -1)
          .map((expr) => t.expressionStatement(expr));

        path.node.test = expressions[expressions.length - 1];
        path.insertBefore(hoistedStatements);
      },
    },
  };
}
