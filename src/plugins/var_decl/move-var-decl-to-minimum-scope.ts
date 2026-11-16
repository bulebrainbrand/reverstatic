import { type NodePath, type PluginObject, type PluginPass } from "@babel/core";
import type { Binding } from "@babel/traverse";
import * as t from "@babel/types";
import { Result } from "@praha/byethrow";
import { getConstantExpression } from "../../utils/getConstantExpression";
import { getEffects } from "../../utils/getEffects";
import { hasDynamicScope } from "../../utils/hasDynamicScope";
import { isWithin } from "../../utils/isWithin";

// 変数宣言を、その変数の全使用箇所を含む最小のブロックへ移す。
//   function f() {
//     let x = 1;
//     if (c) { use(x); }
//   }
//   ->
//   function f() {
//     if (c) { let x = 1; use(x); }
//   }
//
// 複数の宣言子は個別に判定し、移動先ごとに宣言を分割する。
// let / const はバインディングのスコープも狭くなる。var は function scope の
// ままなので、ここでは宣言文の位置だけを動かす。
//
// 初期化子は、移動しても評価結果が変わらないものだけを対象にする。
// 具体的には、初期化子がないか、副作用・外部変数の読み取りがない式に限る。
// ループ内への移動では、イテレーションごとの再初期化や束縛の作り直しが
// 観測されない場合だけ許可する。移動先直下の無条件な単純代入が最初にあり、
// 移動先にクロージャを含まない書き込みのある変数に限り、初期化子がなし、
// またはプリミティブ定数のときに許可する。読み取り専用の変数は、束縛が
// 作り直されることを避けるためループ内へは移さない。
// eval / with がある関数では名前解決が動的なので触らない。

type DeclarationKind = "var" | "let" | "const";

// プロパティ読み取りは getter を呼びうるので、初期化子の移動では副作用として扱う。
const MEMBER_OPAQUE = new Set(["MemberExpression", "OptionalMemberExpression"]);

type TargetGroup = {
  target: NodePath<t.BlockStatement>;
  declarators: NodePath<t.VariableDeclarator>[];
};

type Plan = {
  declaration: NodePath<t.VariableDeclaration>;
  kept: NodePath<t.VariableDeclarator>[];
};

type Insertion = {
  target: NodePath<t.BlockStatement>;
  declarations: t.VariableDeclaration[];
};

type PluginState = PluginPass & {
  dynamicScopeCache?: WeakMap<t.Node, boolean>;
  plans?: Plan[];
  insertions?: Map<t.BlockStatement, Insertion>;
};

const isExportedUse = (path: NodePath): boolean =>
  path.findParent(
    (parent) =>
      parent.isExportSpecifier() ||
      parent.isExportNamedDeclaration() ||
      parent.isExportDefaultDeclaration(),
  ) !== null;

/** すべての path を内側に含む最も深い path。 */
const commonAncestor = (paths: NodePath[]): NodePath | undefined => {
  const first = paths[0];
  if (first === undefined) {
    return undefined;
  }
  for (
    let current: NodePath | null = first;
    current !== null;
    current = current.parentPath
  ) {
    if (paths.every((path) => isWithin(path, current.node))) {
      return current;
    }
  }
  return undefined;
};

const nearestBlock = (
  path: NodePath,
): NodePath<t.BlockStatement> | undefined => {
  for (
    let current: NodePath | null = path;
    current !== null;
    current = current.parentPath
  ) {
    if (current.isBlockStatement()) {
      return current;
    }
  }
  return undefined;
};

/** path が ancestor 自身ではなく、その子孫か。 */
const isStrictDescendant = (path: NodePath, ancestor: NodePath): boolean =>
  path.node !== ancestor.node && isWithin(path, ancestor.node);

/** 宣言より後にあるか。制御構造の内側へ降りるだけなので、位置の比較で足りる。 */
const isAfterDeclaration = (
  declaration: NodePath,
  target: NodePath,
): boolean => {
  const end = declaration.node.end;
  const start = target.node.start;
  if (typeof end !== "number" || typeof start !== "number") {
    return false;
  }
  return start >= end;
};

/** 移動先までに関数・クラス・静的ブロックの境界を越えるか。 */
const crossesScopeBoundary = (
  target: NodePath,
  sourceList: NodePath,
): boolean => {
  for (
    let current = target.parentPath;
    current !== null && current.node !== sourceList.node;
    current = current.parentPath
  ) {
    if (current.isFunction() || current.isClass() || current.isStaticBlock()) {
      return true;
    }
  }
  return false;
};

/** 宣言より後ろに新しいループが挟まるか。 */
const isInsideNewLoop = (target: NodePath, sourceList: NodePath): boolean => {
  for (
    let current: NodePath | null = target;
    current !== null && current.node !== sourceList.node;
    current = current.parentPath
  ) {
    if (current.isLoop()) {
      return true;
    }
  }
  return false;
};

/** use が target より内側の関数・クラス・静的ブロックに属するか。 */
const isNestedClosureUse = (
  use: NodePath,
  target: NodePath<t.BlockStatement>,
): boolean => {
  for (
    let current = use.parentPath;
    current !== null && current.node !== target.node;
    current = current.parentPath
  ) {
    if (current.isFunction() || current.isClass() || current.isStaticBlock()) {
      return true;
    }
  }
  return false;
};

const hasNestedClosureUse = (
  uses: NodePath[],
  target: NodePath<t.BlockStatement>,
): boolean => uses.some((use) => isNestedClosureUse(use, target));

/**
 * target 内の最初の使用箇所が、必ず実行される単純代入 x = ... か。
 * if の中など、実行されない可能性がある書き込みは許可しない。
 */
const isFirstUseGuaranteedWrite = (
  name: string,
  uses: NodePath[],
  target: NodePath<t.BlockStatement>,
): boolean => {
  let first: NodePath | undefined;
  let firstStart = Number.POSITIVE_INFINITY;

  for (const use of uses) {
    const start = use.node.start;
    if (typeof start !== "number") {
      return false;
    }
    if (start < firstStart) {
      first = use;
      firstStart = start;
    }
  }
  if (first === undefined) {
    return false;
  }
  if (!first.isAssignmentExpression({ operator: "=" })) {
    return false;
  }

  const left = first.get("left");
  if (Array.isArray(left) || !left.isIdentifier({ name })) {
    return false;
  }

  const statement = first.parentPath;
  if (!statement?.isExpressionStatement()) {
    return false;
  }
  if (statement.node.expression !== first.node) {
    return false;
  }
  if (statement.parentPath?.node !== target.node) {
    return false;
  }

  // 代入の左辺以外に、同じ代入の中で x を参照していないこと。
  return !uses.some(
    (use) =>
      use.node !== first.node &&
      use.node !== left.node &&
      isWithin(use, first.node),
  );
};

/** ループ内で再評価しても、値と例外タイミングが変わらない初期化子か。 */
const isLoopSafeInit = (init: t.Expression | null | undefined): boolean =>
  init == null || Result.isSuccess(getConstantExpression(init));

/** 新しいループ内へ宣言を移してよいか。 */
const canMoveIntoNewLoop = (
  kind: DeclarationKind,
  declarator: NodePath<t.VariableDeclarator>,
  binding: Binding,
  uses: NodePath[],
  target: NodePath<t.BlockStatement>,
): boolean => {
  const init = declarator.node.init;

  if (!isLoopSafeInit(init)) {
    return false;
  }

  // 読み取り専用の変数は、束縛が作り直されることを避けるため移さない。
  if (binding.constantViolations.length === 0) {
    return false;
  }

  // 書き込みのある const は通常あり得ないコードなので触らない。
  if (kind === "const") {
    return false;
  }

  const name = declarator.node.id;
  if (!t.isIdentifier(name)) {
    return false;
  }

  // 前回の値が読まれないことを保証する。
  if (!isFirstUseGuaranteedWrite(name.name, uses, target)) {
    return false;
  }

  // let はイテレーションごとに束縛が変わる。var も関数宣言の hoisting で
  // テキスト順と実行順がずれるため、移動先内のクロージャは避ける。
  return !hasNestedClosureUse(uses, target);
};

/** 初期化子を移動先まで遅らせても評価結果が変わらないか。 */
const canRelocateInit = (
  declarator: NodePath<t.VariableDeclarator>,
): boolean => {
  const init = declarator.get("init");
  if (Array.isArray(init)) {
    return false;
  }
  if (init.node === null) {
    return true;
  }
  const effects = getEffects(init, MEMBER_OPAQUE);
  return (
    !effects.unknown && effects.reads.size === 0 && effects.writes.size === 0
  );
};

const isDynamicScope = (path: NodePath, state: PluginState): boolean => {
  const boundary =
    path.getFunctionParent() ?? path.scope.getProgramParent().path;
  const cache = (state.dynamicScopeCache ??= new WeakMap());
  const cached = cache.get(boundary.node);
  if (cached !== undefined) {
    return cached;
  }
  const result = hasDynamicScope(boundary);
  cache.set(boundary.node, result);
  return result;
};

const findTarget = (
  declaration: NodePath<t.VariableDeclaration>,
  declarator: NodePath<t.VariableDeclarator>,
  sourceList: NodePath<t.BlockStatement>,
  kind: DeclarationKind,
  binding: Binding,
  state: PluginState,
): NodePath<t.BlockStatement> | undefined => {
  if (binding.path !== declarator) {
    return undefined;
  }

  const uses = [...binding.referencePaths, ...binding.constantViolations];
  if (uses.length === 0 || uses.some(isExportedUse)) {
    return undefined;
  }

  const common = commonAncestor(uses);
  if (common === undefined) {
    return undefined;
  }
  const target = nearestBlock(common);
  if (target === undefined) {
    return undefined;
  }
  if (!isStrictDescendant(target, sourceList)) {
    return undefined;
  }
  if (!isAfterDeclaration(declaration, target)) {
    return undefined;
  }
  if (crossesScopeBoundary(target, sourceList)) {
    return undefined;
  }
  if (isDynamicScope(declaration, state)) {
    return undefined;
  }
  if (!canRelocateInit(declarator)) {
    return undefined;
  }

  if (
    isInsideNewLoop(target, sourceList) &&
    !canMoveIntoNewLoop(kind, declarator, binding, uses, target)
  ) {
    return undefined;
  }

  // トップレベルの var はグローバルオブジェクトから観測されうる。
  // 初期化なしなら実行時の変化はないので許可する。
  if (
    kind === "var" &&
    declarator.node.init !== null &&
    binding.scope.path.isProgram()
  ) {
    return undefined;
  }

  const name = declarator.node.id;
  if (!t.isIdentifier(name)) {
    return undefined;
  }
  const existing = target.scope.getOwnBinding(name.name);
  if (existing !== undefined && existing !== binding) {
    return undefined;
  }

  return target;
};

export default function (): PluginObject<PluginState> {
  return {
    visitor: {
      VariableDeclaration(path, state) {
        const sourceList = path.parentPath;
        if (!sourceList?.isBlockStatement()) {
          return;
        }

        const kind = path.node.kind;
        if (kind !== "var" && kind !== "let" && kind !== "const") {
          return;
        }

        const declarators = path.get("declarations");
        if (!Array.isArray(declarators)) {
          return;
        }

        const groups = new Map<t.BlockStatement, TargetGroup>();
        const moved = new Set<t.VariableDeclarator>();

        for (const declarator of declarators) {
          const id = declarator.node.id;
          if (!t.isIdentifier(id)) {
            continue;
          }
          const binding = path.scope.getBinding(id.name);
          if (binding === undefined) {
            continue;
          }
          const target = findTarget(
            path,
            declarator,
            sourceList,
            kind,
            binding,
            state,
          );
          if (target === undefined) {
            continue;
          }

          moved.add(declarator.node);
          let group = groups.get(target.node);
          if (group === undefined) {
            group = { target, declarators: [] };
            groups.set(target.node, group);
          }
          group.declarators.push(declarator);
        }

        if (groups.size === 0) {
          return;
        }

        const kept = declarators.filter(
          (declarator) => !moved.has(declarator.node),
        );
        const insertions = (state.insertions ??= new Map());
        let firstNewDeclaration: t.VariableDeclaration | undefined;

        for (const group of groups.values()) {
          const newDeclaration = t.variableDeclaration(
            kind,
            group.declarators.map((declarator) =>
              t.cloneNode(declarator.node, true),
            ),
          );
          firstNewDeclaration ??= newDeclaration;

          let insertion = insertions.get(group.target.node);
          if (insertion === undefined) {
            insertion = { target: group.target, declarations: [] };
            insertions.set(group.target.node, insertion);
          }
          insertion.declarations.push(newDeclaration);
        }

        // 宣言が丸ごと移動する場合、宣言に付いていたコメントを先頭の移動先へ移す。
        if (kept.length === 0 && firstNewDeclaration !== undefined) {
          t.inheritsComments(firstNewDeclaration, path.node);
        }

        (state.plans ??= []).push({ declaration: path, kept });
      },

      Program: {
        exit(path, state) {
          const insertions = state.insertions;
          const plans = state.plans;
          if (insertions === undefined || plans === undefined) {
            return;
          }

          for (const { target, declarations } of insertions.values()) {
            target.unshiftContainer("body", declarations);
          }

          for (const { declaration, kept } of plans) {
            if (kept.length === 0) {
              declaration.remove();
              continue;
            }
            declaration.node.declarations = kept.map(
              (declarator) => declarator.node,
            );
          }

          path.scope.crawl();
        },
      },
    },
  };
}
