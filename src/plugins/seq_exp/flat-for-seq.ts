import type { NodePath, PluginObject, PluginPass } from "@babel/core";
import * as t from "@babel/types";
import {
  areIndependent,
  type Effects,
  getEffects,
} from "../../utils/getEffects";
import { isVariableReference } from "../../utils/isVariableReference";
import { isWithInPath } from "../../utils/isWithin";

/**
 * for 文の test / update に詰め込まれたカンマ式を、可能なものだけ body 側へ移す。
 *
 *   for (; P, C; U) B   →   for (; C; U) { P; B }  P;     (test:  P は条件 C の後ろへ)
 *   for (; C; P, U) B   →   for (; C; U) { B; P }          (update: P は body の末尾へ)
 *
 * 式の順序を入れ替える場合は「互いに読み書きしない」ことを確認し、
 * 確認できない式は元のカンマ式に残す。
 *
 * 前提: プロパティ読み出し・演算子が起こす副作用(getter / valueOf / Proxy など)は無視する。
 */

type Scope = NodePath["scope"];
type ForPath = NodePath<t.ForStatement>;

// ---------------------------------------------------------------------------
// 識別子の判定
// ---------------------------------------------------------------------------

/** root 以下に、pred を満たす「変数を指す識別子」があるか(root 自身も調べる) */
function someReference(
  root: NodePath,
  pred: (id: NodePath<t.Identifier>) => boolean,
): boolean {
  let hit = false;
  const check = (id: NodePath<t.Identifier>) => {
    if (!hit && isVariableReference(id) && pred(id)) {
      hit = true;
    }
  };
  // NodePath#traverse は root 自身を訪れない
  if (root.isIdentifier()) {
    check(root);
  }
  root.traverse({
    Identifier(id) {
      check(id);
      if (hit) {
        id.stop();
      }
    },
  });
  return hit;
}

// ---------------------------------------------------------------------------
// 移動先で意味が変わらないか
// ---------------------------------------------------------------------------

/** body がブロックならそのスコープ。単文 body は宣言を持てないので undefined */
function bodyBlockScope(body: NodePath): Scope | undefined {
  return body.isBlockStatement() ? body.scope : undefined;
}

/** body へ移すと、body 直下の let/const/function 宣言に参照を奪われるか */
function capturedByBody(expr: NodePath, bodyScope: Scope | undefined): boolean {
  if (!bodyScope) {
    return false;
  }
  return someReference(expr, (id) => {
    const name = id.node.name;
    const own = bodyScope.getOwnBinding(name);
    if (!own) {
      return false;
    }
    const ref = id.scope.getBinding(name);
    if (ref === own) {
      return false;
    }
    // 式の内側で宣言された変数(アロー関数の引数など)は式と一緒に動く
    return !(ref && isWithInPath(ref.path, expr));
  });
}

/** ループの後ろへ複製すると、for の init で宣言した let/const がスコープ外になるか */
function usesLoopScopedBinding(expr: NodePath, loopScope: Scope): boolean {
  return someReference(expr, (id) => {
    const ref = id.scope.getBinding(id.node.name);
    return !!ref && ref.scope === loopScope && !isWithInPath(ref.path, expr);
  });
}

/**
 * init が let/const で、ループ内に関数やクラスがあるか。
 * 反復ごとの環境コピーがクロージャから観測できるので、
 * update の式を body 末尾へ移すと、クロージャが見る値が変わりうる。
 */
function hasObservablePerIterationBindings(loop: ForPath): boolean {
  if (Object.keys(loop.scope.bindings).length === 0) {
    return false;
  }
  let found = false;
  const mark = (p: NodePath) => {
    found = true;
    p.stop();
  };
  loop.traverse({ Function: mark, Class: mark });
  return found;
}

// ---------------------------------------------------------------------------
// break / continue の行き先
// ---------------------------------------------------------------------------

function labelsOf(loop: ForPath): Set<string> {
  const labels = new Set<string>();
  for (let p = loop.parentPath; p?.isLabeledStatement(); p = p.parentPath) {
    labels.add(p.node.label.name);
  }
  return labels;
}

/** body の中に、loop 自身を行き先とする break(または continue)があるか */
function jumpsToLoop(
  body: NodePath,
  loop: ForPath,
  kind: "break" | "continue",
): boolean {
  const labels = labelsOf(loop);
  type Jump = NodePath<t.BreakStatement> | NodePath<t.ContinueStatement>;

  const targetsLoop = (jump: Jump): boolean => {
    const { label } = jump.node;
    if (label) {
      return labels.has(label.name);
    }
    // 無印 break は最寄りのループか switch、無印 continue は最寄りのループが行き先
    const target = jump.findParent(
      (p) => p.isLoop() || (kind === "break" && p.isSwitchStatement()),
    );
    return target?.node === loop.node;
  };

  // NodePath#traverse は root 自身を訪れないので、body が単体の break/continue のときだけ別扱い
  if (kind === "break" && body.isBreakStatement()) {
    return targetsLoop(body);
  }
  if (kind === "continue" && body.isContinueStatement()) {
    return targetsLoop(body);
  }

  let found = false;
  const onJump = (jump: Jump) => {
    if (targetsLoop(jump)) {
      found = true;
      jump.stop();
    }
  };
  body.traverse({
    // ネストした関数内の break/continue は外側のループに影響しない
    Function(fn) {
      fn.skip();
    },
    ...(kind === "break"
      ? { BreakStatement: onJump }
      : { ContinueStatement: onJump }),
  });
  return found;
}

// ---------------------------------------------------------------------------
// 移す式 / 残す式の振り分け
// ---------------------------------------------------------------------------

/**
 * 先頭側の式(prefix)のうち、元のカンマ式に「残す」ものを決める。
 *
 * 移す式は、残す式と相対位置が入れ替わる側でのみ順序が変わる。
 * そこで、入れ替わる側から順に調べ、
 *   - 移動できないと分かっている式(pinned)
 *   - すでに「残す」と決めた式と独立でない式
 * を残すことにする(1 パスで確定する)。
 *
 * "backward": test 用。移す式は条件の後ろへ行くので、自分より後ろに残る式と入れ替わる
 * "forward" : update 用。移す式は末尾へ行くので、自分より前に残る式と入れ替わる
 */
function chooseKept(
  effects: Effects[],
  pinned: boolean[],
  direction: "forward" | "backward",
): boolean[] {
  const order = effects.map((_, i) => i);
  if (direction === "backward") {
    order.reverse();
  }
  const kept = effects.map(() => false);
  const keptSoFar: number[] = [];
  for (const i of order) {
    kept[i] =
      pinned[i] ||
      keptSoFar.some((j) => !areIndependent(effects[i], effects[j]));
    if (kept[i]) {
      keptSoFar.push(i);
    }
  }
  return kept;
}

function splitSequence(seq: NodePath<t.SequenceExpression>) {
  const exprs = seq.get("expressions");
  return { prefix: exprs.slice(0, -1), last: exprs[exprs.length - 1] };
}

/** 振り分け結果から「移す式」と「元の位置に残る式(最後の式を含む)」を作る */
function rebuild(
  prefix: NodePath<t.Expression>[],
  kept: boolean[],
  last: NodePath<t.Expression>,
) {
  const moved = prefix.filter((_, i) => !kept[i]).map((p) => p.node);
  const stay = prefix.filter((_, i) => kept[i]).map((p) => p.node);
  const remaining =
    stay.length > 0 ? t.sequenceExpression([...stay, last.node]) : last.node;
  return { moved, remaining };
}

const toStatements = (exprs: t.Expression[]) =>
  exprs.map((e) => t.expressionStatement(e));

function ensureBlockBody(node: t.ForStatement): t.BlockStatement {
  if (!t.isBlockStatement(node.body)) {
    node.body = t.blockStatement([node.body]);
  }
  return node.body;
}

function canInsertAfter(path: NodePath): boolean {
  const parent = path.parentPath;
  return (
    !!parent &&
    (parent.isBlockStatement() ||
      parent.isProgram() ||
      parent.isStaticBlock() ||
      parent.isSwitchCase())
  );
}

// ---------------------------------------------------------------------------
// 変換本体
// ---------------------------------------------------------------------------

/**
 * init のカンマ式。
 * init はループ前に一度だけ評価されるので、順序を保ったまま文として前に出せる。
 *
 *   for (P1, P2; C; U) B   →   P1; P2; for (; C; U) B
 */
function hoistFromInit(loop: ForPath): void {
  const init = loop.get("init");
  if (!init.isSequenceExpression()) {
    return;
  }

  const exprs = init.get("expressions").map((expr) => expr.node);
  loop.node.init = null;
  loop.insertBefore(toStatements(exprs));
  loop.scope.crawl();
}

/**
 * test のカンマ式。
 * 元: 各反復で P → C → B、最後に P → C(false)。
 * 後: C → P → B(P は body 先頭)、最後に C(false) → P(ループ直後に複製)。
 */
function hoistFromTest(loop: ForPath): void {
  const test = loop.get("test");
  if (!test.isSequenceExpression()) {
    return;
  }
  // ループ直後に複製を置ける位置であること
  if (!canInsertAfter(loop)) {
    return;
  }
  // body 内の break でループを抜けると、P が複製分と合わせて二重に実行される
  // (continue / return / throw は問題ない)
  if (jumpsToLoop(loop.get("body"), loop, "break")) {
    return;
  }

  const { prefix, last } = splitSequence(test);
  const bodyScope = bodyBlockScope(loop.get("body"));
  const lastEffects = getEffects(last);
  const effects = prefix.map((expr) => getEffects(expr));
  const pinned = prefix.map(
    (expr, i) =>
      capturedByBody(expr, bodyScope) ||
      usesLoopScopedBinding(expr, loop.scope) ||
      !areIndependent(effects[i], lastEffects), // C と順序が入れ替わる
  );
  const { moved, remaining } = rebuild(
    prefix,
    chooseKept(effects, pinned, "backward"),
    last,
  );
  if (moved.length === 0) {
    return;
  }

  loop.node.test = remaining;
  ensureBlockBody(loop.node).body.unshift(...toStatements(moved));
  loop.insertAfter(toStatements(moved.map((e) => t.cloneNode(e))));
  loop.scope.crawl();
}

/**
 * update のカンマ式。
 * 元: 各反復で B → P → U → C。
 * 後: B → P(body 末尾) → U → C。
 */
function hoistFromUpdate(loop: ForPath): void {
  const update = loop.get("update");
  if (!update.isSequenceExpression()) {
    return;
  }
  // body 内の continue は、末尾へ移した P を飛ばしてしまう
  // (break は元の update も走らないので問題ない)
  if (jumpsToLoop(loop.get("body"), loop, "continue")) {
    return;
  }
  if (hasObservablePerIterationBindings(loop)) {
    return;
  }

  const { prefix, last } = splitSequence(update);
  const bodyScope = bodyBlockScope(loop.get("body"));
  const effects = prefix.map((expr) => getEffects(expr));
  const pinned = prefix.map((expr) => capturedByBody(expr, bodyScope));
  const { moved, remaining } = rebuild(
    prefix,
    chooseKept(effects, pinned, "forward"),
    last,
  );
  if (moved.length === 0) {
    return;
  }

  loop.node.update = remaining;
  ensureBlockBody(loop.node).body.push(...toStatements(moved));
  loop.scope.crawl();
}

export default function forSequenceHoist(): PluginObject<PluginPass> {
  return {
    visitor: {
      ForStatement(path) {
        hoistFromInit(path);
        hoistFromTest(path);
        hoistFromUpdate(path);
      },
    },
  };
}
