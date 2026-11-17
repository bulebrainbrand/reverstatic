import { type NodePath, type PluginObject, type PluginPass } from "@babel/core";
import type { Binding } from "@babel/traverse";
import * as t from "@babel/types";
import { Result } from "@praha/byethrow";
import { decodeBase91, isBase91Alphabet } from "../../utils/base91";
import { isAfter } from "../../utils/isAfter";
import { isWriteTarget } from "../../utils/isWriteTarget";

// base91 で難読化された文字列を、デコード済みの文字列リテラルへ置き換える。
//
//   (function (_0) { /* base91 decoder */ })("encoded")
//     -> "decoded"
//
//   vC = ["encoded"];
//   function Kq(_0) {
//     return typeof Gq[_0] === "undefined"
//       ? (Gq[_0] = decoder(vC[_0]))
//       : Gq[_0];
//   }
//   Kq(0)
//     -> "decoded"
//
// 変換後もデコーダや文字列配列は削除せず、役割が分かる名前に変更する。
//   nq -> __base91_decode_nq__
//   Kq -> __base91_wrapper_Kq__
//   vC -> __base91_array_vC__
//   Gq -> __base91_cache_Gq__

type RenameKind = "decode" | "wrapper" | "array" | "cache" | "utf8";

type DecoderInfo = { alphabet: string };

type ResolvedFunction = { path: NodePath<t.Function>; binding?: Binding };

type StringArrayInfo = {
  binding: Binding;
  elements: string[];
  initPath: NodePath;
};

type WrapperAnalysis = {
  alphabet: string;
  elements: string[];
  arrayInitPath: NodePath;
  cacheInitPath?: NodePath;
};

type PluginState = PluginPass & {
  base91Renames?: Map<Binding, string>;
  base91DecoderCache?: WeakMap<t.Function, DecoderInfo | null>;
  base91WrapperCache?: WeakMap<t.Function, WrapperAnalysis | null>;
};

const getRenames = (state: PluginState): Map<Binding, string> => {
  state.base91Renames ??= new Map();
  return state.base91Renames;
};

const getDecoderCache = (
  state: PluginState,
): WeakMap<t.Function, DecoderInfo | null> => {
  state.base91DecoderCache ??= new WeakMap();
  return state.base91DecoderCache;
};

const getWrapperCache = (
  state: PluginState,
): WeakMap<t.Function, WrapperAnalysis | null> => {
  state.base91WrapperCache ??= new WeakMap();
  return state.base91WrapperCache;
};

const rememberRename = (
  state: PluginState,
  binding: Binding | undefined,
  kind: RenameKind,
): void => {
  if (!binding) return;

  const renames = getRenames(state);
  if (renames.has(binding)) return;

  const oldName = binding.identifier.name;
  if (oldName.startsWith("__base91_")) return;

  const newName = `__base91_${kind}_${oldName}__`;
  if (binding.scope.hasBinding(newName) || binding.scope.hasGlobal(newName)) {
    return;
  }

  renames.set(binding, newName);
};

const applyRenames = (state: PluginState): void => {
  const renames = state.base91Renames;
  if (!renames) return;

  for (const [binding, newName] of renames) {
    const oldName = binding.identifier.name;
    if (oldName === newName) continue;
    if (oldName.startsWith("__base91_")) continue;
    if (binding.scope.hasBinding(newName) || binding.scope.hasGlobal(newName)) {
      continue;
    }
    binding.scope.rename(oldName, newName);
  }
};

const getMemberName = (member: t.MemberExpression): string | undefined => {
  if (!member.computed) {
    return t.isIdentifier(member.property) ? member.property.name : undefined;
  }
  return t.isStringLiteral(member.property) ? member.property.value : undefined;
};

const resolveFunction = (
  calleePath: NodePath,
): ResolvedFunction | undefined => {
  if (
    calleePath.isFunctionExpression() ||
    calleePath.isArrowFunctionExpression()
  ) {
    return { path: calleePath };
  }
  if (!calleePath.isIdentifier()) return undefined;

  const binding = calleePath.scope.getBinding(calleePath.node.name);
  if (!binding || binding.constantViolations.length !== 0) return undefined;

  if (binding.path.isFunctionDeclaration()) {
    return { path: binding.path, binding };
  }

  if (binding.path.isVariableDeclarator()) {
    const initPath = binding.path.get("init");
    if (Array.isArray(initPath)) return undefined;
    if (
      initPath.isFunctionExpression() ||
      initPath.isArrowFunctionExpression()
    ) {
      return { path: initPath, binding };
    }
  }

  return undefined;
};

const isDirectlyInitialized = (initPath: NodePath): boolean => {
  let statementPath: NodePath | null = null;

  if (initPath.isVariableDeclarator()) {
    statementPath = initPath.parentPath;
  } else if (initPath.isAssignmentExpression()) {
    const expressionStatementPath = initPath.parentPath;
    if (!expressionStatementPath?.isExpressionStatement()) return false;
    statementPath = expressionStatementPath;
  } else {
    return false;
  }

  const container = statementPath?.parentPath;
  if (!container) return false;
  if (container.isProgram()) return true;
  if (!container.isBlockStatement()) return false;

  const functionPath = container.parentPath;
  return (
    functionPath?.isFunction() === true &&
    functionPath.node.body === container.node
  );
};

const resolveArrayInitializer = (
  binding: Binding,
): { array: t.ArrayExpression; path: NodePath } | undefined => {
  if (!binding.path.isVariableDeclarator()) return undefined;

  const idPath = binding.path.get("id");
  if (
    Array.isArray(idPath) ||
    !idPath.isIdentifier({ name: binding.identifier.name })
  ) {
    return undefined;
  }

  const initPath = binding.path.get("init");
  if (!Array.isArray(initPath) && initPath.isArrayExpression()) {
    if (binding.constantViolations.length !== 0) return undefined;
    return { array: initPath.node, path: binding.path };
  }

  if (binding.constantViolations.length !== 1) return undefined;
  const violation = binding.constantViolations[0];
  if (!violation.isAssignmentExpression({ operator: "=" })) return undefined;

  const { left, right } = violation.node;
  if (!t.isIdentifier(left, { name: binding.identifier.name })) {
    return undefined;
  }
  if (!t.isArrayExpression(right)) return undefined;

  return { array: right, path: violation };
};

const resolveObjectInitializer = (
  binding: Binding,
): { object: t.ObjectExpression; path: NodePath } | undefined => {
  if (!binding.path.isVariableDeclarator()) return undefined;

  const idPath = binding.path.get("id");
  if (
    Array.isArray(idPath) ||
    !idPath.isIdentifier({ name: binding.identifier.name })
  ) {
    return undefined;
  }

  const initPath = binding.path.get("init");
  if (!Array.isArray(initPath) && initPath.isObjectExpression()) {
    if (binding.constantViolations.length !== 0) return undefined;
    return { object: initPath.node, path: binding.path };
  }

  if (binding.constantViolations.length !== 1) return undefined;
  const violation = binding.constantViolations[0];
  if (!violation.isAssignmentExpression({ operator: "=" })) return undefined;

  const { left, right } = violation.node;
  if (!t.isIdentifier(left, { name: binding.identifier.name })) {
    return undefined;
  }
  if (!t.isObjectExpression(right)) return undefined;

  return { object: right, path: violation };
};

const isReadOnlyArrayBinding = (binding: Binding): boolean => {
  for (const reference of binding.referencePaths) {
    const memberPath = reference.parentPath;
    if (!memberPath?.isMemberExpression()) return false;
    if (memberPath.node.object !== reference.node) return false;
    if (!memberPath.node.computed) return false;
    if (isWriteTarget(memberPath)) return false;

    const parentPath = memberPath.parentPath;
    if (
      parentPath?.isCallExpression() &&
      parentPath.node.callee === memberPath.node
    ) {
      return false;
    }
  }
  return true;
};

const getStringArrayInfo = (
  memberPath: NodePath<t.MemberExpression>,
): StringArrayInfo | undefined => {
  if (!memberPath.node.computed) return undefined;

  const object = memberPath.node.object;
  if (!t.isIdentifier(object)) return undefined;

  const binding = memberPath.scope.getBinding(object.name);
  if (!binding) return undefined;

  const initializer = resolveArrayInitializer(binding);
  if (!initializer) return undefined;
  if (!isDirectlyInitialized(initializer.path)) return undefined;
  if (!isReadOnlyArrayBinding(binding)) return undefined;

  const elements: string[] = [];
  for (const element of initializer.array.elements) {
    if (!t.isStringLiteral(element)) return undefined;
    elements.push(element.value);
  }

  return { binding, elements, initPath: initializer.path };
};

const isSafeCacheBinding = (binding: Binding): boolean => {
  for (const reference of binding.referencePaths) {
    const memberPath = reference.parentPath;
    if (!memberPath?.isMemberExpression()) return false;
    if (memberPath.node.object !== reference.node) return false;
  }
  return true;
};

const getConstantString = (path: NodePath): string | undefined => {
  if (path.isStringLiteral()) return path.node.value;
  if (path.isTemplateLiteral()) {
    if (path.node.expressions.length !== 0) return undefined;
    return path.node.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
};

const getConstantIndex = (path: NodePath): number | undefined => {
  let value: number | undefined;

  if (path.isNumericLiteral()) {
    value = path.node.value;
  } else if (path.isStringLiteral()) {
    // `array["01"]` は index 1 ではなく "01" プロパティなので、
    // 数値として解釈しても同じキーになる表記だけを受け付ける。
    const text = path.node.value;
    if (text === "") return undefined;
    value = Number(text);
    if (String(value) !== text) return undefined;
  } else if (path.isUnaryExpression()) {
    const argument = path.node.argument;
    if (!t.isNumericLiteral(argument)) return undefined;
    if (path.node.operator === "+") value = argument.value;
    if (path.node.operator === "-") value = -argument.value;
  }

  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0) return undefined;
  return value;
};

const resolveEncodedString = (
  path: NodePath,
  state: PluginState,
  usePath: NodePath,
): string | undefined => {
  const constant = getConstantString(path);
  if (constant !== undefined) return constant;

  if (!path.isMemberExpression()) return undefined;
  const info = getStringArrayInfo(path);
  if (!info) return undefined;
  if (!isAfter(info.initPath, usePath)) return undefined;

  const propertyPath = path.get("property");
  if (Array.isArray(propertyPath)) return undefined;
  const index = getConstantIndex(propertyPath);
  if (index === undefined) return undefined;

  const encoded = info.elements[index];
  if (encoded === undefined) return undefined;

  rememberRename(state, info.binding, "array");
  return encoded;
};

const getReturnedExpression = (
  fnPath: NodePath<t.Function>,
): NodePath<t.Expression> | undefined => {
  const bodyPath = fnPath.get("body");
  if (Array.isArray(bodyPath) || !bodyPath.isBlockStatement()) {
    return undefined;
  }
  if (bodyPath.node.body.length !== 1) return undefined;

  const statementPath = bodyPath.get("body.0");
  if (!statementPath.isReturnStatement()) return undefined;

  const argumentPath = statementPath.get("argument");
  if (Array.isArray(argumentPath) || !argumentPath.isExpression()) {
    return undefined;
  }
  return argumentPath;
};

const getCacheObjectName = (
  node: t.Node | null | undefined,
  paramName: string,
): string | undefined => {
  if (!node || !t.isMemberExpression(node) || !node.computed) {
    return undefined;
  }
  if (!t.isIdentifier(node.object)) return undefined;
  if (!t.isIdentifier(node.property, { name: paramName })) {
    return undefined;
  }
  return node.object.name;
};

const matchCacheConditional = (
  expressionPath: NodePath<t.ConditionalExpression>,
  paramName: string,
):
  | { cacheName: string; decodePath: NodePath<t.CallExpression> }
  | undefined => {
  const { test, consequent, alternate } = expressionPath.node;

  if (!t.isBinaryExpression(test, { operator: "===" })) return undefined;
  if (!t.isUnaryExpression(test.left, { operator: "typeof" })) {
    return undefined;
  }
  if (!t.isStringLiteral(test.right, { value: "undefined" })) {
    return undefined;
  }

  const cacheName = getCacheObjectName(test.left.argument, paramName);
  if (cacheName === undefined) return undefined;

  if (!t.isAssignmentExpression(consequent, { operator: "=" })) {
    return undefined;
  }
  if (getCacheObjectName(consequent.left, paramName) !== cacheName) {
    return undefined;
  }
  if (getCacheObjectName(alternate, paramName) !== cacheName) {
    return undefined;
  }

  const consequentPath = expressionPath.get("consequent");
  if (!consequentPath.isAssignmentExpression({ operator: "=" })) {
    return undefined;
  }
  const decodePath = consequentPath.get("right");
  if (!decodePath.isCallExpression()) return undefined;

  return { cacheName, decodePath };
};

const analyzeDecoderUncached = (
  fnPath: NodePath<t.Function>,
  state: PluginState,
): DecoderInfo | undefined => {
  const params = fnPath.node.params;
  if (params.length !== 1 || !t.isIdentifier(params[0])) return undefined;
  if (fnPath.node.async || fnPath.node.generator) return undefined;

  const candidates: { name: string; value: string; path: NodePath }[] = [];
  const numericLiterals = new Set<number>();
  const outputBindings = new Set<Binding>();

  fnPath.traverse({
    Function(innerPath) {
      if (innerPath.node !== fnPath.node) {
        innerPath.skip();
      }
    },
    VariableDeclarator(innerPath) {
      const initPath = innerPath.get("init");
      if (Array.isArray(initPath) || !initPath.isStringLiteral()) return;
      if (!isBase91Alphabet(initPath.node.value)) return;

      const idPath = innerPath.get("id");
      if (Array.isArray(idPath) || !idPath.isIdentifier()) return;

      candidates.push({
        name: idPath.node.name,
        value: initPath.node.value,
        path: innerPath,
      });
    },
    NumericLiteral(innerPath) {
      numericLiterals.add(innerPath.node.value);
    },
    ReturnStatement(innerPath) {
      const argument = innerPath.node.argument;
      if (!t.isCallExpression(argument)) return;
      if (!t.isIdentifier(argument.callee)) return;

      const binding = innerPath.scope.getBinding(argument.callee.name);
      if (binding) outputBindings.add(binding);
    },
  });

  for (const required of [91, 8191, 88, 13, 14]) {
    if (!numericLiterals.has(required)) return undefined;
  }

  let alphabet: string | undefined;
  for (const candidate of candidates) {
    const binding = candidate.path.scope.getBinding(candidate.name);
    if (!binding || binding.path.node !== candidate.path.node) continue;

    const hasIndexOf = binding.referencePaths.some((reference) => {
      const parentPath = reference.parentPath;
      if (!parentPath?.isMemberExpression()) return false;
      if (parentPath.node.object !== reference.node) return false;
      return getMemberName(parentPath.node) === "indexOf";
    });
    if (!hasIndexOf) continue;

    if (alphabet !== undefined) return undefined;
    alphabet = candidate.value;
  }

  if (alphabet === undefined) return undefined;

  if (outputBindings.size === 1) {
    const outputBinding = [...outputBindings][0];
    rememberRename(state, outputBinding, "utf8");
  }

  return { alphabet };
};

const analyzeDecoder = (
  fnPath: NodePath<t.Function>,
  state: PluginState,
): DecoderInfo | undefined => {
  const cache = getDecoderCache(state);
  if (cache.has(fnPath.node)) {
    return cache.get(fnPath.node) ?? undefined;
  }

  const info = analyzeDecoderUncached(fnPath, state);
  cache.set(fnPath.node, info ?? null);
  return info;
};

const analyzeWrapperUncached = (
  fnPath: NodePath<t.Function>,
  state: PluginState,
): WrapperAnalysis | undefined => {
  const params = fnPath.node.params;
  if (params.length !== 1 || !t.isIdentifier(params[0])) return undefined;
  if (fnPath.node.async || fnPath.node.generator) return undefined;

  const paramName = params[0].name;
  const returnPath = getReturnedExpression(fnPath);
  if (!returnPath) return undefined;

  let decodePath: NodePath<t.CallExpression> | undefined;
  let cacheName: string | undefined;

  if (returnPath.isConditionalExpression()) {
    const match = matchCacheConditional(returnPath, paramName);
    if (!match) return undefined;
    decodePath = match.decodePath;
    cacheName = match.cacheName;
  } else if (returnPath.isCallExpression()) {
    decodePath = returnPath;
  } else {
    return undefined;
  }

  if (decodePath.node.arguments.length !== 1) return undefined;

  const argumentPath = decodePath.get("arguments.0");
  if (Array.isArray(argumentPath) || !argumentPath.isMemberExpression()) {
    return undefined;
  }
  if (!argumentPath.node.computed) return undefined;
  if (!t.isIdentifier(argumentPath.node.property, { name: paramName })) {
    return undefined;
  }

  const arrayInfo = getStringArrayInfo(argumentPath);
  if (!arrayInfo) return undefined;

  const calleePath = decodePath.get("callee");
  if (Array.isArray(calleePath)) return undefined;
  const decoder = resolveFunction(calleePath);
  if (!decoder) return undefined;

  const decoderInfo = analyzeDecoder(decoder.path, state);
  if (!decoderInfo) return undefined;

  rememberRename(state, decoder.binding, "decode");
  rememberRename(state, arrayInfo.binding, "array");

  let cacheInitPath: NodePath | undefined;
  if (cacheName !== undefined) {
    const cacheBinding = fnPath.scope.getBinding(cacheName);
    if (!cacheBinding) return undefined;

    const initializer = resolveObjectInitializer(cacheBinding);
    if (!initializer) return undefined;
    if (!isDirectlyInitialized(initializer.path)) return undefined;
    if (!isSafeCacheBinding(cacheBinding)) return undefined;

    rememberRename(state, cacheBinding, "cache");
    cacheInitPath = initializer.path;
  }

  return {
    alphabet: decoderInfo.alphabet,
    elements: arrayInfo.elements,
    arrayInitPath: arrayInfo.initPath,
    cacheInitPath,
  };
};

const analyzeWrapper = (
  fnPath: NodePath<t.Function>,
  state: PluginState,
): WrapperAnalysis | undefined => {
  const cache = getWrapperCache(state);
  if (cache.has(fnPath.node)) {
    return cache.get(fnPath.node) ?? undefined;
  }

  const analysis = analyzeWrapperUncached(fnPath, state);
  cache.set(fnPath.node, analysis ?? null);
  return analysis;
};

const foldDirectDecoder = (
  callPath: NodePath<t.CallExpression>,
  state: PluginState,
): boolean => {
  if (callPath.node.arguments.length !== 1) return false;

  const calleePath = callPath.get("callee");
  if (Array.isArray(calleePath)) return false;
  const resolved = resolveFunction(calleePath);
  if (!resolved) return false;

  const decoderInfo = analyzeDecoder(resolved.path, state);
  if (!decoderInfo) return false;

  const argumentPath = callPath.get("arguments.0");
  if (Array.isArray(argumentPath)) return false;
  const encoded = resolveEncodedString(argumentPath, state, callPath);
  if (encoded === undefined) return false;

  const decoded = decodeBase91(encoded, decoderInfo.alphabet);
  if (Result.isFailure(decoded)) return false;

  rememberRename(state, resolved.binding, "decode");
  callPath.replaceWith(t.stringLiteral(Result.unwrap(decoded)));
  return true;
};

const foldWrapperCall = (
  callPath: NodePath<t.CallExpression>,
  state: PluginState,
): boolean => {
  if (callPath.node.arguments.length !== 1) return false;

  const calleePath = callPath.get("callee");
  if (Array.isArray(calleePath)) return false;
  const resolved = resolveFunction(calleePath);
  if (!resolved) return false;

  const analysis = analyzeWrapper(resolved.path, state);
  if (!analysis) return false;

  rememberRename(state, resolved.binding, "wrapper");

  const argumentPath = callPath.get("arguments.0");
  if (Array.isArray(argumentPath)) return false;
  const index = getConstantIndex(argumentPath);
  if (index === undefined) return false;

  if (!isAfter(analysis.arrayInitPath, callPath)) return false;
  if (
    analysis.cacheInitPath !== undefined &&
    !isAfter(analysis.cacheInitPath, callPath)
  ) {
    return false;
  }

  const encoded = analysis.elements[index];
  if (encoded === undefined) return false;

  const decoded = decodeBase91(encoded, analysis.alphabet);
  if (Result.isFailure(decoded)) return false;

  callPath.replaceWith(t.stringLiteral(Result.unwrap(decoded)));
  return true;
};

export default function (): PluginObject<PluginState> {
  return {
    visitor: {
      Program: {
        enter(_path, state) {
          state.base91Renames = new Map();
          state.base91DecoderCache = new WeakMap();
          state.base91WrapperCache = new WeakMap();
        },
        exit(_path, state) {
          applyRenames(state);
        },
      },
      CallExpression(path, state) {
        if (foldDirectDecoder(path, state)) return;
        foldWrapperCall(path, state);
      },
    },
  };
}
