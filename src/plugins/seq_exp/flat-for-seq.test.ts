import { pluginTester } from "babel-plugin-tester";
import flatForSeq from "./flat-for-seq";
pluginTester({
  plugin: flatForSeq,
  pluginName: "flat-for-seq",
  tests: [
    { code: `console.log("foo");`, output: `console.log("foo");` },
    {
      code: `\
for (a = b, c = d; i < 10; i++) {}`,
      output: `\
for (a = b, c = d; i < 10; i++) {}`,
    },
    // condition
    // conditionの実行の問題で、末尾にstatementを置くべき
    {
      code: `\
for (let i = 0; (a = b, c = d, i < 10); i++) {
  b += i;
  d += i + 1;
}`,
      output: `\
for (let i = 0; i < 10; i++) {
  a = b;
  c = d;
  b += i;
  d += i + 1;
}
a = b;
c = d;`,
    },
    {
      code: `\
for (let i = 0; (a = b, c = d, i < 10); i++) b+=i;`,
      output: `\
for (let i = 0; i < 10; i++) {
  a = b;
  c = d;
  b += i;
}
a = b;
c = d;`,
    },
    {
      code: `\
for (let i = 0; (a = b, c = d, i < 10); i++) {
  let a = i + 1;
  b += i;
  d += a;
}`,
      output: `\
for (let i = 0; (a = b), i < 10; i++) {
  c = d;
  let a = i + 1;
  b += i;
  d += a;
}
c = d;`,
    },
    {
      code: `\
for (let i = 0; ((a = b, c = d), i < 10); i++) {
  b += i;
  d += i + 1;
}`,
      output: `\
for (let i = 0; i < 10; i++) {
  ((a = b), (c = d));
  b += i;
  d += i + 1;
}
((a = b), (c = d));`,
    },
    // afterthought
    {
      code: `\
for (let i = 0; i < 10; a = b, c = d, i++) {
  b += i;
  d += i + 1;
}`,
      output: `\
for (let i = 0; i < 10; i++) {
  b += i;
  d += i + 1;
  a = b;
  c = d;
}`,
    },
    {
      // body内では内部の値を参照してしまうため、展開しない
      code: `\
for (let i = 0; i < 10; a = b, i++) {
  let a = i + 1;
  b += i;
  d += a;
}`,
      output: `\
for (let i = 0; i < 10; a = b, i++) {
  let a = i + 1;
  b += i;
  d += a;
}`,
    },
    {
      code: `\
for (let i = 0; i < 10; a = b, c = d, i++) {
  let a = i + 1;
  b += i;
  d += a;
}`,
      output: `\
for (let i = 0; i < 10; a = b, i++) {
  let a = i + 1;
  b += i;
  d += a;
  c = d;
}`,
    },
    {
      code: `\
for (let i = 0; i < 10; a, i++) {
  let a = i + 1;
  b += i;
  d += a;
}`,
      output: `\
for (let i = 0; i < 10; a, i++) {
  let a = i + 1;
  b += i;
  d += a;
}`,
    },
    {
      code: `\
for (let i = 0; i < 10; a.b, i++) {
  let a = i + 1;
  b += i;
  d += a;
}`,
      output: `\
for (let i = 0; i < 10; a.b, i++) {
  let a = i + 1;
  b += i;
  d += a;
}`,
    },
    {
      code: `\
for (let i = 0; i < 10; foo(a), i++) {
  let a = i + 1;
  b += i;
  d += a;
}`,
      output: `\
for (let i = 0; i < 10; foo(a), i++) {
  let a = i + 1;
  b += i;
  d += a;
}`,
    },
    {
      code: `\
for (let i = 0; i < 10; f.g = a, i++) {
  let a = i + 1;
  b += i;
  d += a;
}`,
      output: `\
for (let i = 0; i < 10; f.g = a, i++) {
  let a = i + 1;
  b += i;
  d += a;
}`,
    },
    {
      code: `\
for (let i = 0; i < 10; (i++,foo())) {
  b += i;
  d += i + 1;
}`,
      output: `\
for (let i = 0; i < 10; foo()) {
  b += i;
  d += i + 1;
  i++;
}`,
    },
    {
      code: `\
for (let i = 0; i < 10; a = b, c(), i++) {
  b += i;
  d += i + 1;
}`,
      output: `\
for (let i = 0; i < 10; i++) {
  b += i;
  d += i + 1;
  a = b;
  c();
}`,
    },
    // どちらもseq

    {
      code: `\
for (let i = 0; (a = b, c = d, i < 10);foo(), i++) {
  b += i;
  d += i + 1;
}`,
      output: `\
for (let i = 0; i < 10; i++) {
  a = b;
  c = d;
  b += i;
  d += i + 1;
  foo();
}
a = b;
c = d;`,
    },
    // prefix が cond に影響すると意味が変わるため展開しない
    // (出力は generator の正規化形で比較: body への移動も suffix もないこと)
    {
      code: `\
for (let i = 0; (i++, i < 10); i++) {
  b += i;
}`,
      output: `\
for (let i = 0; i++, i < 10; i++) {
  b += i;
}`,
    },
    {
      code: `\
for (let i = 0; (a = i, a < 10); i++) {
  b += i;
}`,
      output: `\
for (let i = 0; (a = i), a < 10; i++) {
  b += i;
}`,
    },
    // test の suffix が break でも実行され2重実行になる
    // update 側は該当なし。continue は偶然合う。
    {
      code: `\
for (let i = 0; (a = b, i < 10); i++) {
  if (x) break;
  b += i;
}`,
      output: `\
for (let i = 0; (a = b), i < 10; i++) {
  if (x) break;
  b += i;
}`,
    },
    // update を body 末尾に移動すると continue でスキップされる
    {
      code: `\
for (let i = 0; i < 10; a = b, i++) {
  if (x) continue;
  b += i;
}`,
      output: `\
for (let i = 0; i < 10; a = b, i++) {
  if (x) continue;
  b += i;
}`,
    },
    // 部分抽出による副作用順序入替になるため分解しない
    {
      code: `\
for (let i = 0; i < 10; a = b, c(), i++) {
  let a = i + 1;
  b += i;
}`,
      output: `\
for (let i = 0; i < 10; a = b, c(), i++) {
  let a = i + 1;
  b += i;
}`,
    },
    {
      code: `\
for (let i = 0; (a = b, c(), i < 10); i++) {
  let a = i + 1;
  b += i;
}`,
      output: `\
for (let i = 0; (a = b), c(), i < 10; i++) {
  let a = i + 1;
  b += i;
}`,
    },
    //  単文親の下での insertAfter
    // suffix を挿入しないこと (出力は generator 正規化形)
    {
      code: `\
if (x) for (let i = 0; (a = b, i < 10); i++) {
  b += i;
} else {
  c += 1;
}`,
      output: `\
if (x)
  for (let i = 0; (a = b), i < 10; i++) {
    b += i;
  }
else {
  c += 1;
}`,
    },
  ],
});
