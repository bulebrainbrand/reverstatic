import { NodePath, type PluginObject, PluginPass } from "@babel/core";
import * as t from "@babel/types";

function getVariablesInBody(path: NodePath): Set<string> {
  const vars = new Set<string>();

  path.traverse({
    VariableDeclarator(innerPath) {
      if (t.isIdentifier(innerPath.node.id)) {
        vars.add(innerPath.node.id.name);
      }
    },
  });

  return vars;
}

function usesAnyVariable(
  expression: t.Expression,
  bodyVariables: Set<string>,
): boolean {
  let found = false;

  const walk = (node: any) => {
    if (found) return;

    if (t.isIdentifier(node)) {
      if (bodyVariables.has(node.name)) {
        found = true;
      }
      return;
    }

    if (t.isNode(node)) {
      for (const key in node) {
        if (key.startsWith("_") || key === "loc" || key === "extra") continue;
        const value = (node as any)[key];
        if (Array.isArray(value)) {
          value.forEach(walk);
        } else if (t.isNode(value)) {
          walk(value);
        }
      }
    }
  };

  walk(expression);
  return found;
}

function canExtractExpression(
  expression: t.Expression,
  bodyVariables: Set<string>,
): boolean {
  // Cannot extract if it uses any body variables
  return !usesAnyVariable(expression, bodyVariables);
}

export default function (): PluginObject<PluginPass> {
  return {
    visitor: {
      DoWhileStatement(path) {
        const { node } = path;
        if (!t.isSequenceExpression(node.test)) {
          return;
        }

        const expressions = node.test.expressions;
        if (expressions.length < 2) {
          return;
        }

        const bodyVariables = getVariablesInBody(path.get("body"));
        const prefixExpressions = expressions.slice(0, -1);
        const extractableExpressions = prefixExpressions.filter((expression) =>
          canExtractExpression(expression, bodyVariables),
        );

        if (extractableExpressions.length === 0) {
          return;
        }

        const remainingExpressions = prefixExpressions.filter(
          (expression) => !canExtractExpression(expression, bodyVariables),
        );
        const lastExpression = expressions[expressions.length - 1];

        node.test =
          remainingExpressions.length > 0
            ? t.sequenceExpression([...remainingExpressions, lastExpression])
            : lastExpression;

        const statements = extractableExpressions.map((expression) =>
          t.expressionStatement(expression),
        );

        if (t.isBlockStatement(node.body)) {
          node.body.body.push(...statements);
        } else {
          node.body = t.blockStatement([node.body, ...statements]);
        }
      },
    },
  };
}