import { type NodePath, type PluginObject, type PluginPass } from "@babel/core";
import * as t from "@babel/types";
import {
  type Effects,
  emptyEffects,
  getEffects,
  interferes,
} from "../../utils/getEffects";
import { hasDynamicScope } from "../../utils/hasDynamicScope";
import { isWithin } from "../../utils/isWithin";

// 宣言と代入を結合する。
//   let a;
//   a = 1;
//   -> let a = 1;
//
// 宣言直後の連続した代入だけでなく、副作用を追える文(undefined; や
// 無関係な単純代入)を挟んだ代入も、評価順が変わらない範囲で結合する。
// let は TDZ が観測されないよう、自身以降の未初期化宣言子への参照と
// 直接 eval を RHS に含む場合は結合しない。

// プロパティ参照も、評価順を入れ替えると何が起きるか追えない式として扱う。
// 隣接する代入の結合では RHS を解析しないので、ここでの制限は文をまたぐ場合だけ。
const MEMBER_OPAQUE = new Set(["MemberExpression", "OptionalMemberExpression"]);

/** root 以下で読む変数・書く変数と、追えない副作用の有無を集める。 */
const analyze = (root: NodePath): Effects => getEffects(root, MEMBER_OPAQUE);

/** 文をまたいでよいか。未知の副作用がある文は横断しない。 */
const crossableEffects = (
  path: NodePath<t.Node | null>,
): Effects | undefined => {
  if (path.node === null) {
    return undefined;
  }
  if (path.isEmptyStatement()) {
    return emptyEffects();
  }
  if (!path.isExpressionStatement()) {
    return undefined;
  }
  const expression = path.get("expression");
  if (Array.isArray(expression)) {
    return undefined;
  }
  const effects = analyze(expression);
  return effects.unknown ? undefined : effects;
};

/**
 * 横断する文と RHS を入れ替えてもよいか。
 * 式文の結果は捨てられるので、書込みのない文は読取を無視できる。
 * 書込みのある文は RHS と互いに読み書きが交差しないことを要求する。
 */
const canCross = (crossed: Effects, rhs: Effects): boolean => {
  if (crossed.writes.size === 0) {
    return true;
  }
  if (rhs.unknown) {
    return false;
  }
  return !interferes(crossed, rhs);
};

const canCrossAll = (crossed: Effects[], assignmentPath: NodePath): boolean => {
  if (crossed.every((effects) => effects.writes.size === 0)) {
    return true;
  }
  // 結合では代入先への書込みも宣言位置へ移るので、RHS だけでなく
  // 代入式全体の効果を比較する。
  const assignment = analyze(assignmentPath);
  return crossed.every((effects) => canCross(effects, assignment));
};

/** RHS が指定した名前のバインディングを参照・代入しているか。 */
const referencesBindingsIn = (
  declarationPath: NodePath<t.VariableDeclaration>,
  names: Set<string>,
  node: t.Node,
): boolean => {
  const scope = declarationPath.scope;
  for (const name of names) {
    const binding = scope.getBinding(name);
    if (!binding) {
      continue;
    }
    if (binding.referencePaths.some((reference) => isWithin(reference, node))) {
      return true;
    }
    if (
      binding.constantViolations.some((violation) => isWithin(violation, node))
    ) {
      return true;
    }
  }
  return false;
};

/**
 * let の宣言子 index を初期化子へ移してよいか。
 * 自身以降の宣言子は、移した時点ではまだ初期化されていないため TDZ になる。
 */
const canMergeLet = (
  declarationPath: NodePath<t.VariableDeclaration>,
  declarators: NodePath<t.VariableDeclarator>[],
  index: number,
  rhsPath: NodePath,
): boolean => {
  const names = new Set<string>();
  for (let current = index; current < declarators.length; current++) {
    const id = declarators[current].node.id;
    if (!t.isIdentifier(id)) {
      return false;
    }
    names.add(id.name);
  }
  if (referencesBindingsIn(declarationPath, names, rhsPath.node)) {
    return false;
  }
  if (hasDynamicScope(rhsPath)) {
    return false;
  }
  return true;
};

const isStatementList = (path: NodePath): boolean => {
  const parent = path.parentPath;
  return (
    parent?.isProgram() === true ||
    parent?.isBlockStatement() === true ||
    parent?.isStaticBlock() === true ||
    parent?.isSwitchCase() === true
  );
};

const findDeclaratorIndex = (
  declarators: NodePath<t.VariableDeclarator>[],
  start: number,
  name: string,
): number => {
  for (let index = start; index < declarators.length; index++) {
    const id = declarators[index].node.id;
    if (t.isIdentifier(id, { name })) {
      return index;
    }
  }
  return -1;
};

type Merge = {
  declarator: NodePath<t.VariableDeclarator>;
  assignment: NodePath<t.ExpressionStatement>;
  rhs: t.Expression;
};

export default function (): PluginObject<PluginPass> {
  return {
    visitor: {
      VariableDeclaration(path) {
        if (path.node.kind === "const") {
          return;
        }
        if (!isStatementList(path)) {
          return;
        }

        const declarators = path.get("declarations");
        if (!Array.isArray(declarators)) {
          return;
        }

        // 初期化子を持つ宣言子より前へ移すと、初期化子同士の評価順が変わる。
        let lastInitIndex = -1;
        for (let index = 0; index < declarators.length; index++) {
          if (declarators[index].node.init != null) {
            lastInitIndex = index;
          }
        }
        let pointer = lastInitIndex + 1;

        const merges: Merge[] = [];
        const crossed: Effects[] = [];
        let sibling = path.getNextSibling();
        while (sibling != null) {
          let merged = false;

          if (sibling.isExpressionStatement()) {
            const expression = sibling.get("expression");
            if (
              !Array.isArray(expression) &&
              expression.isAssignmentExpression({ operator: "=" }) &&
              t.isIdentifier(expression.node.left)
            ) {
              const name = expression.node.left.name;
              const found = findDeclaratorIndex(declarators, pointer, name);
              if (found !== -1) {
                const rhsPath = expression.get("right");
                if (Array.isArray(rhsPath)) {
                  return;
                }
                const canMerge =
                  path.node.kind !== "let" ||
                  canMergeLet(path, declarators, found, rhsPath);
                if (canMerge && canCrossAll(crossed, expression)) {
                  merges.push({
                    declarator: declarators[found],
                    assignment: sibling,
                    rhs: rhsPath.node,
                  });
                  pointer = found + 1;
                  merged = true;
                }
              }
            }
          }

          if (merged) {
            sibling = sibling.getNextSibling();
            continue;
          }

          const effects = crossableEffects(sibling);
          if (effects === undefined) {
            break;
          }
          crossed.push(effects);
          sibling = sibling.getNextSibling();
        }

        if (merges.length === 0) {
          return;
        }

        for (const merge of merges) {
          merge.declarator.node.init = merge.rhs;
        }
        for (let index = merges.length - 1; index >= 0; index--) {
          merges[index].assignment.remove();
        }
        path.scope.crawl();
      },
    },
  };
}
