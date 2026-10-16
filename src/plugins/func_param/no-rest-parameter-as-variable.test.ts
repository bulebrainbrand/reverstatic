import { pluginTester } from "babel-plugin-tester";
import noRestParameterAsVariable from "./no-rest-parameter-as-variable";

// 変換されないケース (入力 = 出力)
const unchanged = (
  title: string,
  code: string,
  babelOptions?: { sourceType: "script" },
) => ({
  title,
  code,
  output: code,
  ...(babelOptions ? { babelOptions } : {}),
});

pluginTester({
  plugin: noRestParameterAsVariable,
  pluginName: "no-rest-parameter-as-variable",
  tests: [
    // ===== 変換される =====
    {
      title: "基本 (文字列キー)",
      code: `function f(...r) {
  r["a"] = 1;
  return r["a"];
}`,
      output: `function f(...r) {
  let a;
  a = 1;
  return a;
}`,
    },
    {
      title: "数値キーは実引数を取り込む / 書込みのない r[0] はそのまま",
      code: `function f(...r) {
  r["a"] = "x";
  r[246] = "" + (r[0] || "");
  r["c"] = r[246].length;
  for (r["h"] = 0; r["h"] < r["c"]; r["h"]++) {
    r["i"] = r["a"].indexOf(r[246][r["h"]]);
  }
  return r[246];
}`,
      output: `function f(...r) {
  let a,
    _246 = r[246],
    c,
    h,
    i;
  a = "x";
  _246 = "" + (r[0] || "");
  c = _246.length;
  for (h = 0; h < c; h++) {
    i = a.indexOf(_246[h]);
  }
  return _246;
}`,
    },
    {
      title: "数値キーの条件付き書込み (実行順に依存しない)",
      code: `function f(...r) {
  if (c) r[0] = 1;
  return r[0];
}`,
      output: `function f(...r) {
  let _0 = r[0];
  if (c) _0 = 1;
  return _0;
}`,
    },
    {
      title: "数値キーの読取が書込みより先",
      code: `function f(...r) {
  console.log(r[0]);
  r[0] = 1;
  return r[0];
}`,
      output: `function f(...r) {
  let _0 = r[0];
  console.log(_0);
  _0 = 1;
  return _0;
}`,
    },
    {
      title: "書込みのない数値キーの読取は実引数なので残す",
      code: `function f(...r) {
  r["a"] = r[0];
  return r["a"];
}`,
      output: `function f(...r) {
  let a;
  a = r[0];
  return a;
}`,
    },
    {
      title: "ドットとブラケットの混在 + 複合代入 (アロー関数)",
      code: `const f = (...r) => {
  r.a = 1;
  r["a"] += 2;
  return r.a;
};`,
      output: `const f = (...r) => {
  let a;
  a = 1;
  a += 2;
  return a;
};`,
    },
    {
      title: "負数キー・複合代入・更新式",
      code: `function f(...r) {
  r[-185] = [];
  r[-79] = 3;
  r[5] |= r[-79] << 1;
  r[5]++;
  return r[-185];
}`,
      output: `function f(...r) {
  let _neg185,
    _neg79,
    _5 = r[5];
  _neg185 = [];
  _neg79 = 3;
  _5 |= _neg79 << 1;
  _5++;
  return _neg185;
}`,
    },
    {
      title: "負数キーの読取のみ (他に書込みキーがある)",
      code: `function f(...r) {
  r["a"] = 1;
  return r[-79];
}`,
      output: `function f(...r) {
  let a, _neg79;
  a = 1;
  return _neg79;
}`,
    },
    {
      title: "通常引数との併用",
      code: `function f(a, ...r) {
  r["x"] = a;
  return r["x"];
}`,
      output: `function f(a, ...r) {
  let x;
  x = a;
  return x;
}`,
    },
    {
      title: "length の書込み・読取は数値キーがなければ残して変換",
      code: `function f(...r) {
  r["length"] = 1;
  r["a"] = 2;
  return r["a"] + r.length;
}`,
      output: `function f(...r) {
  let a;
  r["length"] = 1;
  a = 2;
  return a + r.length;
}`,
    },
    {
      title: "length の読取のみ",
      code: `function f(...r) {
  r["a"] = 1;
  return r.length;
}`,
      output: `function f(...r) {
  let a;
  a = 1;
  return r.length;
}`,
    },
    {
      title: "ObjectExpression の値は読取",
      code: `function f(...r) {
  r["a"] = 1;
  return { k: r["a"] };
}`,
      output: `function f(...r) {
  let a;
  a = 1;
  return {
    k: a,
  };
}`,
    },
    {
      title: "分割代入の書込み先",
      code: `function f(...r) {
  [r["a"]] = [1];
  ({ k: r["b"] } = { k: 2 });
  return r["a"] + r["b"];
}`,
      output: `function f(...r) {
  let a, b;
  [a] = [1];
  ({ k: b } = {
    k: 2,
  });
  return a + b;
}`,
    },
    {
      title: "for-of の左辺",
      code: `function f(...r) {
  for (r["a"] of [1, 2]) {}
  return r["a"];
}`,
      output: `function f(...r) {
  let a;
  for (a of [1, 2]) {
  }
  return a;
}`,
    },
    {
      title: "ネスト関数からの参照",
      code: `function f(...r) {
  r["a"] = 1;
  return () => r["a"];
}`,
      output: `function f(...r) {
  let a;
  a = 1;
  return () => a;
}`,
    },
    {
      title: "式なしテンプレートリテラルのキー",
      code: 'function f(...r) {\n  r[`a`] = 1;\n  return r["a"];\n}',
      output: `function f(...r) {
  let a;
  a = 1;
  return a;
}`,
    },
    {
      title: "ネストした2つの rest 関数",
      code: `function f(...r) {
  r["a"] = 1;
  return function g(...q) {
    q["a"] = 2;
    return q["a"] + r["a"];
  };
}`,
      output: `function f(...r) {
  let a;
  a = 1;
  return function g(...q) {
    let _a;
    _a = 2;
    return _a + a;
  };
}`,
    },

    // ===== 名前衝突 =====
    {
      title: "外側の変数と衝突したらリネーム",
      code: `var a = 0;
function f(...r) {
  r["a"] = 1;
  return r["a"] + a;
}`,
      output: `var a = 0;
function f(...r) {
  let _a;
  _a = 1;
  return _a + a;
}`,
    },
    {
      title: "内側関数の未参照宣言に捕捉されない",
      code: `function f(...r) {
  function g() {
    let a = 1;
    r["a"] = 2;
    return a;
  }
}`,
      output: `function f(...r) {
  let _a;
  function g() {
    let a = 1;
    _a = 2;
    return a;
  }
}`,
    },

    // ===== 変換されない =====
    unchanged(
      "rest自体が値として漏れる",
      `function f(...r) {
  r["a"] = 1;
  return r;
}`,
    ),
    unchanged(
      "restの再代入",
      `function f(...r) {
  r = [];
  r["a"] = 1;
}`,
    ),
    unchanged(
      "動的キー",
      `function f(...r) {
  r[x] = 1;
}`,
    ),
    unchanged(
      "restなし",
      `function f(a) {
  a = 1;
  return a;
}`,
    ),
    unchanged(
      "書込みなし (純粋な参照のみ)",
      `function f(...r) {
  return r[0];
}`,
    ),
    unchanged(
      "配列全体の観測メソッド",
      `function f(...r) {
  r["a"] = 1;
  return r.slice(0);
}`,
    ),
    unchanged(
      "新しめの Array メソッド名 (findLast)",
      `function f(...r) {
  r["findLast"] = 1;
}`,
    ),
    unchanged(
      "数値キー書込みと length 読取の併用",
      `function f(...r) {
  r[5] = 1;
  return r.length;
}`,
    ),
    unchanged(
      "数値キー書込みと length 書込みの併用",
      `function f(...r) {
  r["length"] = 1;
  r[246] = 1;
  return r[246];
}`,
    ),
    unchanged(
      "数値キー書込み後の length 切詰め",
      `function f(...r) {
  r[0] = 1;
  r.length = 0;
  return r[0];
}`,
    ),
    unchanged(
      "delete",
      `function f(...r) {
  r["a"] = 1;
  delete r["a"];
}`,
    ),
    unchanged(
      "__proto__",
      `function f(...r) {
  r["__proto__"] = 1;
}`,
    ),
    unchanged(
      "__defineGetter__",
      `function f(...r) {
  r["__defineGetter__"] = 1;
}`,
    ),
    unchanged(
      "メソッド呼び出し (this が変わる)",
      `function f(...r) {
  r["a"] = function () {
    return this;
  };
  return r["a"]();
}`,
    ),
    unchanged(
      "タグ付きテンプレート (this が変わる)",
      'function f(...r) {\n  r["a"] = tag;\n  return r["a"]`x`;\n}',
    ),
    unchanged(
      "オプショナルチェーン",
      `function f(...r) {
  r["a"] = 1;
  return r?.["a"];
}`,
    ),
    unchanged(
      "直接 eval",
      `function f(...r) {
  r["a"] = 1;
  return eval("a");
}`,
    ),
    unchanged(
      "with 文",
      `function f(...r) {
  r["a"] = 1;
  with (o) {
    return r["a"];
  }
}`,
      { sourceType: "script" },
    ),
    unchanged(
      "式ボディのアロー関数",
      `const f = (...r) => ((r["a"] = 1), r["a"]);`,
    ),
  ],
});
