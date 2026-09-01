import { pluginTester } from "babel-plugin-tester";
import foldingNotOperator from "./folding-not-operator";
pluginTester({
  plugin: foldingNotOperator,
  pluginName: "folding-not-operator",
  tests: [
    { code: `console.log("foo");`, output: `console.log("foo");` },
    { code: `void 0;`, output: `void 0;` },
    { code: `!"foo";`, output: `false;` },
    { code: `!1;`, output: `false;` },
    { code: `!1n;`, output: `false;` },
    { code: `!true;`, output: `false;` },
    { code: `!/reg/;`, output: `false;` },
    { code: `!0;`, output: `true;` },
    { code: `!0n;`, output: `true;` },
    { code: `!false;`, output: `true;` },
    { code: `!null;`, output: `true;` },
    { code: `!undefined;`, output: `true;` },
    { code: `!!true;`, output: `!false;` },
  ],
});