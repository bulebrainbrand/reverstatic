import { type NodePath, type PluginObject, type PluginPass } from "@babel/core";
import * as t from "@babel/types";
import { Result } from "@praha/byethrow";
import { getConstantExpression } from "../../utils/getConstantExpression";
import { hasDynamicScope } from "../../utils/hasDynamicScope";

type PluginState = PluginPass & { hasDynamicScope?: boolean };

const isAfterDeclaration = (
  usePath: NodePath,
  declaratorPath: NodePath<t.VariableDeclarator>,
): boolean => {
  const start = usePath.node.start;
  const end = declaratorPath.node.end;
  if (typeof start !== "number" || typeof end !== "number") return false;
  return start >= end;
};

const isInitializationGuaranteed = (
  declaratorPath: NodePath<t.VariableDeclarator>,
): boolean => {
  const declarationPath = declaratorPath.parentPath;
  if (!declarationPath?.isVariableDeclaration()) return false;
  if (declarationPath.node.kind !== "var") return true;

  const statementPath = declarationPath.parentPath;
  if (!statementPath) return false;
  if (statementPath.isProgram()) return true;
  if (
    statementPath.isBlockStatement() &&
    statementPath.parentPath?.isFunction() &&
    statementPath.parentPath.node.body === statementPath.node
  ) {
    return true;
  }
  return false;
};

const resolveConstant = (
  path: NodePath,
  seen: Set<t.Node>,
): t.Expression | undefined => {
  const node = path.node;
  const constant = getConstantExpression(node);
  if (Result.isSuccess(constant)) return Result.unwrap(constant);

  if (!path.isIdentifier()) return undefined;

  const identifier = path.node;
  const name = identifier.name;
  if (name === "undefined") {
    return path.scope.getBinding(name) === undefined ? identifier : undefined;
  }

  const binding = path.scope.getBinding(name);
  if (!binding) return undefined;
  if (binding.constantViolations.length !== 0) return undefined;

  const declaratorPath = binding.path;
  if (!declaratorPath.isVariableDeclarator()) return undefined;
  const declaratorNode = declaratorPath.node;
  if (!t.isIdentifier(declaratorNode.id, { name })) return undefined;
  if (!isInitializationGuaranteed(declaratorPath)) return undefined;
  if (!isAfterDeclaration(path, declaratorPath)) return undefined;
  if (seen.has(declaratorNode)) return undefined;

  const initPath = declaratorPath.get("init");
  if (Array.isArray(initPath) || initPath.node == null) return undefined;

  seen.add(declaratorNode);
  const result = resolveConstant(initPath, seen);
  seen.delete(declaratorNode);
  return result;
};

const canReplaceReference = (path: NodePath): boolean => {
  if (!path.isIdentifier()) return false;
  const parentPath = path.parentPath;
  if (!parentPath) return false;
  if (parentPath.isExportSpecifier()) return false;
  if (
    parentPath.isAssignmentExpression() &&
    parentPath.node.left === path.node
  ) {
    return false;
  }
  if (parentPath.isUpdateExpression()) return false;
  if (parentPath.isUnaryExpression({ operator: "delete" })) return false;
  if (parentPath.isForXStatement() && parentPath.node.left === path.node) {
    return false;
  }
  if (parentPath.isTaggedTemplateExpression({ tag: path.node })) return false;
  if (
    parentPath.isArrayPattern() ||
    parentPath.isRestElement() ||
    parentPath.isAssignmentPattern()
  ) {
    return false;
  }
  if (
    parentPath.isObjectProperty() &&
    parentPath.parentPath?.isObjectPattern()
  ) {
    return false;
  }
  return true;
};

const isExportedDeclaration = (
  path: NodePath<t.VariableDeclarator>,
): boolean => {
  const declarationPath = path.parentPath;
  if (!declarationPath?.isVariableDeclaration()) return false;
  return declarationPath.parentPath?.isExportNamedDeclaration() === true;
};

const materialize = (value: t.Expression, path: NodePath): t.Expression => {
  if (
    t.isIdentifier(value, { name: "undefined" }) &&
    path.scope.getBinding("undefined") !== undefined
  ) {
    return t.unaryExpression("void", t.numericLiteral(0));
  }
  return t.cloneNode(value, true);
};

const unusedName = (name: string, path: NodePath): string => {
  const base = `__unused_${name}__`;
  if (!path.scope.hasBinding(base) && !path.scope.hasGlobal(base)) {
    return base;
  }
  return path.scope.generateUid(base);
};

export default function (): PluginObject<PluginState> {
  return {
    visitor: {
      Program(path, state) {
        state.hasDynamicScope = hasDynamicScope(path);
      },
      VariableDeclarator(path, state) {
        if (state.hasDynamicScope === true) return;

        const idPath = path.get("id");
        if (Array.isArray(idPath) || !idPath.isIdentifier()) return;

        const initPath = path.get("init");
        if (Array.isArray(initPath) || initPath.node == null) return;

        if (isExportedDeclaration(path)) return;

        const binding = path.scope.getBinding(idPath.node.name);
        if (!binding || binding.path !== path) return;
        if (binding.constantViolations.length !== 0) return;

        const value = resolveConstant(initPath, new Set());
        if (value === undefined) return;

        const references = binding.referencePaths;
        if (references.length !== 0) {
          if (!isInitializationGuaranteed(path)) return;
          for (const reference of references) {
            if (!canReplaceReference(reference)) return;
            if (!isAfterDeclaration(reference, path)) return;
          }
        }

        for (const reference of references) {
          reference.replaceWith(materialize(value, reference));
        }

        idPath.replaceWith(t.identifier(unusedName(idPath.node.name, path)));
      },
    },
  };
}
