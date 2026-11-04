import { type NodePath, type PluginObject, type PluginPass } from "@babel/core";
import * as t from "@babel/types";

const identifierPattern = /^[A-Za-z_$][\w$]*$/;

const hasLeadingComment = (node: t.Node, marker: string): boolean =>
  node.leadingComments?.some((comment) => comment.value.trim() === marker) ??
  false;

const addIndexComment = (node: t.Node, marker: string): void => {
  if (hasLeadingComment(node, marker)) return;
  t.addComment(node, "leading", ` ${marker} `, false);
};

const getPropertyPrefix = (
  key: t.Node,
  computed: boolean,
  prefix: string,
): string | undefined => {
  if (computed) return undefined;
  if (t.isIdentifier(key)) return `${prefix}.${key.name}`;
  if (t.isStringLiteral(key)) {
    return identifierPattern.test(key.value)
      ? `${prefix}.${key.value}`
      : `${prefix}[${JSON.stringify(key.value)}]`;
  }
  if (t.isNumericLiteral(key)) return `${prefix}[${key.value}]`;
  return undefined;
};

const annotateExpression = (path: NodePath, prefix: string): void => {
  if (path.isArrayExpression()) {
    annotateArray(path, prefix);
    return;
  }
  if (!path.isObjectExpression()) return;

  for (const propertyPath of path.get("properties")) {
    if (!propertyPath.isObjectProperty()) continue;

    const propertyPrefix = getPropertyPrefix(
      propertyPath.node.key,
      propertyPath.node.computed,
      prefix,
    );
    if (propertyPrefix === undefined) continue;

    annotateExpression(propertyPath.get("value"), propertyPrefix);
  }
};

const annotateArray = (
  path: NodePath<t.ArrayExpression>,
  prefix: string,
): void => {
  path.get("elements").forEach((elementPath, index) => {
    const elementNode = elementPath.node;
    if (elementNode == null) return;
    if (elementPath.isSpreadElement()) return;

    const marker = `${prefix}[${index}]`;
    addIndexComment(elementNode, marker);
    annotateExpression(elementPath, marker);
  });
};

export default function (): PluginObject<PluginPass> {
  return {
    visitor: {
      VariableDeclarator(path) {
        const idPath = path.get("id");
        if (!idPath.isIdentifier()) return;

        const initPath = path.get("init");
        if (initPath.node == null) return;

        annotateExpression(initPath, idPath.node.name);
      },
    },
  };
}
