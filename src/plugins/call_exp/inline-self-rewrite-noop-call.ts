import { type PluginObject, type PluginPass } from "@babel/core";
import * as t from "@babel/types";

const isEmptyFunction = (
  node: t.Node,
): node is t.FunctionExpression | t.ArrowFunctionExpression => {
  if (!t.isFunctionExpression(node) && !t.isArrowFunctionExpression(node)) {
    return false;
  }
  return (
    !node.async &&
    !node.generator &&
    node.params.length === 0 &&
    t.isBlockStatement(node.body) &&
    node.body.body.length === 0
  );
};

const isSelfOverwriteFunction = (
  fn: t.FunctionDeclaration,
  name: string,
): boolean => {
  if (fn.async || fn.generator || fn.params.length !== 0) return false;
  if (fn.body.body.length !== 1) return false;
  const stmt = fn.body.body[0];
  if (!t.isExpressionStatement(stmt)) return false;
  const assign = stmt.expression;
  return (
    t.isAssignmentExpression(assign, { operator: "=" }) &&
    t.isIdentifier(assign.left, { name }) &&
    isEmptyFunction(assign.right)
  );
};

export default function (): PluginObject<PluginPass> {
  return {
    visitor: {
      CallExpression(path) {
        const callee = path.node.callee;
        if (!t.isIdentifier(callee)) return;

        const binding = path.scope.getBinding(callee.name);
        if (!binding || !binding.path.isFunctionDeclaration()) return;

        const funcNode = binding.path.node;
        if (!isSelfOverwriteFunction(funcNode, callee.name)) return;

        // 再代入が関数内の1箇所だけであること
        if (binding.constantViolations.length !== 1) return;
        const violation = binding.constantViolations[0];
        if (!violation.findParent((p) => p === binding.path)) return;

        // 引数に spread があれば触らない
        const args = path.node.arguments;
        if (!args.every((a): a is t.Expression => t.isExpression(a))) return;

        const parent = path.parentPath;

        // f(); / f(a, b);  → 文として置換
        if (parent.isExpressionStatement()) {
          if (args.length === 0) {
            parent.remove();
          } else {
            parent.replaceWithMultiple(
              args.map((a) => t.expressionStatement(a)),
            );
          }
          return;
        }

        // 式の中: 戻り値は undefined
        path.replaceWith(
          args.length === 0
            ? t.unaryExpression("void", t.numericLiteral(0))
            : t.sequenceExpression([
                ...args,
                t.unaryExpression("void", t.numericLiteral(0)),
              ]),
        );
      },
    },
  };
}
