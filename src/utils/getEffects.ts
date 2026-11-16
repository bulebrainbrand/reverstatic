import type { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { isVariableReference } from "./isVariableReference";

/** 式が読む変数名・書く変数名と、副作用を追えない(= 順序を変えられない)かどうか */
export interface Effects {
  reads: Set<string>;
  writes: Set<string>;
  unknown: boolean;
}

export const emptyEffects = (): Effects => ({
  reads: new Set(),
  writes: new Set(),
  unknown: false,
});

/** 評価すると何が起きるか追えない式。含んでいたら順序を変えない */
const OPAQUE_NODE_TYPES = new Set([
  "CallExpression",
  "OptionalCallExpression",
  "NewExpression",
  "TaggedTemplateExpression",
  "ImportExpression",
  "YieldExpression",
  "AwaitExpression",
  "ClassExpression",
]);

/**
 * root 以下で読む変数・書く変数と、追えない副作用の有無を集める。
 * extraOpaqueTypes は呼び出し側が追加で順序を変えたくないノード型。
 */
export const getEffects = (
  root: NodePath,
  extraOpaqueTypes?: ReadonlySet<string>,
): Effects => {
  const effects = emptyEffects();

  const visit = (path: NodePath): void => {
    if (
      OPAQUE_NODE_TYPES.has(path.node.type) ||
      extraOpaqueTypes?.has(path.node.type) === true
    ) {
      effects.unknown = true;
    } else if (path.isAssignmentExpression()) {
      // 識別子以外(メンバー・分割代入)への代入は影響範囲が読めない
      if (!t.isIdentifier(path.node.left)) {
        effects.unknown = true;
      }
    } else if (path.isUpdateExpression()) {
      if (!t.isIdentifier(path.node.argument)) {
        effects.unknown = true;
      }
    } else if (path.isUnaryExpression() && path.node.operator === "delete") {
      effects.unknown = true;
    } else if (path.isIdentifier() && isVariableReference(path)) {
      const { node, parent } = path;
      if (t.isAssignmentExpression(parent) && parent.left === node) {
        effects.writes.add(node.name);
        if (parent.operator !== "=") {
          effects.reads.add(node.name); // 複合代入は読んでから書く
        }
      } else if (t.isUpdateExpression(parent)) {
        effects.reads.add(node.name);
        effects.writes.add(node.name);
      } else {
        effects.reads.add(node.name);
      }
    }
  };

  visit(root); // traverse は root 自身を訪れないので別に呼ぶ
  root.traverse({ enter: visit });
  return effects;
};

/** a と b の間で読み書きが衝突するか */
export const interferes = (a: Effects, b: Effects): boolean =>
  // a.write かつ b.read がなく、a.read かつ b.write がなく、a.write かつ b.write もないなら衝突しない。逆に、どれか一つでもあれば衝突する
  !(
    a.writes.intersection(b.reads).size === 0 &&
    a.reads.intersection(b.writes).size === 0 &&
    a.writes.intersection(b.writes).size === 0
  );

/** a と b を入れ替えても結果が変わらないか */
export const areIndependent = (a: Effects, b: Effects): boolean =>
  !a.unknown && !b.unknown && !interferes(a, b);
