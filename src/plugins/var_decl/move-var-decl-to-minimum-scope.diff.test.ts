import { expectDifferenceBehavior } from "#tests/expectDifferenceBehavior.ts";

import moveVarDeclToMinimumScope from "./move-var-decl-to-minimum-scope";

expectDifferenceBehavior({
  plugin: moveVarDeclToMinimumScope,
  pluginName: "move-var-decl-to-minimum-scope",
  tests: [
    {
      title: "初期化子なし var はループ内でも同じ挙動",
      input: `function f() {\n  var x;\n  for (var i = 0; i < 2; i++) {\n    x = i;\n    console.log(x);\n  }\n}\nf();`,
      inputLog: [[0], [1]],
      output: `function f() {\n  for (var i = 0; i < 2; i++) {\n    var x;\n    x = i;\n    console.log(x);\n  }\n}\nf();`,
      outputLog: [[0], [1]],
    },
    {
      title: "if ブロック内のクロージャから参照",
      input: `function f() {\n  let x = 1;\n  if (true) {\n    return () => x;\n  }\n}\nconsole.log(f()());`,
      inputLog: [[1]],
      output: `function f() {\n  if (true) {\n    let x = 1;\n    return () => x;\n  }\n}\nconsole.log(f()());`,
      outputLog: [[1]],
    },
    {
      title: "複数宣言子を分割しても同じ挙動",
      input: `function f() {\n  let a = 1, b = 2;\n  if (true) {\n    console.log(a);\n  }\n  console.log(b);\n}\nf();`,
      inputLog: [[1], [2]],
      output: `function f() {\n  let b = 2;\n  if (true) {\n    let a = 1;\n    console.log(a);\n  }\n  console.log(b);\n}\nf();`,
      outputLog: [[1], [2]],
    },
  ],
});
