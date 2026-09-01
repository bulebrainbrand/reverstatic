import { pluginTester } from "babel-plugin-tester";
import flatDoWhileSeq from "./flat-do-while-seq";
pluginTester({
  plugin: flatDoWhileSeq,
  pluginName: "flat-do-while-seq",
  tests: [
    { code: `console.log("foo");`, output: `console.log("foo");` },
    { code: `("foo","bar");`, output: `("foo", "bar");` },
    {
      code: `do{console.log(1)}while((a = b,c = d))`,
      output: `\
do {
  console.log(1);
  a = b;
} while ((c = d));`,
    },
    {
      code: `do{const a = 1;console.log(a)}while((a = b,c = d))`,
      output: `\
do {
  const a = 1;
  console.log(a);
} while (((a = b), (c = d)));`,
    },
  ],
});
