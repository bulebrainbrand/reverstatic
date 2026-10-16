import { pluginTester } from "babel-plugin-tester";
import flatReturnSeq from "./flat-return-seq.ts";
pluginTester({
  plugin: flatReturnSeq,
  pluginName: "flat-return-seq",
  tests: [
    {
      code: `function foo() {
  return ("bar",0);
}`,
      output: `function foo() {
  "bar";
  return 0;
}`,
    },
  ],
});
