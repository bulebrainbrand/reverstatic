import { type PluginObject, PluginPass } from "@babel/core";
import * as t from "@babel/types";

function getVariablesInBody(path: any): Set<string> {
  const vars = new Set<string>();
  path.traverse({
    VariableDeclarator(innerPath: any) {
      if (innerPath.node.id.type === "Identifier") {
        vars.add(innerPath.node.id.name);
      }
    },
  });
  return vars;
}

function canExtractExpression(expr: any, bodyVars: Set<string>): boolean {
  // Check if the expression assigns to any variable that's declared in the body
  if (t.isAssignmentExpression(expr)) {
    const left = expr.left;
    if (t.isIdentifier(left) && bodyVars.has(left.name)) {
      return false;
    }
  }

  return true;
}

export default function (): PluginObject<PluginPass> {
  return {
    visitor: {
      ForStatement(path, state) {
        const { node } = path;
        const bodyVars = getVariablesInBody(path.get("body"));

        // Handle condition with sequence expression
        if (
          t.isSequenceExpression(node.test) &&
          node.test.expressions.length > 0
        ) {
          const expressions = node.test.expressions;
          const lastExpr = expressions[expressions.length - 1];
          const prefixExprs = expressions.slice(0, -1);

          const extractableExprs = prefixExprs.filter((expr) =>
            canExtractExpression(expr, bodyVars),
          );
          const remainingExprs = prefixExprs.filter(
            (expr) => !canExtractExpression(expr, bodyVars),
          );

          if (extractableExprs.length > 0) {
            // Keep expressions that cannot be moved in the condition.
            node.test =
              remainingExprs.length > 0
                ? t.sequenceExpression([...remainingExprs, lastExpr])
                : lastExpr;

            // Add movable expressions to the beginning of the body
            const prefixStmts = extractableExprs.map((expr) =>
              t.expressionStatement(expr),
            );

            if (t.isBlockStatement(node.body)) {
              node.body.body.unshift(...prefixStmts);
            } else {
              node.body = t.blockStatement([...prefixStmts, node.body as any]);
            }

            // Add the same expressions after the loop
            const suffixStmts = extractableExprs.map((expr) =>
              t.expressionStatement(t.cloneNode(expr)),
            );
            path.insertAfter(suffixStmts);
          }
        }

        // Handle update with sequence expression
        if (
          t.isSequenceExpression(node.update) &&
          node.update.expressions.length > 0
        ) {
          const expressions = node.update.expressions;
          const lastExpr = expressions[expressions.length - 1];
          const prefixExprs = expressions.slice(0, -1);

          const extractableExprs = prefixExprs.filter((expr) =>
            canExtractExpression(expr, bodyVars),
          );
          const remainingExprs = prefixExprs.filter(
            (expr) => !canExtractExpression(expr, bodyVars),
          );

          if (extractableExprs.length > 0) {
            // Keep expressions that cannot be moved in the update clause.
            node.update =
              remainingExprs.length > 0
                ? t.sequenceExpression([...remainingExprs, lastExpr])
                : lastExpr;

            // Add movable expressions to the end of the body
            const suffixStmts = extractableExprs.map((expr) =>
              t.expressionStatement(expr),
            );

            if (t.isBlockStatement(node.body)) {
              node.body.body.push(...suffixStmts);
            } else {
              node.body = t.blockStatement([node.body as any, ...suffixStmts]);
            }
          }
        }
      },
    },
  };
}
