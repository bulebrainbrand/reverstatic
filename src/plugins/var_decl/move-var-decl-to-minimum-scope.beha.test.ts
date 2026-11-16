import { expectSameBehavior } from "#tests/expectBehavior.ts";

import moveVarDeclToMinimumScope from "./move-var-decl-to-minimum-scope";

expectSameBehavior({
  plugin: moveVarDeclToMinimumScope,
  pluginName: "move-var-decl-to-minimum-scope",
  tests: [
    {
      title: "初期化子なし var はループ内でも同じ挙動",
      input: `function f() {\n  var x;\n  for (var i = 0; i < 2; i++) {\n    x = i;\n    console.log(x);\n  }\n}\nf();`,
      log: [[0], [1]],
      output: `function f() {\n  for (var i = 0; i < 2; i++) {\n    var x;\n    x = i;\n    console.log(x);\n  }\n}\nf();`,
    },
    {
      title: "if ブロック内のクロージャから参照",
      input: `function f() {\n  let x = 1;\n  if (true) {\n    return () => x;\n  }\n}\nconsole.log(f()());`,
      log: [[1]],
      output: `function f() {\n  if (true) {\n    let x = 1;\n    return () => x;\n  }\n}\nconsole.log(f()());`,
    },
    {
      title: "複数宣言子を分割しても同じ挙動",
      input: `function f() {\n  let a = 1, b = 2;\n  if (true) {\n    console.log(a);\n  }\n  console.log(b);\n}\nf();`,
      log: [[1], [2]],
      output: `function f() {\n  let b = 2;\n  if (true) {\n    let a = 1;\n    console.log(a);\n  }\n  console.log(b);\n}\nf();`,
    },
    {
      title: "ループ内で最初に書き込む let は同じ挙動",
      input: `function f() {\n  let x = 0;\n  for (let i = 0; i < 3; i++) {\n    x = i * 2;\n    console.log(x);\n  }\n}\nf();`,
      log: [[0], [2], [4]],
      output: `function f() {\n  for (let i = 0; i < 3; i++) {\n    let x = 0;\n    x = i * 2;\n    console.log(x);\n  }\n}\nf();`,
    },
    {
      title: "ループ内で最初に書き込む var は同じ挙動",
      input: `function f() {\n  var x = 0;\n  for (let i = 0; i < 3; i++) {\n    x = i;\n    console.log(x);\n  }\n}\nf();`,
      log: [[0], [1], [2]],
      output: `function f() {\n  for (let i = 0; i < 3; i++) {\n    var x = 0;\n    x = i;\n    console.log(x);\n  }\n}\nf();`,
    },
    {
      title: "読み取り専用の const はクロージャがあっても同じ挙動",
      input: `function f() {\n  const x = 10;\n  const fs = [];\n  for (let i = 0; i < 2; i++) {\n    fs.push(() => x + i);\n  }\n  return [fs[0](), fs[1]()];\n}\nconsole.log(f());`,
      log: [[[10, 11]]],
      output: `function f() {\n  const fs = [];\n  for (let i = 0; i < 2; i++) {\n    const x = 10;\n    fs.push(() => x + i);\n  }\n  return [fs[0](), fs[1]()];\n}\nconsole.log(f());`,
    },
  ],
});
