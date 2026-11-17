import type { NodePath } from "@babel/core";

// path が代入・更新・delete・分割代入・for-in/of の書き込み先かどうか。
// MemberExpression だけでなく、LVal になり得る path に使える。
export const isWriteTarget = (path: NodePath): boolean => {
  const parentPath = path.parentPath;
  if (!parentPath) return false;
  if (parentPath.isUpdateExpression()) return true;
  if (parentPath.isUnaryExpression({ operator: "delete" })) return true;

  let current = path;
  while (true) {
    const parent = current.parentPath;
    if (!parent) return false;

    if (parent.isAssignmentExpression()) {
      return parent.node.left === current.node;
    }
    if (parent.isForXStatement()) {
      return parent.node.left === current.node;
    }
    if (parent.isArrayPattern() || parent.isObjectPattern()) {
      current = parent;
      continue;
    }
    if (parent.isRestElement()) {
      if (parent.node.argument !== current.node) return false;
      current = parent;
      continue;
    }
    if (parent.isObjectProperty()) {
      // computed key は読み取り、value だけが書き込み先になり得る。
      if (parent.node.value !== current.node) return false;
      current = parent;
      continue;
    }
    if (parent.isAssignmentPattern()) {
      // デフォルト値 (右辺) は読み取り、左辺だけが書き込み先になり得る。
      if (parent.node.left !== current.node) return false;
      current = parent;
      continue;
    }
    return false;
  }
};
