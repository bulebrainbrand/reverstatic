import { pluginTester } from "babel-plugin-tester";
import flatIfSeq from "./flat-if-seq";
pluginTester({
  plugin: flatIfSeq,
  pluginName: "flat-if-seq",
  tests: [{ code: `console.log("foo");`, output: `console.log("foo");` }],
});