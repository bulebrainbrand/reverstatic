import type { NodePath } from "@babel/core";

export const isExportedUse = (path: NodePath): boolean =>
  path.findParent(
    (parent) =>
      parent.isExportSpecifier() ||
      parent.isExportNamedDeclaration() ||
      parent.isExportDefaultDeclaration(),
  ) !== null;
