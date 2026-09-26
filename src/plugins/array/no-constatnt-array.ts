import { type NodePath, type PluginObject, type PluginPass } from "@babel/core";
import * as t from "@babel/types";
import { isNoSideEffect } from "../../utils/isNoSideEffect";

export default function (): PluginObject<PluginPass> {
  return {
    visitor: {
      VariableDeclarator(path) {
        const idPath = path.get("id");
        if (!idPath.isIdentifier()) return;
        const initPath = path.get("init");
        if (!initPath.isArrayExpression()) return;

        const elementPaths = initPath.get("elements");

        for (const elementPath of elementPaths) {
          const elementNode = elementPath.node;
          if (elementNode == null) return;
          if (elementPath.isSpreadElement()) return;

          if (elementPath.isIdentifier()) {
            if (
              elementPath.node.name !== "undefined" ||
              elementPath.scope.getBinding("undefined") !== undefined
            ) {
              return;
            }
          }

          let hasIdentifier = false;
          elementPath.traverse({
            Identifier(innerPath) {
              if (!innerPath.isReferencedIdentifier()) return;
              if (
                innerPath.node.name === "undefined" &&
                innerPath.scope.getBinding("undefined") === undefined
              ) {
                return;
              }
              hasIdentifier = true;
              innerPath.stop();
            },
          });
          if (hasIdentifier) return;

          if (!isNoSideEffect(elementPath as NodePath)) return;
        }

        const binding = path.scope.getBinding(idPath.node.name);
        if (!binding) return;
        if (binding.constantViolations.length !== 0) return;
        if (binding.referencePaths.length === 0) return;

        const targets: {
          memberPath: NodePath<t.MemberExpression>;
          elementNode: t.Expression;
        }[] = [];

        for (const referencePath of binding.referencePaths) {
          const parentPath = referencePath.parentPath;
          if (!parentPath?.isMemberExpression()) return;
          if (parentPath.node.object !== referencePath.node) return;
          if (parentPath.node.computed !== true) return;

          const propertyNode = parentPath.node.property;
          if (!t.isNumericLiteral(propertyNode)) return;
          if (!Number.isInteger(propertyNode.value)) return;
          const index = propertyNode.value;
          if (index < 0 || index >= elementPaths.length) return;

          const elementNode = elementPaths[index].node;
          if (elementNode == null) return;
          if (t.isSpreadElement(elementNode)) return;

          const grandParentPath = parentPath.parentPath;
          if (
            grandParentPath?.isAssignmentExpression() &&
            grandParentPath.node.left === parentPath.node
          ) {
            return;
          }
          if (
            grandParentPath?.isUpdateExpression() &&
            grandParentPath.node.argument === parentPath.node
          ) {
            return;
          }
          if (
            grandParentPath?.isUnaryExpression() &&
            grandParentPath.node.operator === "delete" &&
            grandParentPath.node.argument === parentPath.node
          ) {
            return;
          }
          if (
            grandParentPath?.isForXStatement() &&
            grandParentPath.node.left === parentPath.node
          ) {
            return;
          }

          targets.push({
            memberPath: parentPath as NodePath<t.MemberExpression>,
            elementNode: elementNode as t.Expression,
          });
        }

        for (const { memberPath, elementNode } of targets) {
          memberPath.replaceWith(t.cloneNode(elementNode, true));
        }
      },
    },
  };
}
