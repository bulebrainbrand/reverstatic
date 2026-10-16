import type { NodePath, PluginObject } from "@babel/core";
import * as t from "@babel/types";

function mentionsAny(node: t.Node, names: Set<string>): boolean {
  if (names.size === 0) return false;
  let found = false;
  t.traverseFast(node, (n) => {
    if (t.isIdentifier(n) && names.has(n.name)) found = true;
  });
  return found;
}

/** このdo-whileを対象とする continue が本体にあるか */
function hasOwnContinue(loop: NodePath<t.DoWhileStatement>): boolean {
  let found = false;
  loop.get("body").traverse({
    Function: (p) => p.skip(),
    ContinueStatement(p) {
      const { label } = p.node;
      const target = label
        ? p
            .findParent(
              (a) => a.isLabeledStatement() && a.node.label.name === label.name,
            )
            ?.get("body")
        : p.findParent((a) => a.isLoop());
      // @ts-expect-error
      if (target?.node === loop.node) {
        found = true;
        p.stop();
      }
    },
  });
  return found;
}

export default function (): PluginObject {
  return {
    visitor: {
      DoWhileStatement(path) {
        const { test } = path.node;
        if (!t.isSequenceExpression(test)) return;

        const body = path.get("body");
        // 本体ブロック自身のスコープで宣言された名前(移動先でシャドーされうるもの)
        const shadowed = new Set(
          body.isBlockStatement() ? Object.keys(body.scope.bindings) : [],
        );

        const head = test.expressions.slice(0, -1);
        const last = test.expressions.at(-1)!;

        // 先頭から連続して移動可能な式だけを抽出(評価順を保つ)
        const idx = head.findIndex((e) => mentionsAny(e, shadowed));
        const count = idx === -1 ? head.length : idx;
        if (count === 0 || hasOwnContinue(path)) return;

        const moved = head.slice(0, count).map((e) => t.expressionStatement(e));
        const rest = [...head.slice(count), last];

        path
          .get("test")
          .replaceWith(
            rest.length === 1 ? rest[0] : t.sequenceExpression(rest),
          );

        if (body.isBlockStatement()) {
          body.pushContainer("body", moved);
        } else {
          body.replaceWith(t.blockStatement([body.node, ...moved]));
        }
      },
    },
  };
}
