import { type NodePath, type PluginObject, PluginPass } from "@babel/core";
import * as t from "@babel/types";

function isBindingInside(binding: any, container: NodePath): boolean {
  let current: NodePath | null = binding.path;
  while (current) {
    if (current === container) {
      return true;
    }
    current = current.parentPath;
  }
  return false;
}

function isVariableReference(innerPath: any): boolean {
  // isReferencedIdentifier() returns false for assignment targets (`a = b`
  // left `a`), but moving them into the body would still capture the body's
  // binding. Treat every identifier as a variable reference except for
  // positions that are clearly not (property keys, labels, etc.).
  const parent = innerPath.parent;
  if (!parent) {
    return true;
  }
  if (
    (t.isMemberExpression(parent) || t.isOptionalMemberExpression(parent)) &&
    parent.property === innerPath.node &&
    !parent.computed
  ) {
    return false;
  }
  if (
    t.isObjectProperty(parent) &&
    parent.key === innerPath.node &&
    !parent.computed &&
    parent.value !== innerPath.node
  ) {
    return false;
  }
  if (
    (t.isObjectMethod(parent) ||
      t.isClassMethod(parent) ||
      t.isClassPrivateMethod(parent)) &&
    parent.key === innerPath.node &&
    !parent.computed
  ) {
    return false;
  }
  if (t.isPrivateName(parent)) {
    return false;
  }
  if (
    (t.isLabeledStatement(parent) && parent.label === innerPath.node) ||
    ((t.isBreakStatement(parent) || t.isContinueStatement(parent)) &&
      parent.label === innerPath.node)
  ) {
    return false;
  }
  return true;
}

function isCapturedByBody(
  identifierPath: any,
  exprPath: NodePath,
  bodyScope: any,
): boolean {
  if (!isVariableReference(identifierPath)) {
    return false;
  }
  const name = identifierPath.node.name;
  const bodyBinding = bodyScope?.getOwnBinding?.(name);
  if (!bodyBinding) {
    return false;
  }
  // References bound inside the moving expression itself (e.g. arrow
  // function parameters) move together with their binding.
  const refBinding = identifierPath.scope.getBinding(name);
  if (refBinding && isBindingInside(refBinding, exprPath)) {
    return false;
  }
  if (refBinding === bodyBinding) {
    return false;
  }
  return true;
}

function isCaptured(exprPath: NodePath, bodyScope: any): boolean {
  // Note: traverse() does not visit the root itself, so check it separately
  // to handle bare identifiers like `a` in `for (; ; a, i++)`.
  if (exprPath.isIdentifier()) {
    if (isCapturedByBody(exprPath, exprPath, bodyScope)) {
      return true;
    }
  }
  let captured = false;
  exprPath.traverse({
    Identifier(innerPath: any) {
      if (captured) {
        return;
      }
      if (isCapturedByBody(innerPath, exprPath, bodyScope)) {
        captured = true;
        innerPath.stop();
      }
    },
  });
  return captured;
}

function getExprInfo(exprPath: NodePath): {
  reads: Set<string>;
  writes: Set<string>;
  unknown: boolean;
} {
  const reads = new Set<string>();
  const writes = new Set<string>();
  let unknown = false;
  // Note: traverse() does not visit the root itself.
  if (
    exprPath.isCallExpression() ||
    exprPath.isNewExpression() ||
    exprPath.isYieldExpression() ||
    exprPath.isAwaitExpression()
  ) {
    unknown = true;
  }
  if (exprPath.isAssignmentExpression()) {
    const left: any = exprPath.node.left;
    if (
      t.isMemberExpression(left) ||
      t.isOptionalMemberExpression(left) ||
      left.type === "ArrayPattern" ||
      left.type === "ObjectPattern"
    ) {
      unknown = true;
    }
  }
  if (exprPath.isUpdateExpression()) {
    const arg = exprPath.node.argument;
    if (!t.isIdentifier(arg)) {
      unknown = true;
    }
  }
  if (
    exprPath.isUnaryExpression() &&
    exprPath.node.operator === "delete" &&
    t.isMemberExpression(exprPath.node.argument)
  ) {
    unknown = true;
  }
  exprPath.traverse({
    CallExpression() {
      unknown = true;
    },
    NewExpression() {
      unknown = true;
    },
    YieldExpression() {
      unknown = true;
    },
    AwaitExpression() {
      unknown = true;
    },
    AssignmentExpression(assignPath: any) {
      const left = assignPath.node.left;
      if (t.isMemberExpression(left) || t.isOptionalMemberExpression(left)) {
        unknown = true;
      }
    },
    UpdateExpression(updatePath: any) {
      const arg = updatePath.node.argument;
      if (!t.isIdentifier(arg)) {
        unknown = true;
      }
    },
    UnaryExpression(unaryPath: any) {
      if (
        unaryPath.node.operator === "delete" &&
        t.isMemberExpression(unaryPath.node.argument)
      ) {
        unknown = true;
      }
    },
    Identifier(innerPath: any) {
      if (!isVariableReference(innerPath)) {
        return;
      }
      const name = innerPath.node.name;
      const parent = innerPath.parent;
      if (!parent) {
        reads.add(name);
        return;
      }
      if (
        parent.type === "AssignmentExpression" &&
        parent.left === innerPath.node
      ) {
        if (parent.operator === "=") {
          writes.add(name);
        } else {
          reads.add(name);
          writes.add(name);
        }
        return;
      }
      if (
        parent.type === "UpdateExpression" &&
        parent.argument === innerPath.node
      ) {
        reads.add(name);
        writes.add(name);
        return;
      }
      if (
        parent.type === "ArrayPattern" ||
        parent.type === "ObjectPattern" ||
        parent.type === "RestElement"
      ) {
        writes.add(name);
        return;
      }
      reads.add(name);
    },
  });
  return { reads, writes, unknown };
}

function independent(
  a: { reads: Set<string>; writes: Set<string>; unknown: boolean },
  b: { reads: Set<string>; writes: Set<string>; unknown: boolean },
): boolean {
  if (a.unknown || b.unknown) {
    return false;
  }
  for (const w of a.writes) {
    if (b.reads.has(w) || b.writes.has(w)) {
      return false;
    }
  }
  for (const w of b.writes) {
    if (a.reads.has(w)) {
      return false;
    }
  }
  return true;
}

function combineInfos(
  infos: { reads: Set<string>; writes: Set<string>; unknown: boolean }[],
): { reads: Set<string>; writes: Set<string>; unknown: boolean } {
  const reads = new Set<string>();
  const writes = new Set<string>();
  let unknown = false;
  for (const info of infos) {
    for (const r of info.reads) {
      reads.add(r);
    }
    for (const w of info.writes) {
      writes.add(w);
    }
    if (info.unknown) {
      unknown = true;
    }
  }
  return { reads, writes, unknown };
}

function findNearestBreakable(innerPath: any): any {
  let current = innerPath.parentPath;
  while (current) {
    if (current.isLoop && current.isLoop()) {
      return current;
    }
    if (current.isSwitchStatement && current.isSwitchStatement()) {
      return current;
    }
    current = current.parentPath;
  }
  return null;
}

function bodyMayAbrupt(
  bodyPath: NodePath,
  outerFor: NodePath,
  kinds: { breakLike: boolean; continueLike: boolean },
): boolean {
  let found = false;
  bodyPath.traverse({
    Function() {
      // Do not descend into nested functions: return/throw/break there
      // does not affect the outer loop.
      return false;
    },
    BreakStatement(innerPath: any) {
      if (found || !kinds.breakLike) {
        return;
      }
      if (innerPath.node.label) {
        found = true;
        innerPath.stop();
        return;
      }
      const target = findNearestBreakable(innerPath);
      if (!target || target === outerFor) {
        // No breakable or directly targets the outer for: exits the loop,
        // so a suffix after the loop would double-execute.
        // (break inside switch targets the switch, ignored.)
        if (!target || (target.isLoop && target.isLoop())) {
          found = true;
          innerPath.stop();
        }
      }
    },
    ReturnStatement() {
      if (kinds.breakLike) {
        found = true;
      }
    },
    ThrowStatement() {
      if (kinds.breakLike) {
        found = true;
      }
    },
    ContinueStatement(innerPath: any) {
      if (found || !kinds.continueLike) {
        return;
      }
      if (innerPath.node.label) {
        found = true;
        innerPath.stop();
        return;
      }
      const target = findNearestBreakable(innerPath);
      if (target === outerFor) {
        found = true;
        innerPath.stop();
      }
    },
  });
  return found;
}

function canInsertAfter(path: NodePath): boolean {
  const parent = path.parentPath;
  if (!parent) {
    return false;
  }
  if (
    parent.isBlockStatement() ||
    parent.isProgram() ||
    parent.isStaticBlock() ||
    parent.isSwitchCase()
  ) {
    return true;
  }
  return false;
}

export default function (): PluginObject<PluginPass> {
  return {
    visitor: {
      ForStatement(path, state) {
        const { node } = path;

        // Handle condition with sequence expression.
        // Original per iteration: P... -> C -> B.
        // Transformed per iteration: C -> P...(head) -> B, plus one suffix
        // after the loop for the failing test. Requires P vs C independence,
        // P vs remaining independence, no abrupt exit (suffix would double),
        // and a safe parent for insertAfter.
        const testPath = path.get("test");
        if (!Array.isArray(testPath) && testPath.isSequenceExpression()) {
          const bodyPath = path.get("body");
          if (!Array.isArray(bodyPath)) {
            const doTest =
              canInsertAfter(path) &&
              !bodyMayAbrupt(bodyPath, path, {
                breakLike: true,
                continueLike: false,
              });
            if (doTest) {
              const bodyScope = bodyPath.scope;
              const exprPaths = testPath.get("expressions");
              const lastExprPath = exprPaths[exprPaths.length - 1];
              const prefixExprPaths = exprPaths.slice(0, -1);
              const prefixInfos = prefixExprPaths.map((exprPath) =>
                getExprInfo(exprPath),
              );
              const condInfo = getExprInfo(lastExprPath);

              // Single partition pass: capture first, then fixpoint for
              // cond/remaining independence.
              const remaining = new Set<number>();
              for (let i = 0; i < prefixExprPaths.length; i++) {
                if (isCaptured(prefixExprPaths[i], bodyScope)) {
                  remaining.add(i);
                }
              }
              for (let i = 0; i < prefixExprPaths.length; i++) {
                if (
                  !remaining.has(i) &&
                  !independent(prefixInfos[i], condInfo)
                ) {
                  remaining.add(i);
                }
              }
              let changed = true;
              while (changed) {
                changed = false;
                const remainingInfos: {
                  reads: Set<string>;
                  writes: Set<string>;
                  unknown: boolean;
                }[] = [];
                for (const i of remaining) {
                  remainingInfos.push(prefixInfos[i]);
                }
                if (remainingInfos.length === 0) {
                  break;
                }
                const combined = combineInfos(remainingInfos);
                for (let i = 0; i < prefixExprPaths.length; i++) {
                  if (
                    !remaining.has(i) &&
                    !independent(prefixInfos[i], combined)
                  ) {
                    remaining.add(i);
                    changed = true;
                  }
                }
              }

              const extractablePaths: NodePath[] = [];
              const remainingPaths: NodePath[] = [];
              for (let i = 0; i < prefixExprPaths.length; i++) {
                if (remaining.has(i)) {
                  remainingPaths.push(prefixExprPaths[i]);
                } else {
                  extractablePaths.push(prefixExprPaths[i]);
                }
              }

              if (extractablePaths.length > 0) {
                const lastNode = lastExprPath.node;
                if (!t.isExpression(lastNode)) {
                  return;
                }
                const lastExpr = lastNode;
                const extractableExprs: t.Expression[] = [];
                const remainingExprs: t.Expression[] = [];
                for (const exprPath of extractablePaths) {
                  if (t.isExpression(exprPath.node)) {
                    extractableExprs.push(exprPath.node);
                  } else {
                    return;
                  }
                }
                for (const exprPath of remainingPaths) {
                  if (t.isExpression(exprPath.node)) {
                    remainingExprs.push(exprPath.node);
                  } else {
                    return;
                  }
                }
                // Keep expressions that cannot be moved in the condition.
                node.test =
                  remainingExprs.length > 0
                    ? t.sequenceExpression([...remainingExprs, lastExpr])
                    : lastExpr;

                // Add movable expressions to the beginning of the body
                const prefixStmts = extractableExprs.map((expr) =>
                  t.expressionStatement(expr),
                );

                if (t.isBlockStatement(node.body)) {
                  node.body.body.unshift(...prefixStmts);
                } else {
                  const bodyStmt = node.body;
                  if (t.isStatement(bodyStmt)) {
                    node.body = t.blockStatement([...prefixStmts, bodyStmt]);
                  }
                }

                // Add the same expressions after the loop
                const suffixStmts = extractableExprs.map((expr) =>
                  t.expressionStatement(t.cloneNode(expr)),
                );
                path.insertAfter(suffixStmts);
                path.scope.crawl();
              }
            }
          }
        }

        // Handle update with sequence expression.
        // Original per iteration: B -> P... -> last.
        // Transformed: B -> P...(end) -> remaining... -> last.
        // Full moves preserve order; partial moves need P vs remaining
        // independence. A `continue` in B would skip the trailing P while
        // the original update still runs it, so skip on unnested continue.
        const updatePath = path.get("update");
        if (!Array.isArray(updatePath) && updatePath.isSequenceExpression()) {
          const bodyPath = path.get("body");
          if (!Array.isArray(bodyPath)) {
            const doUpdate = !bodyMayAbrupt(bodyPath, path, {
              breakLike: false,
              continueLike: true,
            });
            if (doUpdate) {
              const bodyScope = bodyPath.scope;
              const exprPaths = updatePath.get("expressions");
              const lastExprPath = exprPaths[exprPaths.length - 1];
              const prefixExprPaths = exprPaths.slice(0, -1);
              const prefixInfos = prefixExprPaths.map((exprPath) =>
                getExprInfo(exprPath),
              );

              const remaining = new Set<number>();
              for (let i = 0; i < prefixExprPaths.length; i++) {
                if (isCaptured(prefixExprPaths[i], bodyScope)) {
                  remaining.add(i);
                }
              }
              let changed = true;
              while (changed) {
                changed = false;
                const remainingInfos: {
                  reads: Set<string>;
                  writes: Set<string>;
                  unknown: boolean;
                }[] = [];
                for (const i of remaining) {
                  remainingInfos.push(prefixInfos[i]);
                }
                if (remainingInfos.length === 0) {
                  break;
                }
                const combined = combineInfos(remainingInfos);
                for (let i = 0; i < prefixExprPaths.length; i++) {
                  if (
                    !remaining.has(i) &&
                    !independent(prefixInfos[i], combined)
                  ) {
                    remaining.add(i);
                    changed = true;
                  }
                }
              }

              const extractablePaths: NodePath[] = [];
              const remainingPaths: NodePath[] = [];
              for (let i = 0; i < prefixExprPaths.length; i++) {
                if (remaining.has(i)) {
                  remainingPaths.push(prefixExprPaths[i]);
                } else {
                  extractablePaths.push(prefixExprPaths[i]);
                }
              }

              if (extractablePaths.length > 0) {
                const lastNode = lastExprPath.node;
                if (!t.isExpression(lastNode)) {
                  return;
                }
                const lastExpr = lastNode;
                const extractableExprs: t.Expression[] = [];
                const remainingExprs: t.Expression[] = [];
                for (const exprPath of extractablePaths) {
                  if (t.isExpression(exprPath.node)) {
                    extractableExprs.push(exprPath.node);
                  } else {
                    return;
                  }
                }
                for (const exprPath of remainingPaths) {
                  if (t.isExpression(exprPath.node)) {
                    remainingExprs.push(exprPath.node);
                  } else {
                    return;
                  }
                }
                // Keep expressions that cannot be moved in the update clause.
                node.update =
                  remainingExprs.length > 0
                    ? t.sequenceExpression([...remainingExprs, lastExpr])
                    : lastExpr;

                // Add movable expressions to the end of the body
                const suffixStmts = extractableExprs.map((expr) =>
                  t.expressionStatement(expr),
                );

                if (t.isBlockStatement(node.body)) {
                  node.body.body.push(...suffixStmts);
                } else {
                  const bodyStmt = node.body;
                  if (t.isStatement(bodyStmt)) {
                    node.body = t.blockStatement([bodyStmt, ...suffixStmts]);
                  }
                }
                path.scope.crawl();
              }
            }
          }
        }
      },
    },
  };
}
