import { type PluginObject, PluginPass } from "@babel/core";
export default function (): PluginObject<PluginPass> {
  return {
    visitor: {
      UnaryExpression(path) {
        const node = path.node;
        if (node.operator !== "!") return;
      },
    },
  };
}
