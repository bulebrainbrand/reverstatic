import { pluginTester } from "babel-plugin-tester";
import flatDoWhileSeq from "./flat-do-while-seq";
pluginTester({
  plugin: flatDoWhileSeq,
  pluginName: "flat-do-while-seq",
  tests: [
    { code: `console.log("foo");`, output: `console.log("foo");` },
    { code: `("foo","bar");`, output: `("foo", "bar");` },
    {
      code: `do{console.log(1)}while((a = b, true))`,
      output: `\
do {
  console.log(1);
  a = b;
} while (true);`,
    },
    {
      code: `do{const a = 1;console.log(a)}while((a = b,c = d))`,
      output: `\
do {
  const a = 1;
  console.log(a);
} while (((a = b), (c = d)));`,
    },
    {
      code: `do{const a = 1;console.log(a)}while(a,c = d)`,
      output: `\
do {
  const a = 1;
  console.log(a);
} while ((a, (c = d)));`,
    },
    {
      code: `do{const a = 1;console.log(a)}while(a.f,c = d)`,
      output: `\
do {
  const a = 1;
  console.log(a);
} while ((a.f, (c = d)));`,
    },
    {
      code: `do{const a = 1;console.log(a)}while((a = b,foo(),c = d))`,
      output: `\
do {
  const a = 1;
  console.log(a);
  foo();
} while (((a = b), (c = d)));`,
    },
    {
      code: `do{const a = 1;console.log(a)}while((foo(a), c = d))`,
      output: `\
do {
  const a = 1;
  console.log(a);
} while ((foo(a), (c = d)));`,
    },
    {
      code: `do{const a = 1;console.log(a)}while(new foo(a), c = d)`,
      output: `\
do {
  const a = 1;
  console.log(a);
} while ((new foo(a), (c = d)));`,
    },
    {
      code: `do{const a = 1;console.log(a)}while((f.g = a, c = d))`,
      output: `\
do {
  const a = 1;
  console.log(a);
} while (((f.g = a), (c = d)));`,
    },
  ],
});
