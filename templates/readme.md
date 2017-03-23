# foreJs
ForeJs is a lightweight but powerful module which provides rich functionality to organize asynchronous JavaScript code.
Linearize nested callback functions to simple call chains or let foreJs automatically resolve dependencies between the 
single functions and figure out the perfect execution order. Asynchronously process iterables and collect the modified 
values later again.

ForeJs uses a syntax similar to [async](https://github.com/caolan/async)'s ```waterfall``` or ```auto``` function. This
syntax is extended by additional features like flexible value injections while at the same time offering similar or even
better performance.

It is written in pure ECMAScript 5 and thus runs on older [node](https://nodejs.org) versions or the browser.
Nonetheless modern features like promises, generators and ```Symbol.iterator``` are supported.
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

## Documentation
{{>main-index~}}
{{>all-docs~}}