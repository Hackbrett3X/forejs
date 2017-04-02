# foreJs
ForeJs is a lightweight but powerful module which provides rich functionality to organize asynchronous JavaScript code.
Linearize nested callback functions to simple call chains or let foreJs automatically resolve dependencies between the 
single functions and figure out the perfect execution order. Asynchronously process iterables and collect the modified 
values later again.

ForeJs uses a syntax similar to <a href="https://github.com/caolan/async">async</a>'s ```waterfall``` or ```auto``` function. This
syntax is extended by additional features like flexible value injections while at the same time offering similar or even
better performance.

It is written in pure ECMAScript 5 and thus runs on older <a href="https://nodejs.org">node</a> versions or the browser.
Nonetheless modern features like promises, generators and ```Symbol.iterator``` are supported.

<a name="usage"></a>

## Usage

```js
const fore = require("forejs");

fore({
  // provide result of "asyncFunction" as "asyncResult"
  "asyncResult": asyncFunction,
  // promises are supported, as well
  "promiseResult": promiseReturningFunction,
  // inject results of the above functions and the constant value "42" into "anotherAsyncFunction"
  "combinedResult": ["asyncResult", 42, "promiseResult", anotherAsyncFunction],
  "_": ["combinedResult", combinedResult => {
    // do something with combinedResult
  }]
});
```

See below for documentation and more examples.

## Installation
```
$ npm install --save forejs
```

## Examples
#### Chain mode
ForeJs provides two different run modes: "chain" and "auto". Chain mode executes the functions one by one, 
auto mode allows a more complex structure (directed acyclic graphs). The example in the <a href="#usage">Usage</a> paragraph
shows the auto mode, so here is a chain mode sample:
```js
fore(
    // function that produces the value 1
    one,
    (one, callback) => {
      setTimeout(() => callback(null, one + 1), 200);
    },
    // synchronous functions are supported:
    two => two + 1,
    // prints "3"
    console.log
);
```
#### Injections
Sometimes it is necessary to provide constant values to functions in addition to the values provided by previous
functions:
```js
const fs = require("fs");
const ref = fore.ref;

fore({
  file: fs.readFile.inject.args("some/file", "utf-8"),
  // in auto mode, dependencies are also injected  
  modified: modify.inject.args(ref("file")),
  // it is possible to write these as array:
  customized: ["modified", modified => {
    // customize file
  }],
  write: fs.writeFile.inject.args("out/file", ref("customized"))
});
```
It is also possible to inject values or dependencies as ```this``` argument:
```js
someFunction.inject.this(ref("myObject"));
```
#### Catching errors
Errors can be caught either directly at a single function:
```js
fore(
    raisesError.inject.catch(error => /* handle error */)
);
```
or generally:
```js
// don't forget the ".try"
fore.try(
    raisesError,
).catch(error => /* handle error */);
```
#### Multiple return values
Some functions like ```fs.read``` pass multiple values to the callback. In chain mode those are simply passed to the
subsequent function:
```js
fore(
    callback => callback(null, 1, 2, 3),
    (one, two, three, callback) => two === 2
);
```
In auto mode, those are condensed to an array (see why?):
```js
fore({
  oneTwoThree: callback => callback(null, 1, 2, 3),
  abc: callback => callback(null, "a", "b", "c"),
  _: ["oneTwoThree", "abc", (oneTwoThree, abc, callback) => oneTwoThree[1] === 2 && abc[2] === "c"]
});
```
#### Iteration
The most powerful feature of foreJs is to asynchronously process iterables:
```js
const each = fore.each;
const collect = fore.collect;
fore(
    each([1, 2, 3]), // can be an array or any form of iterable
    // call this function for any of the above values
    n => n + 1,
    // combine the results to an array again
    collect(numbers => {
      // numbers contains now (not necessarily in this order):
      // [2, 3, 4]
    })
);
```
Merge multiple iterables into one:
```js
const each = fore.each;
const reduce = fore.reduce;
fore({
  ones: each([1, 2, 3]),
  tens: each([10, 20, 30]),
  // will be called for any combination of values:
  combined: reduce(["ones", "tens", (array, ones, tens) => array.concat(ones + tens)], []),
  _: ["combined", combined => {
    // combined contains now those values (not necessarily in this order):
    // [11, 12, 13, 21, 22, 23, 31, 32, 33]
  }]
});
```

For more examples take a look at the build and test files.
## Documentation
### Classes

<dl>
<dt><a href="#Injector">Injector</a></dt>
<dd></dd>
</dl>

### Functions

<dl>
<dt><a href="#fore">fore(functions, arguments)</a></dt>
<dd><p>The main entry point. Supports two modes:</p>
<ul>
  <li>chain: In chain mode, <code>fore</code> accepts a list of functions that are executed sequentially.</li>
  <li>auto: In auto mode, <code>fore</code> accepts an object with identifiers as keys and functions as values. The
      identifiers can be referenced by other functions to retrieve its &quot;return value&quot; (see <a href="#inject">inject</a> and
      <a href="#fore.ref">ref</a>). ForeJs now figures out the perfect execution order and runs as much code in parallel as
      possible.</li>
</ul>

<p>The functions passed may have one of the following forms:</p>
<ul>
  <li>Node-style asynchronous function: Accepts a number of arbitrary arguments followed by an error-first callback
      function. The function must call this callback with either a non-null first argument to signal an error or
      with null as first argument followed by any number of &quot;return values&quot;.
      In chain mode those &quot;return values&quot; are directly passed to the next function.
      In auto mode those values are passed to all dependent functions. If more than one value is passed to the
      callback, those values are passed as array to the dependents. Additionally all arguments but the last
      (callback) must be eliminated by injections (<a href="#inject">inject</a>).</li>
  <li>Synchronous function: Sometimes you want to mix synchronous functions into asynchronous code. This is perfectly
      ok: Simply put a plain <code>return</code> statement and ignore the callback. If you want to return
      <code>undefined</code> on purpose you will need to invoke the callback, however.</li>
  <li>Promise: Promises are supported, as well. Plain promises must be in a root position.</li>
  <li>Promise returning function: A function may as well return a promise instead of invoking the callback.
      Unfortunately the function will still get passed a callback as last argument. If your function cannot cope
      with the extra argument, simply wrap it with another function.</li>
  <li>Array: As shown in <a href="Injector.prototype.args">Injector.prototype.args</a> injections can be syntactically sugared. If you are looking
      for a way to iterate over arrays see <a href="#fore.each">each</a>.</li>
  <li>Instances of <a href="#Injector">Injector</a>: An Injector is simply the wrapping type of injected functions.</li>
</ul></dd>
<dt><a href="#inject">inject()</a> ⇒ <code><a href="#Injector">Injector</a></code></dt>
<dd><p>Starts the injection of values or dependencies into this function. Should be followed by one of the <a href="#Injector">Injector</a>
methods. Use <code>inject</code> to avoid function wrappers or things like <a href="Function.prototype.bind">Function.prototype.bind</a>.</p>
</dd>
</dl>

<a name="Injector"></a>

### Injector
**Kind**: global class  

* <a href="#Injector">Injector</a>
    * <a href="#Injector+args">.args(arguments)</a> ⇒ <code><a href="#Injector">Injector</a></code>
    * <a href="#Injector+this">.this(object)</a> ⇒ <code><a href="#Injector">Injector</a></code>
    * <a href="#Injector+catch">.catch(errorHandler)</a> ⇒ <code><a href="#Injector">Injector</a></code>

<a name="Injector+args"></a>

#### injector.args(arguments) ⇒ <code><a href="#Injector">Injector</a></code>
Injects constant values or dependencies into this function starting from the left. Use <a href="#fore.ref">ref</a> to inject

**Kind**: instance method of <code><a href="#Injector">Injector</a></code>  
**Chainable**  
**Returns**: <code><a href="#Injector">Injector</a></code> - <code>this</code>.  

| Param | Type | Description |
| --- | --- | --- |
| arguments | <code>Injection</code> &#124; <code>\*</code> | The list of injections. |

**Example**  
```js
((arg1, arg2) => ...).inject.args(fore.ref("arg1"), fore.ref("arg2"))
```
<a name="Injector+this"></a>

#### injector.this(object) ⇒ <code><a href="#Injector">Injector</a></code>
Injects a constant value or dependency as <code>this</code> argument. Use <a href="#fore.ref">ref</a> to inject dependencies in

**Kind**: instance method of <code><a href="#Injector">Injector</a></code>  
**Chainable**  
**Returns**: <code><a href="#Injector">Injector</a></code> - <code>this</code>  

| Param | Type | Description |
| --- | --- | --- |
| object | <code>Injection</code> &#124; <code>Object</code> | The injection. |

<a name="Injector+catch"></a>

#### injector.catch(errorHandler) ⇒ <code><a href="#Injector">Injector</a></code>
Attaches an error handler to this function that will be called if the function invokes its callback with a non-null

**Kind**: instance method of <code><a href="#Injector">Injector</a></code>  
**Chainable**  
**Returns**: <code><a href="#Injector">Injector</a></code> - <code>this</code>  

| Param | Type | Description |
| --- | --- | --- |
| errorHandler | <code>function</code> | The error handler, a function which accepts one argument. |

<a name="fore"></a>

### fore(functions, arguments)
The main entry point. Supports two modes:

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| functions | <code>Object.&lt;String, (function()\|Array\|Injector\|Promise)&gt;</code> | For auto mode: an object hash with ids as keys and functions as values. |
| arguments | <code>function</code> &#124; <code>Array</code> &#124; <code><a href="#Injector">Injector</a></code> &#124; <code>Promise</code> | For chain mode: a list of functions. |

**Example**  
```js
// chain mode:
```

* <a href="#fore">fore(functions, arguments)</a>
    * <a href="#fore.try">.try()</a> ⇒ <code>Object</code>
    * <a href="#fore.each">.each(iterable)</a> ⇒ <code><a href="#Injector">Injector</a></code>
    * <a href="#fore.collect">.collect(fn)</a> ⇒ <code><a href="#Injector">Injector</a></code>
    * <a href="#fore.reduce">.reduce(fn, initialValue)</a> ⇒ <code><a href="#Injector">Injector</a></code>
    * <a href="#fore.ref">.ref(id)</a>

<a name="fore.try"></a>

#### fore.try() ⇒ <code>Object</code>
Wraps <a href="#fore">fore</a> with a try-catch mechanism, which registers a general error handler for all provided functions.

**Kind**: static method of <code><a href="#fore">fore</a></code>  
**Returns**: <code>Object</code> - An object with a single function <code>catch</code> to pass the error handler to.  
**Example**  
```js
fore.try(
```
<a name="fore.each"></a>

#### fore.each(iterable) ⇒ <code><a href="#Injector">Injector</a></code>
Successively returns all values the iterable provides. Values will be processed in parallel.

**Kind**: static method of <code><a href="#fore">fore</a></code>  
**Returns**: <code><a href="#Injector">Injector</a></code> - An injector which can be used to inject arguments to the iterable in case it is a generator
**See**

- fore.collect
- fore.reduce


| Param | Type | Description |
| --- | --- | --- |
| iterable | <code>Array</code> &#124; <code>Iterator</code> &#124; <code>Iterable</code> &#124; <code>function</code> &#124; <code><a href="#Injector">Injector</a></code> | One of the following:  <ul>   <li>An array of arbitrary values. Use to run a sequence of functions for multiple values.</li>   <li>An Iterator, i.e. an object providing a <code>next</code> function which itself returns objects in the shape of       <code>{value: value&#124;undefined, done: true&#124;false&#124;undefined}</code>.</li>   <li>An Iterable, i.e. an object providing a <code>Symbol.iterator</code> to retrieve an Iterator like above.</li>   <li>A generator function: A function which returns an Iterator (like ES6 <code>function*</code>s do}. If this function       takes arguments make sure to take care of the respective injections.</li>  </ul>  The cases 1 - 3 require <code>fore.each</code> to be in a root position (they don't depend on other functions).  The last case is allowed in any position.  Any iterable type may also provide promises as values in order to asynchronously generate values.  Values generated by <code>fore.each</code> will be propagated through subsequent functions causing them to be called  multiple times. If a function has several dependencies (in auto mode) that originate in a <code>fore.each</code>,  it will be invoked with any possible combinations of the incoming values. |

<a name="fore.collect"></a>

#### fore.collect(fn) ⇒ <code><a href="#Injector">Injector</a></code>
The counterpart to <a href="#fore.each">each</a>. Collects all values that were generated by <a href="#fore.each">each</a> and modified by

**Kind**: static method of <code><a href="#fore">fore</a></code>  
**Returns**: <code><a href="#Injector">Injector</a></code> - An injector which can be used to inject arguments to the function.  
**See**: fore.reduce  

| Param | Type |
| --- | --- |
| fn | <code>function</code> &#124; <code><a href="#Injector">Injector</a></code> &#124; <code>Array.&lt;\*&gt;</code> | 

<a name="fore.reduce"></a>

#### fore.reduce(fn, initialValue) ⇒ <code><a href="#Injector">Injector</a></code>
Another counterpart to <a href="#fore.each">each</a>. Behaves much like <a href="#fore.collect">collect</a> but provides the results not as array

**Kind**: static method of <code><a href="#fore">fore</a></code>  
**Returns**: <code><a href="#Injector">Injector</a></code> - An injector which can be used to inject arguments to the function.  

| Param | Type | Description |
| --- | --- | --- |
| fn | <code>function</code> &#124; <code><a href="#Injector">Injector</a></code> &#124; <code>Array.&lt;\*&gt;</code> | The function which will be invoked with   <code>(accumulator, value, ..., callback)</code> |
| initialValue | <code>\*</code> | The value for the accumulator during the first invocation. |

**Example**  
```js
fore(
```
<a name="fore.ref"></a>

#### fore.ref(id)
References the result of another function when using auto mode. To be used within <a href="Injector.prototype.args">Injector.prototype.args</a> or

**Kind**: static method of <code><a href="#fore">fore</a></code>  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>String</code> | The id to reference. |

<a name="inject"></a>

### inject() ⇒ <code><a href="#Injector">Injector</a></code>
Starts the injection of values or dependencies into this function. Should be followed by one of the <a href="#Injector">Injector</a>

**Kind**: global function  
**Returns**: <code><a href="#Injector">Injector</a></code> - The injector.  


## License

Copyright (c) 2017 Lukas Hollaender

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.