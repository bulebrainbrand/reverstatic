import { pluginTester } from "babel-plugin-tester";
import mergeVarDeclAndAssign from "./merge-var-decl-and-assign";

const unchanged = (title: string, code: string) => ({
  title,
  code,
  output: code,
});

pluginTester({
  plugin: mergeVarDeclAndAssign,
  pluginName: "merge-var-decl-and-assign",
  tests: [
    // ===== 変換される =====
    { title: "基本 (let)", code: `let a;\na = 1;`, output: `let a = 1;` },
    { title: "基本 (var)", code: `var a;\na = 1;`, output: `var a = 1;` },
    {
      title: "複数宣言子を順番どおりに結合",
      code: `let a, b;\na = 1;\nb = 2;`,
      output: `let a = 1,\n  b = 2;`,
    },
    {
      title: "初期化子付き宣言子の後ろを結合",
      code: `let a = 0, b;\nb = 1;`,
      output: `let a = 0,\n  b = 1;`,
    },
    {
      title: "代入のない先頭の宣言子は残す",
      code: `let a, b;\nb = 1;`,
      output: `let a,\n  b = 1;`,
    },
    {
      title: "先頭の初期化子の評価順を保って結合",
      code: `let a = f(), b;\nb = 1;`,
      output: `let a = f(),\n  b = 1;`,
    },
    {
      title: "後ろの宣言子を参照する代入",
      code: `let a, b;\na = 1;\nb = a;`,
      output: `let a = 1,\n  b = a;`,
    },
    {
      title: "var は TDZ を気にせず自身を参照できる",
      code: `var a;\na = a;`,
      output: `var a = a;`,
    },
    {
      title: "var は後ろの宣言子を参照できる",
      code: `var a, b;\na = b;\nb = 2;`,
      output: `var a = b,\n  b = 2;`,
    },
    {
      title: "宣言子順と代入順が食い違う場合は結合できるものだけ結合",
      code: `let a, b;\nb = 1;\na = 2;`,
      output: `let a,\n  b = 1;\na = 2;`,
    },
    {
      title: "undefined; を挟んで結合",
      code: `let a;\nundefined;\na = 1;`,
      output: `let a = 1;\nundefined;`,
    },
    {
      title: "undefined; を挟んで複数結合",
      code: `let a, b;\na = 1;\nundefined;\nb = 2;`,
      output: `let a = 1,\n  b = 2;\nundefined;`,
    },
    {
      title: "無関係な単純代入を挟んで結合",
      code: `let a;\nx = 1;\na = 2;`,
      output: `let a = 2;\nx = 1;`,
    },
    {
      title: "副作用のない文を挟んだ呼び出し初期化子",
      code: `let a;\nundefined;\na = f();`,
      output: `let a = f();\nundefined;`,
    },
    {
      title: "空文を挟んで結合",
      code: `let a;\n;\na = 1;`,
      output: `let a = 1;`,
    },

    // ===== 変換されない =====
    unchanged("複合代入", `let a;\na += 1;`),
    unchanged("分割代入", `let a;\n({ a } = obj);`),
    unchanged("別ブロックの代入", `let a;\n{\n  a = 1;\n}`),
    unchanged("宣言より前の代入", `a = 1;\nlet a;`),
    unchanged("for の init の宣言", `for (let a; false;) {\n  a = 1;\n}`),
    unchanged("export 宣言", `export let a;\na = 1;`),
    unchanged("自身を参照する let", `let a;\na = a;`),
    unchanged(
      "後ろの未初期化宣言子を参照する let",
      `let a, b;\na = b;\nb = 2;`,
    ),
    unchanged("直接 eval を参照する let", `let a;\na = eval("a");`),
    unchanged("eval の呼び出しを挟む", `let a;\neval("a");\na = 1;`),
    unchanged("メンバー式を挟む", `let a;\nx.y;\na = 1;`),
    unchanged("結合先の変数を読む代入を挟む", `let a;\nx = a;\na = 1;`),
    {
      title: "途中で結合できない宣言子より前の代入だけ結合",
      code: `let a, b;\na = 1;\nx = b;\nb = 2;`,
      output: `let a = 1,\n  b;\nx = b;\nb = 2;`,
    },
    {
      title: "初期化子付き宣言子より前へは移さない",
      code: `let a, b = f();\na = 1;`,
      output: `let a,\n  b = f();\na = 1;`,
    },
  ],
});
