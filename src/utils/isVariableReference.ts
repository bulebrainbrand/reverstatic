import type { NodePath } from "@babel/core";
import * as t from "@babel/types";
export const isVariableReference = (path: NodePath<t.Identifier>): boolean => {
  const { node, parent } = path;

  if (t.isMemberExpression(parent) || t.isOptionalMemberExpression(parent)) {
    return !(parent.property === node && !parent.computed);
  }
  if (t.isObjectProperty(parent)) {
    return !(parent.key === node && !parent.computed && parent.value !== node);
  }
  if (
    t.isObjectMethod(parent) ||
    t.isClassMethod(parent) ||
    t.isClassProperty(parent)
  ) {
    return !(parent.key === node && !parent.computed);
  }
  if (t.isLabeledStatement(parent)) {
    return parent.label !== node;
  }
  if (t.isBreakStatement(parent) || t.isContinueStatement(parent)) {
    return parent.label !== node;
  }
  if (t.isPrivateName(parent) || t.isMetaProperty(parent)) {
    return false;
  }
  return true;
};
