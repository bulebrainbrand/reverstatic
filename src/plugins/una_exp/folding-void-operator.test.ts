import { pluginTester } from "babel-plugin-tester";
import foldingVoidOperator from "./folding-void-operator";
pluginTester({
  plugin: foldingVoidOperator,
  pluginName: "folding-not-operator",
  tests: [
    { code: `console.log("foo");`, output: `console.log("foo");` },
    { code: `!1;`, output: `!1;` },
    { code: `void 0;`, output: `undefined;` },
    { code: `void "foo"`, output: `undefined;` },
    {
      code: `const undefined = "foo";
void "bar";`,
      output: `const undefined = "foo";
void 0;`,
    },
    { code: `void a();`, output: `void a();` },
    { code: `void (a(),"foo");`, output: `void a();` },
    { code: `void (a(),"foo",1);`, output: `void a();` },
    { code: `void (a(),"foo",b())`, output: `void (a(), b());` },
    { code: `void ("foo","bar")`, output: `undefined;` },
    {
      code: `const undefined = "foo";
void ("foo","bar");`,
      output: `const undefined = "foo";
void 0;`,
    },
  ],
});
