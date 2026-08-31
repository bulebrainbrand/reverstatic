import { pluginTester } from "babel-plugin-tester";
import flatSeqContent from "./flat-stmt-seq-content";
pluginTester({
  plugin: flatSeqContent,
  pluginName: "flat-seq-content",
  tests: [
    { code: `console.log("foo");`, output: `console.log("foo");` },
    {
      code: `do{console.log(1)}while((a = b,c = d))`,
      output: `\
do{
  console.log(1);
  a = b;
}while(c = d);`,
    },
    {
      code: `do{const a = 1;console.log(a)}while((a = b,c = d))`,
      output: `\
do{
  const a = 1;
  console.log(a);
}while((a = b,c = d));`,
    },
  ],
});
