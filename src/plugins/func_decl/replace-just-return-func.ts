import { type NodePath, type PluginObject } from "@babel/core";
import * as t from "@babel/types";
import { isNoSideEffect } from "../../utils/isNoSideEffect";

// isNoSideEffect は RegExpLiteral を true とみなすが、
// /x/ === /x/ が false になるように同一性が変わるため複製は非安全。
// count===0 の除去は安全なので、複製経路だけこちらを使う。
// Identifier の二重読み(getter/proxy/with)の厳密な安全性は
// 信頼できる入力前提として本プラグインでは扱わない(wont-fix)。
const isSafeToDuplicate = (path: NodePath): boolean => {
  if (path.isRegExpLiteral()) {
    return false;
  }
  return isNoSideEffect(path);
};

const NON_DESTRUCTIVE_METHODS = new Set<string>([
  // String / Array の非破壊メソッド(名前ベースのAllowlist)
  "slice",
  "substring",
  "substr",
  "split",
  "replace",
  "replaceAll",
  "toLowerCase",
  "toUpperCase",
  "trim",
  "charAt",
  "charCodeAt",
  "includes",
  "indexOf",
  "startsWith",
  "endsWith",
  "padStart",
  "padEnd",
  "concat",
  "join",
]);

const getMethodName = (member: t.MemberExpression): string | undefined => {
  if (!member.computed) {
    const property = member.property;
    if (t.isIdentifier(property)) {
      return property.name;
    }
    return undefined;
  }
  const property = member.property;
  if (t.isStringLiteral(property)) {
    return property.value;
  }
  return undefined;
};

type ReturnArgAnalysis = {
  pure: boolean;
  paramCounts: Map<string, number>;
  firstSeenOrder: string[];
  freeNames: string[];
  hasConditional: boolean;
  hasTypeofParam: boolean;
};

const analyzeReturnArg = (
  root: t.Expression,
  paramNameSet: Set<string>,
  funcName: string,
): ReturnArgAnalysis => {
  const paramCounts = new Map<string, number>();
  const firstSeenOrder: string[] = [];
  const freeNames: string[] = [];
  let pure = true;
  let hasConditional = false;
  let hasTypeofParam = false;

  const recordRef = (name: string, insideTypeof: boolean): void => {
    if (paramNameSet.has(name)) {
      paramCounts.set(name, (paramCounts.get(name) ?? 0) + 1);
      if (!firstSeenOrder.includes(name)) {
        firstSeenOrder.push(name);
      }
      if (insideTypeof) {
        // typeof a の a を未宣言変数で置換すると ReferenceError が握りつぶされる
        hasTypeofParam = true;
      }
      return;
    }
    if (name === "arguments") {
      pure = false;
      return;
    }
    if (name === funcName) {
      pure = false;
      return;
    }
    if (!freeNames.includes(name)) {
      freeNames.push(name);
    }
  };

  const visitNode = (node: t.Node, insideTypeof = false): void => {
    if (!pure) {
      return;
    }
    if (t.isOptionalCallExpression(node)) {
      pure = false;
      return;
    }
    if (t.isOptionalMemberExpression(node)) {
      pure = false;
      return;
    }
    if (t.isIdentifier(node)) {
      recordRef(node.name, insideTypeof);
      return;
    }
    if (
      t.isStringLiteral(node) ||
      t.isNumericLiteral(node) ||
      t.isBooleanLiteral(node) ||
      t.isNullLiteral(node) ||
      t.isBigIntLiteral(node) ||
      t.isRegExpLiteral(node) ||
      t.isTemplateElement(node)
    ) {
      return;
    }
    if (t.isTemplateLiteral(node)) {
      for (const expr of node.expressions) {
        if (!t.isExpression(expr)) {
          pure = false;
          return;
        }
        visitNode(expr, insideTypeof);
        if (!pure) {
          return;
        }
      }
      return;
    }
    if (t.isArrayExpression(node)) {
      for (const element of node.elements) {
        if (element === null) {
          continue;
        }
        if (!t.isExpression(element)) {
          pure = false;
          return;
        }
        visitNode(element, insideTypeof);
        if (!pure) {
          return;
        }
      }
      return;
    }
    if (t.isObjectExpression(node)) {
      for (const prop of node.properties) {
        if (!t.isObjectProperty(prop)) {
          pure = false;
          return;
        }
        if (prop.computed) {
          visitNode(prop.key, insideTypeof);
          if (!pure) {
            return;
          }
        } else if (t.isPrivateName(prop.key)) {
          pure = false;
          return;
        }
        visitNode(prop.value, insideTypeof);
        if (!pure) {
          return;
        }
      }
      return;
    }
    if (t.isBinaryExpression(node)) {
      visitNode(node.left, insideTypeof);
      if (!pure) {
        return;
      }
      visitNode(node.right, insideTypeof);
      return;
    }
    if (t.isLogicalExpression(node)) {
      // && / || / ?? は右辺を短絡する
      hasConditional = true;
      visitNode(node.left, insideTypeof);
      if (!pure) {
        return;
      }
      visitNode(node.right, insideTypeof);
      return;
    }
    if (t.isUnaryExpression(node)) {
      if (node.operator === "delete") {
        pure = false;
        return;
      }
      visitNode(node.argument, insideTypeof || node.operator === "typeof");
      return;
    }
    if (t.isConditionalExpression(node)) {
      // a ? b : c は b / c のどちらかを取りこなす
      hasConditional = true;
      visitNode(node.test, insideTypeof);
      if (!pure) {
        return;
      }
      visitNode(node.consequent, insideTypeof);
      if (!pure) {
        return;
      }
      visitNode(node.alternate, insideTypeof);
      return;
    }
    if (t.isSequenceExpression(node)) {
      for (const expr of node.expressions) {
        visitNode(expr, insideTypeof);
        if (!pure) {
          return;
        }
      }
      return;
    }
    if (t.isMemberExpression(node)) {
      if (t.isPrivateName(node.property)) {
        pure = false;
        return;
      }
      visitNode(node.object, insideTypeof);
      if (!pure) {
        return;
      }
      if (node.computed) {
        visitNode(node.property, insideTypeof);
      }
      return;
    }
    if (t.isCallExpression(node)) {
      if (node.typeArguments) {
        pure = false;
        return;
      }
      const innerCallee = node.callee;
      if (!t.isMemberExpression(innerCallee)) {
        pure = false;
        return;
      }
      if (t.isPrivateName(innerCallee.property)) {
        pure = false;
        return;
      }
      const methodName = getMethodName(innerCallee);
      if (
        methodName === undefined ||
        !NON_DESTRUCTIVE_METHODS.has(methodName)
      ) {
        pure = false;
        return;
      }
      for (const arg of node.arguments) {
        if (!t.isExpression(arg)) {
          pure = false;
          return;
        }
      }
      visitNode(innerCallee.object, insideTypeof);
      if (!pure) {
        return;
      }
      if (innerCallee.computed) {
        visitNode(innerCallee.property, insideTypeof);
        if (!pure) {
          return;
        }
      }
      for (const arg of node.arguments) {
        visitNode(arg, insideTypeof);
        if (!pure) {
          return;
        }
      }
      return;
    }
    // This/Super/Assignment/Update/Await/Yield/New/Function/Class等は不可
    pure = false;
  };

  visitNode(root);
  return {
    pure,
    paramCounts,
    firstSeenOrder,
    freeNames,
    hasConditional,
    hasTypeofParam,
  };
};

const substituteExpression = (
  node: t.Expression,
  paramToArg: Map<string, t.Expression>,
): t.Expression => {
  if (t.isIdentifier(node)) {
    const replacement = paramToArg.get(node.name);
    if (replacement !== undefined) {
      return t.cloneNode(replacement, true);
    }
    return t.cloneNode(node, true);
  }
  if (t.isMemberExpression(node)) {
    if (!t.isExpression(node.object)) {
      return t.cloneNode(node, true);
    }
    const object = substituteExpression(node.object, paramToArg);
    if (node.computed) {
      if (!t.isExpression(node.property)) {
        return t.cloneNode(node, true);
      }
      const property = substituteExpression(node.property, paramToArg);
      return t.memberExpression(object, property, true);
    }
    return t.memberExpression(object, t.cloneNode(node.property, true), false);
  }
  if (t.isCallExpression(node)) {
    const callee = node.callee;
    if (!t.isMemberExpression(callee)) {
      // purity チェック済みのはずだが念のため複製だけする
      return t.cloneNode(node, true);
    }
    if (!t.isExpression(callee.object)) {
      return t.cloneNode(node, true);
    }
    const object = substituteExpression(callee.object, paramToArg);
    let property: t.MemberExpression["property"];
    if (callee.computed) {
      if (!t.isExpression(callee.property)) {
        return t.cloneNode(node, true);
      }
      property = substituteExpression(callee.property, paramToArg);
    } else {
      property = t.cloneNode(callee.property, true);
    }
    const args: t.CallExpression["arguments"] = [];
    for (const arg of node.arguments) {
      if (!t.isExpression(arg)) {
        return t.cloneNode(node, true);
      }
      args.push(substituteExpression(arg, paramToArg));
    }
    return t.callExpression(
      t.memberExpression(object, property, callee.computed),
      args,
    );
  }
  if (t.isBinaryExpression(node)) {
    if (!t.isExpression(node.left)) {
      return t.cloneNode(node, true);
    }
    return t.binaryExpression(
      node.operator,
      substituteExpression(node.left, paramToArg),
      substituteExpression(node.right, paramToArg),
    );
  }
  if (t.isLogicalExpression(node)) {
    if (!t.isExpression(node.left)) {
      return t.cloneNode(node, true);
    }
    return t.logicalExpression(
      node.operator,
      substituteExpression(node.left, paramToArg),
      substituteExpression(node.right, paramToArg),
    );
  }
  if (t.isUnaryExpression(node)) {
    return t.unaryExpression(
      node.operator,
      substituteExpression(node.argument, paramToArg),
    );
  }
  if (t.isConditionalExpression(node)) {
    return t.conditionalExpression(
      substituteExpression(node.test, paramToArg),
      substituteExpression(node.consequent, paramToArg),
      substituteExpression(node.alternate, paramToArg),
    );
  }
  if (t.isSequenceExpression(node)) {
    return t.sequenceExpression(
      node.expressions.map((expr) => substituteExpression(expr, paramToArg)),
    );
  }
  if (t.isTemplateLiteral(node)) {
    const expressions: t.TemplateLiteral["expressions"] = [];
    for (const expr of node.expressions) {
      if (!t.isExpression(expr)) {
        return t.cloneNode(node, true);
      }
      expressions.push(substituteExpression(expr, paramToArg));
    }
    return t.templateLiteral(
      node.quasis.map((quasi) => t.cloneNode(quasi, true)),
      expressions,
    );
  }
  if (t.isArrayExpression(node)) {
    const elements: t.ArrayExpression["elements"] = [];
    for (const element of node.elements) {
      if (element === null) {
        elements.push(null);
        continue;
      }
      if (!t.isExpression(element)) {
        return t.cloneNode(node, true);
      }
      elements.push(substituteExpression(element, paramToArg));
    }
    return t.arrayExpression(elements);
  }
  if (t.isObjectExpression(node)) {
    const properties: t.ObjectExpression["properties"] = [];
    for (const prop of node.properties) {
      if (!t.isObjectProperty(prop)) {
        return t.cloneNode(node, true);
      }
      if (prop.computed) {
        if (!t.isExpression(prop.key) || !t.isExpression(prop.value)) {
          return t.cloneNode(node, true);
        }
        properties.push(
          t.objectProperty(
            substituteExpression(prop.key, paramToArg),
            substituteExpression(prop.value, paramToArg),
            true,
          ),
        );
      } else {
        if (t.isPrivateName(prop.key) || !t.isExpression(prop.value)) {
          return t.cloneNode(node, true);
        }
        properties.push(
          t.objectProperty(
            t.cloneNode(prop.key, true),
            substituteExpression(prop.value, paramToArg),
            false,
          ),
        );
      }
    }
    return t.objectExpression(properties);
  }
  return t.cloneNode(node, true);
};

export default function (): PluginObject {
  return {
    visitor: {
      CallExpression(callPath) {
        const callee = callPath.node.callee;
        if (!t.isIdentifier(callee)) {
          return;
        }
        const binding = callPath.scope.getBinding(callee.name);
        if (!binding) {
          return;
        }
        if (!binding.path.isFunctionDeclaration()) {
          return;
        }
        if (binding.constantViolations.length !== 0) {
          return;
        }
        const funcPath = binding.path;
        if (!funcPath.isFunctionDeclaration()) {
          return;
        }
        const funcNode = funcPath.node;
        if (funcNode.id?.name !== callee.name) {
          return;
        }
        if (funcNode.async || funcNode.generator) {
          return;
        }
        const paramNodes = funcNode.params;
        const paramNames: string[] = [];
        for (const param of paramNodes) {
          if (!t.isIdentifier(param)) {
            return;
          }
          paramNames.push(param.name);
        }
        if (new Set(paramNames).size !== paramNames.length) {
          return;
        }
        const bodyStatements = funcNode.body.body;
        if (bodyStatements.length !== 1) {
          return;
        }
        const returnStatement = bodyStatements[0];
        if (!t.isReturnStatement(returnStatement)) {
          return;
        }
        const returnArgNode = returnStatement.argument;
        if (!returnArgNode || !t.isExpression(returnArgNode)) {
          return;
        }
        const callArgs = callPath.node.arguments;
        if (callArgs.length !== paramNames.length) {
          return;
        }
        const callArgExprs: t.Expression[] = [];
        for (const arg of callArgs) {
          if (!t.isExpression(arg)) {
            return;
          }
          callArgExprs.push(arg);
        }
        const paramNameSet = new Set(paramNames);
        const {
          pure,
          paramCounts,
          firstSeenOrder,
          freeNames,
          hasConditional,
          hasTypeofParam,
        } = analyzeReturnArg(returnArgNode, paramNameSet, callee.name);

        if (!pure) {
          return;
        }
        if (hasTypeofParam) {
          return;
        }

        // 呼び出し元でも同一に見える参照だけ許可
        for (const name of freeNames) {
          const funcBinding = funcPath.scope.getBinding(name);
          const callBinding = callPath.scope.getBinding(name);
          if (!funcBinding && !callBinding) {
            continue;
          }
          if (!funcBinding || !callBinding) {
            return;
          }
          if (funcBinding.path.node !== callBinding.path.node) {
            return;
          }
          if (
            funcBinding.constantViolations.length !== 0 ||
            callBinding.constantViolations.length !== 0
          ) {
            return;
          }
        }

        const argPaths = callPath.get("arguments");
        const argPathList = Array.isArray(argPaths) ? argPaths : [argPaths];
        const paramToArg = new Map<string, t.Expression>();
        paramNames.forEach((name, index) => {
          const expr = callArgExprs[index];
          if (expr) {
            paramToArg.set(name, t.cloneNode(expr, true));
          }
        });

        // 副作用のある実引数の重複評価・消失を防ぐ
        // count===0 の除去は isNoSideEffect で十分だが、
        // count>=2 の複製は RegExp リテラルの同一性を壊すため除外する。
        for (let index = 0; index < paramNames.length; index++) {
          const count = paramCounts.get(paramNames[index] ?? "") ?? 0;
          const argPath = argPathList[index];
          if (!argPath) {
            return;
          }
          if (count === 0) {
            if (!isNoSideEffect(argPath)) {
              return;
            }
          } else if (count >= 2 && !isSafeToDuplicate(argPath)) {
            return;
          }
        }

        // 条件分岐・短絡評価で取りこぼされる実引数を防ぐ:
        // 使用中の全引数は副作用なしを要求する。
        if (hasConditional) {
          for (let index = 0; index < paramNames.length; index++) {
            const paramName = paramNames[index];
            if (!paramName) {
              continue;
            }
            if ((paramCounts.get(paramName) ?? 0) > 0) {
              const argPath = argPathList[index];
              if (!argPath || !isNoSideEffect(argPath)) {
                return;
              }
            }
          }
        }

        // 評価順の変化を防ぐ: 使用順が宣言順と異なる場合は副作用引数を拒否
        const usedInDeclOrder = paramNames.filter(
          (name) => (paramCounts.get(name) ?? 0) > 0,
        );
        const orderChanged =
          firstSeenOrder.length !== usedInDeclOrder.length ||
          firstSeenOrder.some((name, index) => name !== usedInDeclOrder[index]);
        if (orderChanged) {
          for (let index = 0; index < paramNames.length; index++) {
            const paramName = paramNames[index];
            if (!paramName) {
              continue;
            }
            if ((paramCounts.get(paramName) ?? 0) > 0) {
              const argPath = argPathList[index];
              if (!argPath || !isNoSideEffect(argPath)) {
                return;
              }
            }
          }
        }

        const inlined = substituteExpression(
          t.cloneNode(returnArgNode, true),
          paramToArg,
        );
        callPath.replaceWith(inlined);
      },
    },
  };
}
