import { type NodePath, type PluginObject, PluginPass } from "@babel/core";
import * as t from "@babel/types";
import { partitionPrefix } from "../../utils/canHoistSeqPrefix";

const expressionOf = (path: NodePath): t.Expression | undefined => {
  const node = path.node;
  if (t.isExpression(node)) return node;
  return undefined;
};

const toPrefixStatements = (
  paths: NodePath[],
): t.ExpressionStatement[] | undefined => {
  const statements: t.ExpressionStatement[] = [];
  for (const path of paths) {
    const expression = expressionOf(path);
    if (!expression) return undefined;
    statements.push(t.expressionStatement(expression));
  }
  return statements;
};

const toClonedSuffixStatements = (
  paths: NodePath[],
): t.ExpressionStatement[] | undefined => {
  const statements: t.ExpressionStatement[] = [];
  for (const path of paths) {
    const expression = expressionOf(path);
    if (!expression) return undefined;
    statements.push(t.expressionStatement(t.cloneNode(expression)));
  }
  return statements;
};

const sequenceParts = (
  // Babelの.get()オーバーロードはgenerics付きパスと相性が悪いため、
  // 動的キーでの取り出し境界はanyにする (既存コードと同様の作法)。
  holder: any,
  key: string,
):
  | { prefixPaths: NodePath[]; lastPath: NodePath; lastNode: t.Expression }
  | undefined => {
  const target: any = holder.get(key);
  if (Array.isArray(target)) return undefined;
  if (!t.isSequenceExpression(target.node)) return undefined;
  if (target.node.expressions.length < 2) return undefined;
  const expressionsKey: string = "expressions";
  const expressionPaths: any = target.get(expressionsKey);
  if (!Array.isArray(expressionPaths)) return undefined;
  const lastPath = expressionPaths[expressionPaths.length - 1];
  const lastNode = expressionOf(lastPath);
  if (!lastNode) return undefined;
  return {
    prefixPaths: expressionPaths.slice(0, -1),
    lastPath,
    lastNode,
  };
};

const remainingExpression = (
  remaining: NodePath[],
  lastNode: t.Expression,
): t.Expression | undefined => {
  const remainingNodes: t.Expression[] = [];
  for (const path of remaining) {
    const expression = expressionOf(path);
    if (!expression) return undefined;
    remainingNodes.push(expression);
  }
  if (remainingNodes.length === 0) return lastNode;
  return t.sequenceExpression([...remainingNodes, lastNode]);
};

const prependToBody = (
  node: t.ForStatement,
  statements: t.ExpressionStatement[],
): void => {
  if (t.isBlockStatement(node.body)) {
    node.body.body.unshift(...statements);
  } else {
    node.body = t.blockStatement([...statements, node.body]);
  }
};

const appendToBody = (
  node: t.ForStatement,
  statements: t.ExpressionStatement[],
): void => {
  if (t.isBlockStatement(node.body)) {
    node.body.body.push(...statements);
  } else {
    node.body = t.blockStatement([node.body, ...statements]);
  }
};

export default function (): PluginObject<PluginPass> {
  return {
    visitor: {
      ForStatement(path) {
        const { node } = path;

        // Handle condition with sequence expression.
        // body先頭+suffixへの移動は初回判定の順序が変わるため、
        // lastに影響する更新はpartition側で残留させる。
        const testParts = sequenceParts(path, "test");
        if (testParts) {
          const bodyPath = path.get("body");
          if (!Array.isArray(bodyPath)) {
            const { hoistable, remaining } = partitionPrefix(
              testParts.prefixPaths,
              bodyPath,
              testParts.lastPath,
            );

            if (hoistable.length > 0) {
              // Keep expressions that cannot be moved in the condition.
              const nextTest = remainingExpression(
                remaining,
                testParts.lastNode,
              );
              const prefixStmts = toPrefixStatements(hoistable);
              const suffixStmts = toClonedSuffixStatements(hoistable);
              if (nextTest && prefixStmts && suffixStmts) {
                node.test = nextTest;
                prependToBody(node, prefixStmts);
                path.insertAfter(suffixStmts);
              }
            }
          }
        }

        // Handle update with sequence expression.
        // body末尾への移動は順序保存のためcapture判定のみでよい。
        const updateParts = sequenceParts(path, "update");
        if (updateParts) {
          const bodyPath = path.get("body");
          if (!Array.isArray(bodyPath)) {
            const { hoistable, remaining } = partitionPrefix(
              updateParts.prefixPaths,
              bodyPath,
            );

            if (hoistable.length > 0) {
              // Keep expressions that cannot be moved in the update clause.
              const nextUpdate = remainingExpression(
                remaining,
                updateParts.lastNode,
              );
              const suffixStmts = toPrefixStatements(hoistable);
              if (nextUpdate && suffixStmts) {
                node.update = nextUpdate;
                appendToBody(node, suffixStmts);
              }
            }
          }
        }
      },
    },
  };
}
