import { type PluginObject, PluginPass } from "@babel/core";
import * as t from "@babel/types";
import { isTruhy } from "../../utils/isTrushy";
import { Result } from "@praha/byethrow";
export default function (): PluginObject<PluginPass> {
  return {
    visitor: {
      UnaryExpression(path) {
        const node = path.node;
        if (node.operator !== "!") return;
        const result = isTruhy(path.get("argument"));
        if (Result.isSuccess(result)) {
          const bool = Result.unwrap(result);
          path.replaceWith(t.booleanLiteral(!bool));
        }
        return;
      },
    },
  };
}
