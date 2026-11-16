import { pluginTester } from "babel-plugin-tester";
import moveVarDeclToMinimumScope from "./move-var-decl-to-minimum-scope";

const unchanged = (
  title: string,
  code: string,
  babelOptions?: { sourceType: "script" | "module" },
) => ({ title, code, output: code, ...(babelOptions ? { babelOptions } : {}) });

pluginTester({
  plugin: moveVarDeclToMinimumScope,
  pluginName: "move-var-decl-to-minimum-scope",
  tests: [
    // ===== 変換される =====
    {
      title: "let を if ブロックへ移動",
      code: `function f() {\n  let x = 1;\n  if (cond) {\n    console.log(x);\n  }\n}`,
      output: `function f() {\n  if (cond) {\n    let x = 1;\n    console.log(x);\n  }\n}`,
    },
    {
      title: "const を if ブロックへ移動",
      code: `function f() {\n  const x = "x";\n  if (cond) {\n    return x;\n  }\n}`,
      output: `function f() {\n  if (cond) {\n    const x = "x";\n    return x;\n  }\n}`,
    },
    {
      title: "初期化子なし var を移動",
      code: `function f() {\n  var x;\n  if (cond) {\n    x = 1;\n    console.log(x);\n  }\n}`,
      output: `function f() {\n  if (cond) {\n    var x;\n    x = 1;\n    console.log(x);\n  }\n}`,
    },
    {
      title: "初期化子付き var を移動",
      code: `function f() {\n  var x = 1;\n  if (cond) {\n    console.log(x);\n  }\n}`,
      output: `function f() {\n  if (cond) {\n    var x = 1;\n    console.log(x);\n  }\n}`,
    },
    {
      title: "複数宣言子を別々の移動先へ分割",
      code: `function f() {\n  let a = 1, b = 2;\n  if (cond) {\n    console.log(a);\n  }\n  console.log(b);\n}`,
      output: `function f() {\n  let b = 2;\n  if (cond) {\n    let a = 1;\n    console.log(a);\n  }\n  console.log(b);\n}`,
    },
    {
      title: "同じ移動先の複数宣言子はまとめる",
      code: `function f() {\n  let a = 1, b = 2;\n  if (cond) {\n    console.log(a, b);\n  }\n}`,
      output: `function f() {\n  if (cond) {\n    let a = 1,\n      b = 2;\n    console.log(a, b);\n  }\n}`,
    },
    {
      title: "より深いブロックへ移動",
      code: `function f() {\n  const x = 1;\n  if (a) {\n    if (b) {\n      console.log(x);\n    }\n  }\n}`,
      output: `function f() {\n  if (a) {\n    if (b) {\n      const x = 1;\n      console.log(x);\n    }\n  }\n}`,
    },
    {
      title: "移動先内のクロージャから参照",
      code: `function f() {\n  let x = 1;\n  if (cond) {\n    return () => x;\n  }\n}`,
      output: `function f() {\n  if (cond) {\n    let x = 1;\n    return () => x;\n  }\n}`,
    },
    {
      title: "初期化子なし var はループ内へ移動できる",
      code: `function f(ys) {\n  var x;\n  for (const y of ys) {\n    x = y;\n    console.log(x);\n  }\n}`,
      output: `function f(ys) {\n  for (const y of ys) {\n    var x;\n    x = y;\n    console.log(x);\n  }\n}`,
    },
    {
      title: "初期化子なし let を裸のブロックへ移動",
      code: `function f() {\n  let x;\n  {\n    x = 1;\n    console.log(x);\n  }\n}`,
      output: `function f() {\n  {\n    let x;\n    x = 1;\n    console.log(x);\n  }\n}`,
    },
    {
      title: "複数の宣言を同じ移動先へ元の順で挿入",
      code: `function f() {\n  let a = 1;\n  let b = 2;\n  if (cond) {\n    console.log(a, b);\n  }\n}`,
      output: `function f() {\n  if (cond) {\n    let a = 1;\n    let b = 2;\n    console.log(a, b);\n  }\n}`,
    },
    {
      title: "else ブロックへ移動",
      code: `function f() {\n  let x = 1;\n  if (cond) {\n    return 0;\n  } else {\n    return x;\n  }\n}`,
      output: `function f() {\n  if (cond) {\n    return 0;\n  } else {\n    let x = 1;\n    return x;\n  }\n}`,
    },
    {
      title: "移動先での再代入を含めて移動",
      code: `function f() {\n  let x = 0;\n  if (cond) {\n    x = 1;\n    console.log(x);\n  }\n}`,
      output: `function f() {\n  if (cond) {\n    let x = 0;\n    x = 1;\n    console.log(x);\n  }\n}`,
    },
    {
      title: "配列リテラルの初期化子",
      code: `function f() {\n  const x = [1, 2];\n  if (cond) {\n    console.log(x);\n  }\n}`,
      output: `function f() {\n  if (cond) {\n    const x = [1, 2];\n    console.log(x);\n  }\n}`,
    },
    {
      title: "ネストしたブロック内の宣言をさらに内側へ",
      code: `function f() {\n  {\n    let x = 1;\n    if (cond) {\n      console.log(x);\n    }\n  }\n}`,
      output: `function f() {\n  {\n    if (cond) {\n      let x = 1;\n      console.log(x);\n    }\n  }\n}`,
    },

    // ===== 変換されない =====
    unchanged(
      "使用箇所が複数のブロックに分かれる",
      `function f(c) {\n  let x = 1;\n  if (c) {\n    console.log(x);\n  }\n  if (!c) {\n    console.log(x);\n  }\n}`,
    ),
    unchanged(
      "if の条件式と本体の両方で使う",
      `function f(c) {\n  let x = 1;\n  if (x && c) {\n    console.log(x);\n  }\n}`,
    ),
    unchanged(
      "初期化子が関数呼び出し",
      `function f() {\n  let x = g();\n  if (c) {\n    console.log(x);\n  }\n}`,
    ),
    unchanged(
      "初期化子が外部変数を読む",
      `function f(y) {\n  let x = y;\n  if (c) {\n    console.log(x);\n  }\n}`,
    ),
    unchanged(
      "初期化子がプロパティを読む",
      `function f() {\n  let x = this.value;\n  if (c) {\n    console.log(x);\n  }\n}`,
    ),
    unchanged(
      "let をループ内へは移動しない",
      `function f(ys) {\n  let x = 1;\n  for (const y of ys) {\n    console.log(x);\n  }\n}`,
    ),
    unchanged(
      "初期化子なし let をループ内へは移動しない",
      `function f(ys) {\n  let x;\n  for (const y of ys) {\n    x = y;\n    console.log(x);\n  }\n}`,
    ),
    unchanged(
      "初期化子付き var をループ内へは移動しない",
      `function f(ys) {\n  var x = 1;\n  for (const y of ys) {\n    console.log(x);\n  }\n}`,
    ),
    unchanged(
      "ネストした関数の本体へは移動しない",
      `function f() {\n  let x = 1;\n  return function () {\n    return x;\n  };\n}`,
    ),
    unchanged(
      "直接 eval がある",
      `function f() {\n  let x = 1;\n  if (c) {\n    eval("x");\n    console.log(x);\n  }\n}`,
    ),
    unchanged(
      "with がある",
      `function f(o) {\n  let x = 1;\n  if (c) {\n    with (o) {\n      console.log(x);\n    }\n  }\n}`,
      { sourceType: "script" },
    ),
    unchanged(
      "for の init の宣言",
      `function f() {\n  for (let i = 0; i < 1; i++) {\n    console.log(i);\n  }\n}`,
    ),
    unchanged(
      "分割代入の宣言",
      `function f() {\n  const { x } = obj;\n  if (c) {\n    console.log(x);\n  }\n}`,
    ),
    unchanged("Program 直下の宣言", `let x = 1;\n{\n  console.log(x);\n}`),
    unchanged(
      "宣言より前の使用箇所",
      `function f(c) {\n  {\n    console.log(x);\n  }\n  let x = 1;\n}`,
    ),
    unchanged(
      "トップレベルブロック内のグローバル var 初期化",
      `{\n  var x = 1;\n  if (c) {\n    console.log(x);\n  }\n}`,
    ),
    unchanged(
      "単文の if body",
      `function f(c) {\n  let x = 1;\n  if (c) console.log(x);\n}`,
    ),
  ],
});
