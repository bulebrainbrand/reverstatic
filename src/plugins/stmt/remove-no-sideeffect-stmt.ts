import { type PluginObject, type PluginPass } from "@babel/core";
import { isNoSideEffect } from "../../utils/isNoSideEffect";

export default function (): PluginObject<PluginPass> {
  return {
    visitor: {
      ExpressionStatement(path) {
        const expressionPath = path.get("expression");
        if (!isNoSideEffect(expressionPath)) return;
        path.remove();
      },
    },
  };
}
