import type { NodePath } from "@babel/core";
import type { Identifier } from "@babel/types";

export const getDependencies = (path: NodePath): NodePath[] => {
  const result: NodePath<Identifier>[] = [];
  path.traverse({
    Identifier(path) {
      if (path.isReferencedIdentifier()) {
        result.push(path);
      }
    },
  });
  return result;
};
