import type { NodePath } from "@babel/traverse";

export const isAfter = (first: NodePath, second: NodePath) => {
  const start = second.node.start;
  const end = first.node.end;
  if (typeof start !== "number" || typeof end !== "number") return false;
  return start >= end;
};
