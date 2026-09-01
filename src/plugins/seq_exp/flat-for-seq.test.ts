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
  ],
});