import type { NodePath } from "@babel/core";
import * as t from "@babel/types";

const addLValNames = (node: t.Node, out: Set<string>): void => {
  if (t.isIdentifier(node)) {
    out.add(node.name);
    return;
  }
  if (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) {
    addLValNames(node.object, out);
    return;
  }
  if (t.isRestElement(node)) {
    addLValNames(node.argument, out);
    return;
  }
  if (t.isAssignmentPattern(node)) {
    addLValNames(node.left, out);
    return;
  }
  if (
    t.isTSAsExpression(node) ||
    t.isTSSatisfiesExpression(node) ||
    t.isTSNonNullExpression(node) ||
    t.isTSTypeAssertion(node)
  ) {
    addLValNames(node.expression, out);
    return;
  }
  // ObjectPattern / ArrayPattern などは束縛名を一括収集する。
  // MemberExpression (`a.b = c`) は上でobject側へ再帰済みのため、
  // ここに来るのはパターン系のみを想定する。
  try {
    const ids = t.getBindingIdentifiers(node);
    for (const key of Object.keys(ids)) {
      out.add(key);
    }
  } catch {
    // 未知のノード形状は無視する (conservativeではないが、
    // capture側のisSafeToHoistIntoBodyが別途拾う)。
  }
};

/**
 * `path.traverse()`は起点ノード自身を訪問しないため、
 * 起点を含めてIdentifierを列挙するヘルパー。
 */
const eachIdentifier = (
  root: NodePath,
  cb: (inner: NodePath) => void,
): void => {
  if (root.isIdentifier()) {
    cb(root);
  }
  root.traverse({
    Identifier(inner) {
      cb(inner);
    },
  });
};

const isRelevantIdentifier = (inner: NodePath): boolean => {
  // BabelのisReferencedIdentifierは代入左辺 (`a = b` の `a`) を
  // 参照とみなさないため、isBindingIdentifierも含める。
  // 非参照のプロパティ名 (`a.b` の `b`) はどちらもfalseなので除外される。
  return inner.isReferencedIdentifier() || inner.isBindingIdentifier();
};

/**
 * 候補式をbody内に移動しても束縛先が変わらないかを判定する。
 *
 * - `bodyScope.getOwnBinding`でbody直下の宣言だけを見る。
 *   ネストしたブロック/関数の内側は挿入点から見えないので無視する。
 *   `var`はblockのownにならないため内外同一束縛は素通りする。
 * - 候補式内部で閉じる参照 (アロー引数など) は
 *   `exprPath.isAncestor(resolved.path)`で除外する。
 */
export const isSafeToHoistIntoBody = (
  exprPath: NodePath,
  bodyPath: NodePath,
): boolean => {
  const bodyScope = bodyPath.scope;
  let unsafe = false;

  const check = (inner: NodePath): void => {
    if (unsafe) return;
    if (!isRelevantIdentifier(inner)) {
      return;
    }
    const node = inner.node;
    if (!t.isIdentifier(node)) return;
    const name = node.name;
    const resolved = inner.scope.getBinding(name);
    if (resolved && exprPath.isAncestor(resolved.path)) return;
    const bodyOwn = bodyScope.getOwnBinding(name);
    if (bodyOwn && bodyOwn !== resolved) {
      unsafe = true;
    }
  };

  eachIdentifier(exprPath, check);

  return !unsafe;
};

/**
 * 式中の直接の書き込み (代入・更新) のルート名を集める。
 * ネストした関数内側の書き込みは評価時には実行されないため除外する。
 */
export const collectWrittenRootNames = (
  exprPath: NodePath,
): Set<string> => {
  if (exprPath.isFunction()) return new Set<string>();
  const out = new Set<string>();
  const collect = (node: t.Node | null): void => {
    if (t.isAssignmentExpression(node)) {
      addLValNames(node.left, out);
    } else if (t.isUpdateExpression(node)) {
      addLValNames(node.argument, out);
    }
  };
  // traverseは起点自身を訪問しないため、起点を明示的に処理する。
  collect(exprPath.node);
  exprPath.traverse({
    Function(path) {
      path.skip();
    },
    AssignmentExpression(path) {
      addLValNames(path.node.left, out);
    },
    UpdateExpression(path) {
      addLValNames(path.node.argument, out);
    },
  });
  return out;
};

/** 式中で使われる名前 (読み・書き両方。プロパティ名など非参照は除く)。 */
export const collectUsedNames = (targetPath: NodePath): Set<string> => {
  const out = new Set<string>();
  eachIdentifier(targetPath, (inner) => {
    if (!isRelevantIdentifier(inner)) {
      return;
    }
    const node = inner.node;
    if (t.isIdentifier(node)) {
      out.add(node.name);
    }
  });
  return out;
};

/**
 * test側prefix用ガード: `pre`の書き込みが`last`の読み書きに影響するか。
 * `for (init; (pre, last); update)` をbody先頭+suffixに移す変換は
 * 初回判定の順序が変わるため、`pre`が`last`に影響する場合は除外する。
 */
export const affectsTarget = (
  exprPath: NodePath,
  targetPath: NodePath,
): boolean => {
  const written = collectWrittenRootNames(exprPath);
  if (written.size === 0) return false;
  const used = collectUsedNames(targetPath);
  for (const name of written) {
    if (used.has(name)) return true;
  }
  return false;
};

export const partitionPrefix = (
  prefixPaths: NodePath[],
  bodyPath: NodePath,
  lastPath?: NodePath,
): { hoistable: NodePath[]; remaining: NodePath[] } => {
  const hoistable: NodePath[] = [];
  const remaining: NodePath[] = [];
  for (const prefix of prefixPaths) {
    if (!isSafeToHoistIntoBody(prefix, bodyPath)) {
      remaining.push(prefix);
      continue;
    }
    if (lastPath && affectsTarget(prefix, lastPath)) {
      remaining.push(prefix);
      continue;
    }
    hoistable.push(prefix);
  }
  return { hoistable, remaining };
};
