/*
getDependencies

```js
const a = 1;
const b = 2
console.log(a+b) // [console,a,b] as a path
```

```js
for(const a of b){
  console.log(a.foo) // [console,a] as a path
}
```
*/
import { traverse } from "@babel/core";
import * as t from "@babel/types";
import { describe, expect, it } from "vite-plus/test";
import { getDependencies } from "./getDependencies";

const getDependenciesAtPath = (
  ast: t.File,
  node: t.CallExpression,
): string[] => {
  let result: string[] | undefined;

  traverse(ast, {
    CallExpression(path) {
      if (path.node !== node) return;
      result = getDependencies(path).map((dependency) => {
        if (!t.isIdentifier(dependency.node)) {
          throw new Error("getDependencies returned a non-identifier");
        }
        return dependency.node.name;
      });
      path.stop();
    },
  });

  if (!result) throw new Error("could not find the call expression path");
  return result;
};

const consoleLog = (argument: t.Expression): t.CallExpression =>
  t.callExpression(
    t.memberExpression(t.identifier("console"), t.identifier("log")),
    [argument],
  );

describe("getDependencies", () => {
  it("returns the referenced identifiers in an expression", () => {
    const call = consoleLog(
      t.binaryExpression("+", t.identifier("a"), t.identifier("b")),
    );
    const ast = t.file(
      t.program([
        t.variableDeclaration("const", [
          t.variableDeclarator(t.identifier("a"), t.numericLiteral(1)),
        ]),
        t.variableDeclaration("const", [
          t.variableDeclarator(t.identifier("b"), t.numericLiteral(2)),
        ]),
        t.expressionStatement(call),
      ]),
    );

    expect(getDependenciesAtPath(ast, call)).toEqual(["console", "a", "b"]);
  });

  it("does not include a member expression's property identifier", () => {
    const call = consoleLog(
      t.memberExpression(t.identifier("a"), t.identifier("foo")),
    );
    const ast = t.file(
      t.program([
        t.forOfStatement(
          t.variableDeclaration("const", [
            t.variableDeclarator(t.identifier("a")),
          ]),
          t.identifier("b"),
          t.blockStatement([t.expressionStatement(call)]),
        ),
      ]),
    );

    expect(getDependenciesAtPath(ast, call)).toEqual(["console", "a"]);
  });
});