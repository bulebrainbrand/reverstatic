import { parseSync, traverse } from "@babel/core";
import type { NodePath } from "@babel/core";
import { describe, expect, it } from "vite-plus/test";
import {
  areIndependent,
  emptyEffects,
  getEffects,
  interferes,
} from "./getEffects";

const expressionPathOf = (code: string): NodePath => {
  const ast = parseSync(code, {
    ast: true,
    code: false,
    configFile: false,
    sourceType: "module",
  });
  if (!ast || typeof ast === "string") {
    throw new Error("failed to parse");
  }

  let result: NodePath | undefined;
  traverse(ast, {
    ExpressionStatement(path) {
      const expression = path.get("expression");
      if (!Array.isArray(expression)) {
        result = expression;
      }
      path.stop();
    },
  });
  if (result === undefined) throw new Error("could not find expression");
  return result;
};

const effectsOf = (code: string, extraOpaqueTypes?: ReadonlySet<string>) =>
  getEffects(expressionPathOf(code), extraOpaqueTypes);

const effects = (
  reads: string[],
  writes: string[],
  unknown = false,
): ReturnType<typeof emptyEffects> => ({
  reads: new Set(reads),
  writes: new Set(writes),
  unknown,
});

describe("getEffects", () => {
  it("collects reads", () => {
    expect(effectsOf(`a;`)).toEqual(effects(["a"], []));
  });

  it("collects writes", () => {
    expect(effectsOf(`a = b;`)).toEqual(effects(["b"], ["a"]));
  });

  it("collects both sides of compound assignment", () => {
    expect(effectsOf(`a += b;`)).toEqual(effects(["a", "b"], ["a"]));
  });

  it("collects both sides of update expression", () => {
    expect(effectsOf(`a++;`)).toEqual(effects(["a"], ["a"]));
  });

  it("marks calls as unknown", () => {
    expect(effectsOf(`f();`)).toEqual(effects(["f"], [], true));
  });

  it("marks assignments to members as unknown", () => {
    expect(effectsOf(`a.b = c;`)).toEqual(effects(["a", "c"], [], true));
  });

  it("marks delete as unknown", () => {
    expect(effectsOf(`delete a.b;`)).toEqual(effects(["a"], [], true));
  });

  it("reads the object of a member expression by default", () => {
    expect(effectsOf(`a.b;`)).toEqual(effects(["a"], []));
  });

  it("treats extra opaque types as unknown", () => {
    expect(
      effectsOf(
        `a.b;`,
        new Set(["MemberExpression", "OptionalMemberExpression"]),
      ),
    ).toEqual(effects(["a"], [], true));
  });
});

describe("interferes", () => {
  it("detects a write followed by a read", () => {
    expect(interferes(effects([], ["a"]), effects(["a"], []))).toBe(true);
  });

  it("detects a read followed by a write", () => {
    expect(interferes(effects(["a"], []), effects([], ["a"]))).toBe(true);
  });

  it("detects writes to the same variable", () => {
    expect(interferes(effects([], ["a"]), effects([], ["a"]))).toBe(true);
  });

  it("allows unrelated variables", () => {
    expect(interferes(effects(["a"], ["b"]), effects(["c"], ["d"]))).toBe(
      false,
    );
  });
});

describe("areIndependent", () => {
  it("returns true for unaffected effects", () => {
    expect(areIndependent(effects([], ["a"]), effects(["b"], []))).toBe(true);
  });

  it("returns false when either side is unknown", () => {
    expect(areIndependent(effects([], [], true), effects([], []))).toBe(false);
    expect(areIndependent(effects([], []), effects([], [], true))).toBe(false);
  });

  it("returns false for interfering effects", () => {
    expect(areIndependent(effects([], ["a"]), effects(["a"], []))).toBe(false);
  });
});
