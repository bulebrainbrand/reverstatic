import { parseSync, traverse } from "@babel/core";
import type { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { describe, expect, it } from "vite-plus/test";
import {
  affectsTarget,
  collectWrittenRootNames,
  isSafeToHoistIntoBody,
  partitionPrefix,
} from "./canHoistSeqPrefix";

const parse = (code: string): t.File => {
  const result = parseSync(code, {
    ast: true,
    code: false,
    configFile: false,
  });
  if (!result || typeof result === "string") {
    throw new Error("failed to parse");
  }
  return result;
};

const findDoWhile = (ast: t.File): NodePath => {
  let found: NodePath | undefined;
  traverse(ast, {
    DoWhileStatement(path) {
      if (found === undefined) {
        found = path;
        path.stop();
      }
    },
  });
  if (found === undefined) throw new Error("DoWhileStatement not found");
  return found;
};

const findFor = (ast: t.File): NodePath => {
  let found: NodePath | undefined;
  traverse(ast, {
    ForStatement(path) {
      if (found === undefined) {
        found = path;
        path.stop();
      }
    },
  });
  if (found === undefined) throw new Error("ForStatement not found");
  return found;
};

const singlePath = (holder: any, key: string): any => {
  const target: any = holder.get(key);
  if (Array.isArray(target)) throw new Error(`unexpected array: ${key}`);
  return target;
};

const sequenceExpressions = (holder: any, key: string): any => {
  const target: any = singlePath(holder, key);
  if (!t.isSequenceExpression(target.node)) {
    throw new Error(`not a sequence expression: ${key}`);
  }
  const expressionsKey: string = "expressions";
  const expressionPaths: any = target.get(expressionsKey);
  if (!Array.isArray(expressionPaths)) throw new Error("unexpected");
  return expressionPaths;
};

/** `do { body } while((PRE, LAST))` の PRE / body パスを取り出す。 */
const doWhileParts = (
  code: string,
): { prefix: NodePath; body: NodePath } => {
  const stmt = findDoWhile(parse(code));
  const exprs = sequenceExpressions(stmt, "test");
  const prefix = exprs[0];
  if (!prefix) throw new Error("empty sequence");
  return { prefix, body: singlePath(stmt, "body") };
};

const forTestParts = (
  code: string,
): { exprs: NodePath[]; body: NodePath } => {
  const stmt = findFor(parse(code));
  return { exprs: sequenceExpressions(stmt, "test"), body: singlePath(stmt, "body") };
};

describe("isSafeToHoistIntoBody", () => {
  it("無関係な代入は移動可", () => {
    const { prefix, body } = doWhileParts(
      `do { const a = 1; console.log(a); } while((x = y, cond));`,
    );
    expect(isSafeToHoistIntoBody(prefix, body)).toBe(true);
  });

  it("body変数への代入は移動不可 (getDependenciesでは拾えない左辺)", () => {
    const { prefix, body } = doWhileParts(
      `do { const a = 1; console.log(a); } while((a = b, cond));`,
    );
    expect(isSafeToHoistIntoBody(prefix, body)).toBe(false);
  });

  it("body変数の読み取りは移動不可", () => {
    const { prefix, body } = doWhileParts(
      `do { const a = 1; console.log(a); } while((foo(a), cond));`,
    );
    expect(isSafeToHoistIntoBody(prefix, body)).toBe(false);
  });

  it("候補内側のアロー引数は局所束縛なので移動可", () => {
    const { prefix, body } = doWhileParts(
      `do { const a = 1; console.log(a); } while(((a) => a, cond));`,
    );
    expect(isSafeToHoistIntoBody(prefix, body)).toBe(true);
  });

  it("bodyのネストしたブロック内側のletは挿入点から見えないので移動可", () => {
    const { prefix, body } = doWhileParts(
      `do { { let b = 1; console.log(b); } } while((b = 2, cond));`,
    );
    expect(isSafeToHoistIntoBody(prefix, body)).toBe(true);
  });

  it("分割代入の束縛も検出して移動不可", () => {
    const { prefix, body } = doWhileParts(
      `do { const { a } = x; console.log(a); } while((a = 1, cond));`,
    );
    expect(isSafeToHoistIntoBody(prefix, body)).toBe(false);
  });

  it("body内の関数宣言も検出して移動不可", () => {
    const { prefix, body } = doWhileParts(
      `do { function a() {} a(); } while((a(), cond));`,
    );
    expect(isSafeToHoistIntoBody(prefix, body)).toBe(false);
  });

  it("varは同一束縛なので移動可", () => {
    const stmt = findDoWhile(
      parse(
        `function f() { var a; do { var a = 1; } while((a = 2, cond)); }`,
      ),
    );
    const exprs = sequenceExpressions(stmt, "test");
    const prefix = exprs[0];
    if (!prefix) throw new Error("empty sequence");
    expect(isSafeToHoistIntoBody(prefix, singlePath(stmt, "body"))).toBe(
      true,
    );
  });
});

describe("affectsTarget", () => {
  it("lastを読む書き込みは影響あり", () => {
    const { exprs } = forTestParts(`for (let i = 0; (i = 10, i < 10); i++) {}`);
    const pre = exprs[0];
    const last = exprs[1];
    if (!pre || !last) throw new Error("empty sequence");
    expect(affectsTarget(pre, last)).toBe(true);
  });

  it("無関係な代入は影響なし", () => {
    const { exprs } = forTestParts(`for (let i = 0; (a = b, i < 10); i++) {}`);
    const pre = exprs[0];
    const last = exprs[1];
    if (!pre || !last) throw new Error("empty sequence");
    expect(affectsTarget(pre, last)).toBe(false);
  });

  it("UpdateExpressionも検出する", () => {
    const unrelated = forTestParts(`for (let i = 0; (x++, i < 10); i++) {}`);
    const preX = unrelated.exprs[0];
    const lastX = unrelated.exprs[1];
    if (!preX || !lastX) throw new Error("empty sequence");
    expect(affectsTarget(preX, lastX)).toBe(false);
    const related = forTestParts(`for (let i = 0; (i++, i < 10); i++) {}`);
    const preI = related.exprs[0];
    const lastI = related.exprs[1];
    if (!preI || !lastI) throw new Error("empty sequence");
    expect(affectsTarget(preI, lastI)).toBe(true);
  });

  it("ネストした関数内側の書き込みは即時実行されないので影響なし", () => {
    const { exprs } = forTestParts(
      `for (let i = 0; (function () { i = 1; }, i < 10); i++) {}`,
    );
    const pre = exprs[0];
    const last = exprs[1];
    if (!pre || !last) throw new Error("empty sequence");
    expect(affectsTarget(pre, last)).toBe(false);
    expect(collectWrittenRootNames(pre).size).toBe(0);
  });
});

describe("partitionPrefix", () => {
  it("captureとlast影響の両方で振り分ける", () => {
    const { exprs, body } = forTestParts(
      `for (let i = 0; (a = b, i = 10, i < 10); i++) { let a = 1; }`,
    );
    const last = exprs[exprs.length - 1];
    if (!last) throw new Error("empty sequence");
    const { hoistable, remaining } = partitionPrefix(
      exprs.slice(0, -1),
      body,
      last,
    );
    // a = b はbodyのlet aに捕獲されるので残留、
    // i = 10 はlastのiに影響するので残留
    expect(hoistable.length).toBe(0);
    expect(remaining.length).toBe(2);
  });
});
