import { type PluginObject, type PluginPass } from "@babel/core";
import * as t from "@babel/types";

const isEmptyFunction = (
  node: t.Node,
): node is t.FunctionExpression | t.ArrowFunctionExpression => {
  if (!t.isFunctionExpression(node) && !t.isArrowFunctionExpression(node)) {
    return false;
  }
  if (node.async || node.generator) {
    return false;
  }
  if (node.params.length !== 0) {
    return false;
  }
  if (!t.isBlockStatement(node.body)) {
    return false;
  }
  return node.body.body.length === 0;
};

export default function (): PluginObject<PluginPass> {
  return {
    visitor: {
      ExpressionStatement(path) {
        const expr = path.node.expression;
        if (!t.isCallExpression(expr)) {
          return;
        }
        const callee = expr.callee;
        if (!t.isIdentifier(callee)) {
          return;
        }
        const binding = path.scope.getBinding(callee.name);
        if (!binding) {
          return;
        }
        if (!binding.path.isFunctionDeclaration()) {
          return;
        }
        const funcNode = binding.path.node;
        if (funcNode.id?.name !== callee.name) {
          return;
        }
        if (funcNode.params.length !== 0) {
          return;
        }
        if (funcNode.body.body.length !== 1) {
          return;
        }
        const stmt = funcNode.body.body[0];
        if (!t.isExpressionStatement(stmt)) {
          return;
        }
        if (!t.isAssignmentExpression(stmt.expression, { operator: "=" })) {
          return;
        }
        const assign = stmt.expression;
        if (!t.isIdentifier(assign.left, { name: callee.name })) {
          return;
        }
        if (!isEmptyFunction(assign.right)) {
          return;
        }

        if (binding.constantViolations.length !== 1) {
          return;
        }
        const violation = binding.constantViolations[0];
        if (!violation.findParent((parent) => parent === binding.path)) {
          return;
        }

        if (expr.arguments.length === 0) {
          path.remove();
          return;
        }

        const statements: t.ExpressionStatement[] = [];
        for (const arg of expr.arguments) {
          if (!t.isExpression(arg)) {
            return;
          }
          statements.push(t.expressionStatement(arg));
        }
        path.replaceWithMultiple(statements);
      },
    },
  };
}
