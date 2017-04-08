# foreJs

[![npm version](https://img.shields.io/npm/v/forejs.svg)](https://www.npmjs.com/package/forejs)
[![bower version](https://img.shields.io/bower/v/forejs.svg)](https://github.com/Hackbrett3X/forejs)
[![examples](https://img.shields.io/badge/examples-forejs-brightgreen.svg)](#examples)
[![documentation](https://img.shields.io/badge/documentation-v0.7.x-blue.svg)](#documentation)
[![What's new](https://img.shields.io/badge/what's%20new-v0.7.x-orange.svg)](https://github.com/Hackbrett3X/forejs/blob/master/WHATSNEW.md)


ForeJs is a lightweight but powerful module which provides rich functionality to organize asynchronous JavaScript code.
Linearize nested callback functions to simple call chains or let foreJs automatically resolve dependencies between the 
single functions and figure out the perfect execution order. Asynchronously process iterables and collect the modified 
values later again.

ForeJs uses a syntax similar to [async](https://github.com/caolan/async)'s ```waterfall``` or ```auto``` function. This
syntax is extended by additional features like flexible value injections while at the same time offering similar or even
better performance.

It is written in pure ECMAScript 5 and thus runs on older [node](https://nodejs.org) versions or the browser.
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

See below for [documentation](#documentation) and more [examples](#examples).

## Installation
```
$ npm install --save forejs
```

#### For browser usage
```
$ bower install forejs
```
Load via script-tags, [RequireJs (amd)](http://requirejs.org/) or CommonJs, e.g.:
```html
<script src="bower_components/forejs/dist/forejs.min.js"></script>
```

<a name="examples"></a>

## Examples
#### Chain mode
ForeJs provides two different run modes: "chain" and "auto". Chain mode executes the functions one by one, 
auto mode allows a more complex structure (directed acyclic graphs). The example in the [Usage](#usage) paragraph
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
  // in auto mode, dependencies are injections, too 
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

<a name="orInjections"></a>

#### Or-injections
Sometimes it is convenient to merge several execution branches into a single variable. This can be done via so called
"or-injections". Simply put all dependencies into one injection separated by "|": 
```js
fore({
  // two files, both should be objects providing an output path and the respective content:
  // e.g. {outPath: "out/file1, data: "My content"}
  file1: ...,
  file2: ...,
  // will be called twice: once for each file 
  out: ["file1|file2", (file, callback) => fs.writeFile(file.outPath, file.data, callback)]
});
```

<a name="moreSyntaxSugar"></a>

#### More syntax sugar
Occasionally you want to chain some function calls in auto mode without giving each result a separate name. You can do
this using an array:
```js
fore({
  myPath: getMyPath,
  // Read the file and call JSON.parse immediately after:
  // The array consists of a list of injections followed by any number of functions. The injections 
  // are applied to the first function.
  jsonObject: ["myPath", (myPath, callback) => fs.readFile(myPath, callback), data => JSON.parse(data)]
});
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

<a name="documentation"></a>

## Documentation
{{>main-index~}}
{{>all-docs~}}