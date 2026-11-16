// oxlint-disable no-eval
import { transformSync, type InputOptions, type PluginItem } from "@babel/core";
import { describe, expect, it } from "vite-plus/test";

export const expectDifferenceBehavior = ({
  plugin,
  pluginName,
  tests,
}: {
  tests: ({
    input: string;
    inputLog: unknown[];
    output: string;
    outputLog: unknown[];
    title?: string;
  } & InputOptions)[];
  plugin: PluginItem;
  pluginName: string;
}) => {
  describe(pluginName, () => {
    for (const {
      input,
      inputLog,
      output,
      outputLog,
      title,
      ...options
    } of tests) {
      it(title ?? pluginName, () => {
        const outputCode = transformSync(input, {
          plugins: [plugin],
          ...options,
          configFile: false,
          babelrc: false,
        });
        // console.logを差し替える
        const original = console.log;
        let log: unknown[] = [];
        const mock = (...data: unknown[]) => {
          log.push(data);
        };

        console.log = mock;
        eval(input);
        console.log = original;

        expect(log).toEqual(inputLog);

        log = [];
        expect(outputCode?.code).toEqual(output);

        console.log = mock;
        eval(outputCode!.code!);
        console.log = original;

        expect(log).toEqual(outputLog);
      });
    }
  });
};
