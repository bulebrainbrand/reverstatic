import { pluginTester } from "babel-plugin-tester";
import constantPropagation from "./constant-propagation";

const unchanged = (
  title: string,
  code: string,
  babelOptions?: { sourceType: "script" | "module" },
) => ({ title, code, output: code, ...(babelOptions ? { babelOptions } : {}) });

pluginTester({
  plugin: constantPropagation,
  pluginName: "constant-propagation",
  tests: [
    // ===== 変換される =====
    {
      title: "数値",
      code: `const a = 0;\nconsole.log(a);`,
      output: `const __unused_a__ = 0;\nconsole.log(0);`,
    },
    {
      title: "参照がない宣言もリネームする",
      code: `const a = 0;`,
      output: `const __unused_a__ = 0;`,
    },
    {
      title: "複数宣言と推移的な伝播",
      code: `const a = 0,\n  b = a;\nconsole.log(b);`,
      output: `const __unused_a__ = 0,\n  __unused_b__ = 0;\nconsole.log(0);`,
    },
    {
      title: "文字列・真偽値・null・テンプレート・BigInt・undefined・負数",
      code: 'const a = "x", b = true, c = null, d = `t`, e = 1n, f = undefined, g = -1;\nconsole.log(a, b, c, d, e, f, g);',
      output:
        'const __unused_a__ = "x",\n  __unused_b__ = true,\n  __unused_c__ = null,\n  __unused_d__ = `t`,\n  __unused_e__ = 1n,\n  __unused_f__ = undefined,\n  __unused_g__ = -1;\nconsole.log("x", true, null, `t`, 1n, undefined, -1);',
    },
    {
      title: "let / var",
      code: `let a = 1;\nvar b = 2;\nconsole.log(a, b);`,
      output: `let __unused_a__ = 1;\nvar __unused_b__ = 2;\nconsole.log(1, 2);`,
    },
    {
      title: "ネスト関数内の参照",
      code: `const a = 1;\nfunction f() {\n  return a;\n}\nconsole.log(f());`,
      output: `const __unused_a__ = 1;\nfunction f() {\n  return 1;\n}\nconsole.log(f());`,
    },
    {
      title: "同名変数のシャドーイング",
      code: `const a = 1;\nfunction f() {\n  const a = 2;\n  return a;\n}\nconsole.log(a, f());`,
      output: `const __unused_a__ = 1;\nfunction f() {\n  const __unused_a__ = 2;\n  return 2;\n}\nconsole.log(1, f());`,
    },
    {
      title: "宣言以外の式では畳み込まない",
      code: `const a = 1;\nconsole.log(a + 2);`,
      output: `const __unused_a__ = 1;\nconsole.log(1 + 2);`,
    },
    {
      title: "推移的な解決 (3段)",
      code: `const a = 1;\nconst b = a;\nconst c = b;\nconsole.log(c);`,
      output: `const __unused_a__ = 1;\nconst __unused_b__ = 1;\nconst __unused_c__ = 1;\nconsole.log(1);`,
    },
    {
      title: "オブジェクトの省略記法",
      code: `const a = 1;\nconsole.log({ a });`,
      output: `const __unused_a__ = 1;\nconsole.log({\n  a: 1,\n});`,
    },
    {
      title: "関数スコープ内の var",
      code: `function f() {\n  var a = 1;\n  return a;\n}`,
      output: `function f() {\n  var __unused_a__ = 1;\n  return 1;\n}`,
    },

    // ===== 変換されない =====
    unchanged("再代入", `let a = 1;\na = 2;\nconsole.log(a);`),
    unchanged("複合代入", `let a = 1;\na += 2;\nconsole.log(a);`),
    unchanged("更新式", `let a = 1;\na++;\nconsole.log(a);`),
    unchanged("関数呼び出しの初期化子", `const a = f();\nconsole.log(a);`),
    unchanged("配列の初期化子", `const a = [1, 2];\nconsole.log(a);`),
    unchanged(
      "オブジェクトの初期化子",
      `const a = {\n  x: 1,\n};\nconsole.log(a);`,
    ),
    unchanged("RegExp の初期化子", `const a = /x/;\nconsole.log(a);`),
    unchanged("宣言より前の参照", `console.log(a);\nconst a = 1;`),
    unchanged(
      "条件付きで初期化される var",
      `if (x) {\n  var a = 1;\n}\nconsole.log(a);`,
    ),
    unchanged(
      "直接 eval",
      `const a = 1;\neval("console.log(a)");\nconsole.log(a);`,
    ),
    unchanged("with 文", `const a = 1;\nwith (o) {\n  console.log(a);\n}`, {
      sourceType: "script",
    }),
    unchanged("export 宣言", `export const a = 1;\nconsole.log(a);`),
    unchanged("export 指定子", `const a = 1;\nexport { a };`),
    unchanged(
      "分割代入の宣言",
      `const { a } = {\n  a: 1,\n};\nconsole.log(a);`,
    ),
  ],
});
