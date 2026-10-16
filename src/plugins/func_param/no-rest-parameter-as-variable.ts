import { type NodePath, type PluginObject } from "@babel/core";
import * as t from "@babel/types";

// 残余引数(...rest)を連想配列代わりに使い回す難読化パターンを、
// 通常のローカル変数(let)に直す。
// 例: function f(...r) { r["a"] = 1; return r["a"]; }
//  -> function f(...r) { let a; a = 1; return a; }

// 予約語 + strict mode で let 宣言できない名前
const FORBIDDEN_NAMES = new Set([
  "arguments",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "eval",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

// 変数化すると Array.prototype メソッド呼び出しと衝突しうるキー。
// r.slice のような「配列全体の観測」は数値キー抽出と意味が変わるため一律bailする。
// (r[-185].push のような値に対する呼び出しは対象外で安全)
const ARRAY_OBSERVER_METHODS = new Set([
  "at",
  "concat",
  "copyWithin",
  "entries",
  "every",
  "fill",
  "filter",
  "find",
  "findIndex",
  "flat",
  "flatMap",
  "forEach",
  "hasOwnProperty",
  "includes",
  "indexOf",
  "isPrototypeOf",
  "join",
  "keys",
  "lastIndexOf",
  "map",
  "pop",
  "propertyIsEnumerable",
  "push",
  "reduce",
  "reduceRight",
  "reverse",
  "shift",
  "slice",
  "some",
  "sort",
  "splice",
  "toLocaleString",
  "toReversed",
  "toSorted",
  "toSpliced",
  "toString",
  "unshift",
  "valueOf",
  "values",
  "with",
]);

// プロトタイプ汚染の恐れがあるキーは扱わない
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const isValidIdentifierName = (name: string): boolean => {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
    return false;
  }
  return !FORBIDDEN_NAMES.has(name);
};

// 任意のキー文字列から有効な識別子名を作る
const sanitizeBase = (key: string): string => {
  if (isValidIdentifierName(key)) {
    return key;
  }
  const prefixed = key.startsWith("-") ? `_neg${key.slice(1)}` : `_${key}`;
  const sanitized = prefixed.replace(/[^A-Za-z0-9_$]/g, "_");
  const named = /^[0-9]/.test(sanitized) ? `_${sanitized}` : sanitized;
  if (named === "" || named === "_" || FORBIDDEN_NAMES.has(named)) {
    return `_${named}`;
  }
  return named;
};

type MemberKey =
  | { kind: "key"; key: string }
  | { kind: "length" }
  | { kind: "dynamic" };

// rest[...] / rest.foo のプロパティを静的キーに正規化する。
// 変数等の動的キーは解決できないため dynamic を返す。
const getMemberKey = (member: t.MemberExpression): MemberKey => {
  if (!member.computed) {
    const property = member.property;
    if (!t.isIdentifier(property)) {
      return { kind: "dynamic" };
    }
    if (property.name === "length") {
      return { kind: "length" };
    }
    return { kind: "key", key: property.name };
  }
  const property = member.property;
  if (t.isStringLiteral(property)) {
    if (property.value === "length") {
      return { kind: "length" };
    }
    return { kind: "key", key: property.value };
  }
  if (t.isNumericLiteral(property)) {
    return { kind: "key", key: String(property.value) };
  }
  if (
    t.isUnaryExpression(property, { operator: "-" }) &&
    t.isNumericLiteral(property.argument)
  ) {
    const value = property.argument.value;
    // r[-0] と r[0] は同一インデックス
    return { kind: "key", key: value === 0 ? "0" : `-${String(value)}` };
  }
  return { kind: "dynamic" };
};

const isNonNegativeIntegerKey = (key: string): boolean => {
  if (!/^(0|[1-9][0-9]*)$/.test(key)) {
    return false;
  }
  return Number(key) < 4294967295;
};

type Access = {
  memberPath: NodePath<t.MemberExpression>;
  key: string;
  isWrite: boolean;
};

export default function (): PluginObject {
  return {
    visitor: {
      Function(funcPath) {
        const params = funcPath.node.params;
        if (params.length === 0) {
          return;
        }
        const last = params[params.length - 1];
        if (!t.isRestElement(last) || !t.isIdentifier(last.argument)) {
          return;
        }
        const restName = last.argument.name;

        const bodyPath = funcPath.get("body");
        if (Array.isArray(bodyPath) || !bodyPath.isBlockStatement()) {
          // アロー式の式ボディ等: let を挿入できない
          return;
        }

        const binding = funcPath.scope.getBinding(restName);
        if (!binding) {
          return;
        }
        // rest 自体の再代入 (r = ...) があれば対象外
        if (binding.constantViolations.length !== 0) {
          return;
        }
        if (binding.referencePaths.length === 0) {
          return;
        }

        const accesses: Access[] = [];
        let hasLengthRead = false;

        for (const referencePath of binding.referencePaths) {
          const parentPath = referencePath.parentPath;
          if (!parentPath) {
            return;
          }
          // OptionalMemberExpression (r?.["a"]) は意味が変わりうるためbail
          if (parentPath.isOptionalMemberExpression()) {
            return;
          }
          if (!parentPath.isMemberExpression()) {
            // foo(r) / return r / [...r] 等: rest 自体が値として漏れている
            return;
          }
          const member = parentPath.node;
          if (member.object !== referencePath.node) {
            // x[r] のようにキー側で使われている
            return;
          }
          const memberKey = getMemberKey(member);
          if (memberKey.kind === "dynamic") {
            return;
          }
          if (memberKey.kind === "length") {
            const grandParent = parentPath.parentPath;
            if (
              grandParent?.isAssignmentExpression() &&
              grandParent.node.left === member &&
              grandParent.node.operator === "="
            ) {
              // r["length"] = 1 は Array 長切詰めの副作用なのでそのまま残す
              continue;
            }
            if (
              grandParent?.isUpdateExpression() &&
              grandParent.node.argument === member
            ) {
              return;
            }
            // r.length の読取は残すが、後で数値書込みとの併用を検査する
            hasLengthRead = true;
            continue;
          }
          const key = memberKey.key;
          if (DANGEROUS_KEYS.has(key) || ARRAY_OBSERVER_METHODS.has(key)) {
            return;
          }

          const grandParent = parentPath.parentPath;
          if (!grandParent) {
            return;
          }
          if (
            grandParent.isUnaryExpression() &&
            grandParent.node.operator === "delete" &&
            grandParent.node.argument === member
          ) {
            // delete r["a"] は変数化できない
            return;
          }
          let isWrite = false;
          if (grandParent.isAssignmentExpression()) {
            isWrite = grandParent.node.left === member;
          } else if (grandParent.isUpdateExpression()) {
            isWrite = grandParent.node.argument === member;
          } else if (grandParent.isForXStatement()) {
            isWrite = grandParent.node.left === member;
          } else if (
            grandParent.isArrayPattern() ||
            grandParent.isRestElement() ||
            grandParent.isVariableDeclarator() ||
            grandParent.isObjectProperty() ||
            grandParent.isObjectPattern() ||
            (grandParent.isAssignmentPattern() &&
              grandParent.node.left === member)
          ) {
            // 分割代入の書込み位置 ([r["a"]] = ...) 等
            isWrite = true;
          }
          accesses.push({ memberPath: parentPath, key, isWrite });
        }

        const writtenKeys: string[] = [];
        const writtenKeySet = new Set<string>();
        for (const access of accesses) {
          if (access.isWrite && !writtenKeySet.has(access.key)) {
            writtenKeySet.add(access.key);
            writtenKeys.push(access.key);
          }
        }
        if (writtenKeys.length === 0) {
          return;
        }
        // r.length 読取と数値インデックス書込みの併用は length の意味が変わる
        if (
          hasLengthRead &&
          writtenKeys.some((key) => isNonNegativeIntegerKey(key))
        ) {
          return;
        }
        // 書込みはないが実引数ではあり得ないキー（負数・文字列等）の読取は、
        // 初期値がいずれも undefined で等価なため変数化する。
        // 非負整数インデックスの純粋な読取 (実引数 r[0] 等) はそのまま残す。
        const readOnlyKeys: string[] = [];
        const readOnlyKeySet = new Set<string>();
        for (const access of accesses) {
          if (
            !writtenKeySet.has(access.key) &&
            !readOnlyKeySet.has(access.key) &&
            !isNonNegativeIntegerKey(access.key)
          ) {
            readOnlyKeySet.add(access.key);
            readOnlyKeys.push(access.key);
          }
        }
        const allKeys = [...writtenKeys, ...readOnlyKeys];

        // 衝突回避用に内側の参照名・宣言名を集める。
        // ネスト関数内で同名のグローバル参照がある場合に外側 let が捕捉するのを防ぐ。
        const taken = new Set<string>([restName]);
        funcPath.traverse({
          ReferencedIdentifier(innerPath) {
            taken.add(innerPath.node.name);
          },
        });
        for (const name of Object.keys(funcPath.scope.getAllBindings())) {
          taken.add(name);
        }

        const keyToName = new Map<string, string>();
        for (const key of allKeys) {
          const base = sanitizeBase(key);
          let name = base;
          if (
            taken.has(name) ||
            funcPath.scope.hasBinding(name) ||
            funcPath.scope.hasReference(name)
          ) {
            name = funcPath.scope.generateUidIdentifier(base).name;
            let counter = 2;
            while (taken.has(name)) {
              name = `${name}${counter}`;
              counter += 1;
            }
          }
          keyToName.set(key, name);
          taken.add(name);
        }

        const declarators = allKeys.map((key) =>
          t.variableDeclarator(t.identifier(keyToName.get(key) ?? key)),
        );
        bodyPath.unshiftContainer(
          "body",
          t.variableDeclaration("let", declarators),
        );
        for (const access of accesses) {
          const name = keyToName.get(access.key);
          if (name === undefined) {
            // 非負整数インデックスの純粋な読取 (実引数 r[0] 等) はそのまま残す
            continue;
          }
          access.memberPath.replaceWith(t.identifier(name));
        }
        funcPath.scope.crawl();
      },
    },
  };
}
