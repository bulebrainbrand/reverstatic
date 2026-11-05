## plugin

### math 畳み込み no-math-literal-call

Math.log2などを畳み込む

```js
// do
Math.log2(1);
Math.max(1, 2, 3);
// do not change
const a = 1;
Math.log2(a);
```

### 定数伝播 constant-propagation

no-constant-arrayはすでにあるが、数値などはない

```js
// before
const a = 0;
console.log(a);
// after
const __unused_a__ = 0;
console.log(0);
```

```js
// before
const a = 0,
  b = a;
console.log(b);
// after
const __unused_a__ = 0,
  __unused_b__ = __unused_a__;
console.log(0);
```

### no-atob

atobをたたむ

### no-base91-encode

base91エンコードを畳み込む

### no-json-parse

JSON.parseを畳み込む。**proto**に注意

### no-IIFE-argument

```js
((a) => {
  /* do something */
})(1);
```

は

```js
(() => {
  let a = 1;
})();
```

に置き換えられる。
たとえローカル変数だったりしても

```js
const bar = "1";
const foo = (function (baz) {
  /* do something */
})(bar);
```

は

```js
const bar = "1";
const foo = (function () {
  let baz = bar;
  /* do something */
})();
```

にできる

argumentsやcallee,分割代入、デフォルト値に注意
