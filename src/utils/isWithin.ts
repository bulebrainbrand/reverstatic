import type { NodePath } from "@babel/core";
import * as t from "@babel/types";

export const isWithin = (path: NodePath, node: t.Node): boolean => {
  for (
    let current: NodePath | null = path;
    current;
    current = current.parentPath
  ) {
    if (current.node === node) {
      return true;
    }
  }
  return false;
};

export const isWithInPath = (path: NodePath, nodePath: NodePath) =>
  isWithin(path, nodePath.node);
