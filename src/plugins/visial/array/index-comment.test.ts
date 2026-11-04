import { pluginTester } from "babel-plugin-tester";
import indexComment from "./index-comment";

pluginTester({
  plugin: indexComment,
  pluginName: "index-comment",
  tests: [
    { code: `console.log("foo");`, output: `console.log("foo");` },
    {
      code: `const a = [1, 2, 3];`,
      output: `const a = [/* a[0] */ 1, /* a[1] */ 2, /* a[2] */ 3];`,
    },
    { code: `let a = [1];`, output: `let a = [/* a[0] */ 1];` },
    { code: `var a = [1];`, output: `var a = [/* a[0] */ 1];` },
    {
      code: `const a = [1], b = [2];`,
      output: `const a = [/* a[0] */ 1],\n  b = [/* b[0] */ 2];`,
    },
    {
      code: `const a = [[1, 2], [3]];`,
      output: `const a = [
  /* a[0] */ [/* a[0][0] */ 1, /* a[0][1] */ 2],
  /* a[1] */ [/* a[1][0] */ 3],
];`,
    },
    {
      code: `const o = { a: [1, 2] };`,
      output: `const o = {
  a: [/* o.a[0] */ 1, /* o.a[1] */ 2],
};`,
    },
    {
      code: `const o = { a: { b: [1] } };`,
      output: `const o = {
  a: {
    b: [/* o.a.b[0] */ 1],
  },
};`,
    },
    {
      code: `const a = [{ b: [1] }];`,
      output: `const a = [
  /* a[0] */
  {
    b: [/* a[0].b[0] */ 1],
  },
];`,
    },
    {
      code: `const o = { "a-b": [1], 2: [3] };`,
      output: `const o = {
  "a-b": [/* o["a-b"][0] */ 1],
  2: [/* o[2][0] */ 3],
};`,
    },
    {
      code: `const a = [1, , 3];`,
      output: `const a = [/* a[0] */ 1, , /* a[2] */ 3];`,
    },
    { code: `const a = [1, ...b];`, output: `const a = [/* a[0] */ 1, ...b];` },
    {
      code: `const a = [/* a[0] */ 1, /* a[1] */ 2];`,
      output: `const a = [/* a[0] */ 1, /* a[1] */ 2];`,
    },
    { code: `const [a] = [[1]];`, output: `const [a] = [[1]];` },
    {
      code: `const k = "a";\nconst o = { [k]: [1] };`,
      output: `const k = "a";\nconst o = {\n  [k]: [1],\n};`,
    },
    {
      code: `const o = { f() { return [1]; } };`,
      output: `const o = {\n  f() {\n    return [1];\n  },\n};`,
    },
    { code: `const a = foo;`, output: `const a = foo;` },
  ],
});
