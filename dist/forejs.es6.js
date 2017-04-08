/*
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
*/

/**
 * A lightweight module which provides powerful functionality to organize asynchronous JavaScript code.
 * @module foreJs
 * @version 0.7.1
 */

var symbolsSupported = typeof Symbol === "function" && typeof Symbol.iterator === "symbol";
var arrayValuesSupported = typeof Array.prototype.values === "function";

/**
 * Optimized Array#forEach
 * @template T
 * @param {T[]|Arguments} array
 * @param {function(T, number)} f
 */
function each(array, f) {
  var i = -1, length = array.length;
  while (++i < length) {
    f(array[i], i);
  }
}

/**
 * Optimized Array#map
 * @template T
 * @template S
 * @param {T[]|Arguments} array
 * @param {function(T, number): S} f
 * @return S[]
 */
function map(array, f) {
  var i = -1, length = array.length, result = new Array(length);
  while (++i < length) {
    result[i] = f(array[i], i);
  }
  return result;
}

/**
 * Optimized in-place Array#map
 * @template T
 * @template S
 * @param {T[]|Arguments} array
 * @param {function(T, number): S} f
 * @return S[]
 */
function replace(array, f) {
  var i = -1, length = array.length;
  while (++i < length) {
    array[i] = f(array[i], i);
  }
  return array;
}

/**
 * Optimized Array#every
 * @template T
 * @param {T[]|Arguments} array
 * @param {function(T, number): boolean} predicate
 * @return boolean
 */
function every(array, predicate) {
  var i = -1, length = array.length;
  while (++i < length) {
    if (!predicate(array[i], i))
    return false;
  }
  return true;
}

/**
 * Id function
 * @template T
 * @param {T} arg
 * @return {T}
 */
function id(arg) {
  return arg;
}

/**
 * @callback Callback
 * @param {*} err
 * @param {*=} res
 */

/**
 * The main entry point. Supports two modes:
 * <ul>
 *   <li>chain: In chain mode, <code>fore</code> accepts a list of functions that are executed sequentially.</li>
 *   <li>auto: In auto mode, <code>fore</code> accepts an object with identifiers as keys and functions as values. The
 *       identifiers can be referenced by other functions to retrieve its "return value" (see {@link inject} and
 *       {@link fore.ref}). ForeJs now figures out the perfect execution order and runs as much code in parallel as
 *       possible.</li>
 * </ul>
 *
 * The functions passed may have one of the following forms:
 * <ul>
 *   <li>Node-style asynchronous function: Accepts a number of arbitrary arguments followed by an error-first callback
 *       function. The function must call this callback with either a non-null first argument to signal an error or
 *       with null as first argument followed by any number of "return values".
 *       In chain mode those "return values" are directly passed to the next function.
 *       In auto mode those values are passed to all dependent functions. If more than one value is passed to the
 *       callback, those values are passed as array to the dependents. Additionally all arguments but the last
 *       (callback) must be eliminated by injections ({@link inject}).</li>
 *   <li>Synchronous function: Sometimes you want to mix synchronous functions into asynchronous code. This is perfectly
 *       ok: Simply put a plain <code>return</code> statement and ignore the callback. If you want to return
 *       <code>undefined</code> on purpose you will need to invoke the callback, however.</li>
 *   <li>Promise: Promises are supported, as well. Plain promises must be in a root position.</li>
 *   <li>Promise returning function: A function may as well return a promise instead of invoking the callback.
 *       Unfortunately the function will still get passed a callback as last argument. If your function cannot cope
 *       with the extra argument, simply wrap it with another function.</li>
 *   <li>Array: As shown in {@link Injector.prototype.args} injections can be syntactically sugared. If you are looking
 *       for a way to iterate over arrays see {@link fore.each}.</li>
 *   <li>Instances of {@link Injector}: An Injector is simply the wrapping type of injected functions.</li>
 * </ul>
 *
 * @example
 * // chain mode:
 * fore(
 *     f1,
 *     f2,
 *     ...
 * );
 * // auto mode:
 * fore({
 *   a: fa,
 *   b: fb,
 *   c: ["a", "b", fc] // the results of fa and fb are injected into fc once they are ready
 * });
 * @param {(Object.<String, function|Array|Injector|Promise>)} functions For auto mode: an object hash with ids as keys and
 * functions as values.
 * @param {...function|Array|Injector|Promise} arguments For chain mode: a list of functions.
 */
function fore(functions) {
  if (typeof functions === "object" && Object.getPrototypeOf(functions) === Object.prototype) {
    dependentExecution(functions);
  } else {
    simpleChain(arguments);
  }
}

/**
 * @param {Object.<String, function>} functions
 */
function dependentExecution(functions) {
  var ids = Object.getOwnPropertyNames(functions);

  var valuePipes = {};
  each(ids, function (id) {
    valuePipes[id] = new ValuePipe();
  });

  var rootInjectors = [];
  each(ids, function (id) {
    var hasInjections = [false];

    // create nodes
    var injector = desugar(functions[id]);
    var combinator = createCombinator(injector);
    var executor = createExecutor(injector);
    var valuePipe = valuePipes[id];

    // link them
    if (injector.injections !== null) {
      replace(injector.injections, function (injection) {
        return createValueProviderFromInjection(valuePipes, combinator, injection, hasInjections);
      });
    }

    if (injector.thisInjection !== null) {
      injector.thisInjection = createValueProviderFromInjection(valuePipes, combinator, injector.thisInjection, hasInjections);
    }

    combinator.injector = injector;
    injector.executor = executor;
    executor.valuePipe = valuePipe;

    if (!hasInjections[0]) {
      rootInjectors.push(injector);
    }
  });

  // start execution chain
  each(rootInjectors, function (injector) {
    injector.execute(true, 1);
  });
}

/**
 * @param {Object.<String, ValuePipe>} valuePipes
 * @param {AllCombinationsCombinator} combinator
 * @param {Injection} injection
 * @param {boolean[]} hasInjections
 * @return {ValueProvider}
 */
function createValueProviderFromInjection(valuePipes, combinator, injection, hasInjections) {
  var valueProvider = new ValueProvider();

  if (injection instanceof Injection) {
    hasInjections[0] = true;

    var id = injection.id;
    var valuePipe;
    if (id.indexOf("|") >= 0) {
      // "or injections" ( ref("a|b") )
      valuePipe = new DemuxValuePipe(combinator);

      var ids = id.split("|");
      valuePipe.inputPipes = map(ids, function (id) {
        var inputValuePipe = getValuePipe(valuePipes, id);
        inputValuePipe.register(valuePipe);
        return inputValuePipe;
      });
    } else {
      valuePipe = getValuePipe(valuePipes, id);
      valuePipe.register(combinator);
    }

    combinator.valuePipes.push(valuePipe);
    combinator.valueProviders.push(valueProvider);
  } else {
    valueProvider.value = injection;
  }

  return valueProvider;
}

/**
 * @param {Object.<String, ValuePipe>} valuePipes
 * @param {String} id
 * @return {ValuePipe}
 */
function getValuePipe(valuePipes, id) {
  var valuePipe = valuePipes[id];
  if (!valuePipe) {
    throw new Error("Unbound identifier '" + id + "'.");
  }
  return valuePipe;
}

/**
 * @param {*} functions
 */
function simpleChain(functions) {
  var valuePipes = map(functions, function () {
    return new ValuePipe();
  });

  var rootInjector = null;

  each(functions, function (fn, i) {
    var injector = desugar(fn);
    injector.isSimpleChain = true;
    var executor = createExecutor(injector);
    var valuePipe = valuePipes[i];

    injector.injections && replace(injector.injections, function (injection) {
      var valueProvider = new ValueProvider();
      valueProvider.value = injection;
      return valueProvider;
    });

    if (i > 0) {
      var combinator = createCombinator(injector);
      var inputValuePipe = valuePipes[i - 1];
      inputValuePipe.register(combinator);

      var injectionValueProvider;

      var thisValueProvider = new ValueProvider();
      if (injector.thisInjection === void 0) {
        // inject last result as "this" argument
        injector.thisInjection = thisValueProvider;
        injectionValueProvider = thisValueProvider;
      } else {
        // inject last result as last argument
        thisValueProvider.value = injector.thisInjection;

        injectionValueProvider = new ValueProvider();

        if (injector.injections === null) {
          injector.injections = [injectionValueProvider];
        } else {
          injector.injections.push(injectionValueProvider);
        }
      }

      combinator.valuePipes.push(inputValuePipe);
      combinator.valueProviders.push(injectionValueProvider);
      injector.thisInjection = thisValueProvider;

      combinator.injector = injector;
    } else {
      rootInjector = injector;
    }

    injector.executor = executor;
    executor.valuePipe = valuePipe;
  });

  rootInjector.execute(true, 1);
}

/**
 * Registers a general error handler.
 * @callback catch
 * @param {function(*)} errorHandler A function which accepts one argument - the error.
 */

/**
 * Wraps {@link fore} with a try-catch mechanism, which registers a general error handler for all provided functions.
 * Once any of these functions "returns" an error this error handler will be invoked and the propagation of the
 * respective execution branch will stopped.
 *
 * This error handler can be shadowed for single functions using {@link Injector.prototype.catch}.
 * @example
 * fore.try(
 *     // functions...
 * ).catch(error => ...)
 * @return {{catch: catch}} An object with a single function <code>catch</code> to pass the error handler to.
 */
fore.try = function () {
  var args = arguments;
  return {
    "catch": function (errorHandler) {
      var functions = args[0];
      if (typeof functions === "object" && Object.getPrototypeOf(functions) === Object.prototype) {
        each(Object.getOwnPropertyNames(functions), function (name) {
          functions[name] = injectErrorHandler(functions[name], errorHandler);
        });
        fore(functions);
      } else {
        fore.apply(null, map(args, function (f) {
          return injectErrorHandler(f, errorHandler);
        }));
      }
    }
  }
};

/**
 * Successively returns all values the iterable provides. Values will be processed in parallel.
 * @see fore.collect
 * @see fore.reduce
 * @param {Array|Iterator|Iterable|function|Injector} iterable One of the following:
 *  <ul>
 *   <li>An array of arbitrary values. Use to run a sequence of functions for multiple values.</li>
 *   <li>An Iterator, i.e. an object providing a <code>next</code> function which itself returns objects in the shape of
 *       <code>{value: value&#124;undefined, done: true&#124;false&#124;undefined}</code>.</li>
 *   <li>An Iterable, i.e. an object providing a <code>Symbol.iterator</code> to retrieve an Iterator like above.</li>
 *   <li>A generator function: A function which returns an Iterator (like ES6 <code>function*</code>s do}. If this function
 *       takes arguments make sure to take care of the respective injections.</li>
 *  </ul>
 *  The cases 1 - 3 require <code>fore.each</code> to be in a root position (they don't depend on other functions).
 *  The last case is allowed in any position.
 *
 *  Any iterable type may also provide promises as values in order to asynchronously generate values.
 *
 *  Values generated by <code>fore.each</code> will be propagated through subsequent functions causing them to be called
 *  multiple times. If a function has several dependencies (in auto mode) that originate in a <code>fore.each</code>,
 *  it will be invoked with any possible combinations of the incoming values.
 * @return {Injector} An injector which can be used to inject arguments to the iterable in case it is a generator
 * function (<code>function*</code>).
 */
fore.each = function foreEach(iterable) {
  var injector = (iterable instanceof Injector) ? iterable : new Injector(iterable);
  injector.mode = ExecutionMode.EACH;
  return injector;
};

/**
 * The counterpart to {@link fore.each}. Collects all values that were generated by {@link fore.each} and modified by
 * in-between functions. The results will be passed to <code>fn</code> as array. If it depends on multiple iterables
 * <code>fore.collect</code> waits for all branches to finish and each result array will passed as separate argument.
 *
 * Naturally for asynchronous code the result array will not necessarily have the same order as the input.
 * @see fore.reduce
 * @param {function|Injector|Array.<*>} fn
 * @return {Injector} An injector which can be used to inject arguments to the function.
 */
fore.collect = function (fn) {
  var injector = desugar(fn);
  injector.mode = ExecutionMode.COLLECT;
  return injector;
};

/**
 * Another counterpart to {@link fore.each}. Behaves much like {@link fore.collect} but provides the results not as array
 * but in a fashion similar to {@link Array.prototype.reduce}: <code>fn</code> will be called once for each element of
 * the result. It will get passed the accumulator followed by dependency result(s) followed by a callback. The
 * "return value" of this call will be the new accumulator for the next invocation. For the first invocation
 * the accumulation variable is <code>initialValue</code>.
 *
 * If there are more than one dependencies (and several of these originate in a {@link fore.each}) <code>fn</code> will
 * be called once for every possible combination of the incoming values.
 *
 * Likewise, no specific execution order can be guaranteed.
 * @example
 * fore(
 *     fore.each([1, 2, 3),
 *     plusOne,
 *     fore.reduce((accumulation, value, callback) => callback(null, accumulation * value), 1),
 *     console.log
 *     // result: 1 * 2 * 3 * 4 = 24
 * )
 * @param {function|Injector|Array.<*>} fn The function which will be invoked with
 *   <code>(accumulator, value, ..., callback)</code>
 * @param {*} initialValue The value for the accumulator during the first invocation.
 * @return {Injector} An injector which can be used to inject arguments to the function.
 */
fore.reduce = function (fn, initialValue) {
  var injector = desugar(fn);
  injector.mode = ExecutionMode.REDUCE;
  if (injector.injections === null) {
    injector.injections = [initialValue];
  } else {
    injector.injections.unshift(initialValue);
  }
  return injector;
};

/**
 * @param {Injector|function} injector
 * @param {function} errorHandler
 * @return {Injector}
 */
function injectErrorHandler(injector, errorHandler) {
  injector = desugar(injector);
  if (!injector.errorHandler) {
    injector.errorHandler = errorHandler;
  }
  return injector;
}

/**
 * @param {Injector|undefined} injector
 * @param {*} err
 */
function handleError(injector, err) {
  injector.errorHandler(err);
}

/**
 * @param {Array.<*>|function|Injector} fn
 * @param {Injector} fn.injector
 * @return {Injector}
 */
function desugar(fn) {
  if (Array.isArray(fn)) {
    // desugar ["a", "b", function (a, b) {...}]
    var functions = [];
    var injections = [];
    for (var i = -1, length = fn.length; ++i < length;) {
      var item = fn[i];
      if (typeof item === "function" || item instanceof Injector) {
        functions.push(item);
      } else {
        injections.push(typeof item === "string" ? fore.ref(item) : item);
      }
    }

    var theFunction;
    if (functions.length === 1) {
      theFunction = functions[0];
    } else {
       theFunction = function () {
        var lastIndex = arguments.length - 1;

        // inject values from "outer" fore into first function of "inner" fore
        var injector = new Injector(functions[0]);
        var injections = injector.injections = new Array(lastIndex);
        for (var j = -1; ++j < lastIndex;) {
          injections[j] = arguments[j];
        }
        functions[0] = injector;

        // append "outer" callback as last function
        var callback = arguments[lastIndex];
        functions.push(function (result) {
          callback(null, result);
        });
        simpleChain(functions);
      };
    }
    
    var injector = new Injector(theFunction);
    injector.injections = injections;
    return injector;
  }

  if (!(fn instanceof Injector)) {
    return new Injector(fn);
  }

  return fn;
}

/**
 * References the result of another function when using auto mode. To be used within {@link Injector.prototype.args} or
 * {@link Injector.prototype.this}
 * @param {String} id The id to reference.
 */
fore.ref = function ref(id) {
  return new Injection(id);
};

/**
 * @constructor
 * @property {Array.<*>} values
 * @property {boolean} done
 */
function ValuePipe() {
  this.values = [];
  
  this.observers = [];

  this.done = false;
  this.reachedLast = false;

  this.expectedLength = 0;
  this.failedLength = 0;
}

/**
 * @param {Combinator|DemuxValuePipe} observer
 */
ValuePipe.prototype.register = function (observer) {
  if (this.observers.indexOf(observer) < 0) {
    this.observers.push(observer);
  }
};

/**
 * @param {*} value
 * @param {boolean} done
 * @param {number} expectedLength
 */
ValuePipe.prototype.push = function (value, done, expectedLength) {
  this.values.push(value);

  this.updateDone(done, expectedLength);
  var sender = this;
  each(this.observers, function (observer) {
    observer.notify(sender);
  });
};

ValuePipe.prototype.pushFailure = function (done, expectedLength) {
  this.failedLength++;

  this.updateDone(done, expectedLength);
  var sender = this;
  each(this.observers, function (observer) {
    observer.notifyFailure(sender);
  });
};

/**
 * @param {boolean} done
 * @param {number} expectedLength
 * @private
 */
ValuePipe.prototype.updateDone = function (done, expectedLength) {
  if (done) {
    this.reachedLast = true;
  }

  this.expectedLength = Math.max(this.expectedLength, expectedLength);
  this.done = this.reachedLast && this.values.length === this.expectedLength - this.failedLength;
};

/**
 * This is neither a real {@link ValuePipe} nor a real {@link Combinator}. It de-multiplexes several ValuePipes to one
 * Combinator input.
 * @param {Combinator} combinator
 * @constructor
 */
function DemuxValuePipe(combinator) {
  this.values = [];

  this.combinator = combinator;
  this.inputPipes = null;
  this.done = false;
}

DemuxValuePipe.prototype.notify = function (sender) {
  var senderValues = sender.values;
  this.values.push(senderValues[senderValues.length - 1]);

  this.updateDone();
  this.combinator.notify(this);
};

DemuxValuePipe.prototype.notifyFailure = function (sender) {
  this.updateDone();
  this.combinator.notifyFailure(this);
};

DemuxValuePipe.prototype.updateDone = function () {
  this.done = every(this.inputPipes, function (valuePipe) { return valuePipe.done });
};

/**
 * @constructor
 * @abstract
 * @property {Injector} injector
 * @property {ValuePipe[]} valuePipes
 * @property {ValueProvider[]} valueProviders
 */
function Combinator() {
  this.injector = null;
  this.valuePipes = [];
  this.valueProviders = [];
}
/**
 * @param {ValuePipe|DemuxValuePipe} sender
 * @abstract
 */
Combinator.prototype.notify = function (sender) {
};

/**
 * @param {ValuePipe|DemuxValuePipe} sender
 */
Combinator.prototype.notifyFailure = function (sender) {
};

/**
 * @constructor
 * @extends Combinator
 */
function SimpleCombinator() {
  Combinator.call(this);
}
SimpleCombinator.prototype = Object.create(Combinator.prototype);

SimpleCombinator.prototype.notify = function (sender) {
  var valuePipe = this.valuePipes[0];
  var values = valuePipe.values;
  this.valueProviders[0].value = values[values.length - 1];
  this.injector.execute(valuePipe.done, values.length);
};

/**
 * @constructor
 * @extends Combinator
 */
function AllCombinationsCombinator() {
  Combinator.call(this);
  this.executionCounter = 0;
}
AllCombinationsCombinator.prototype = Object.create(Combinator.prototype);

AllCombinationsCombinator.prototype.notify = function (sender) {
  var valuePipes = this.valuePipes;
  var valueProviders = this.valueProviders;

  var pipesDone = true;
  var possibleCombinations = 1;
  var senderIndex = -1;

  var currentLengths = map(valuePipes, function (valuePipe, i) {
    pipesDone &= valuePipe.done;

    var length = valuePipe.values.length;
    possibleCombinations *= length;

    if (valuePipe === sender) {
      senderIndex = i;
    }

    return length;
  });

  if (this.executionCounter >= possibleCombinations) {
    // prevent double execution
    return;
  }

  this.executionCounter = possibleCombinations;

  valueProviders[senderIndex].value = valuePipes[senderIndex].values[currentLengths[senderIndex] - 1];

  var currentIndices = replace(new Array(valuePipes.length), function () {
    return 0;
  });

  var carry = false;
  while (!carry) {
    carry = true;

    // set current values and count one step
    var i = -1, length = valuePipes.length;
    while (++i < length) {
      if (i === senderIndex) {
        continue;
      }

      valueProviders[i].value = valuePipes[i].values[currentIndices[i]];

      if (carry) {
        currentIndices[i]++;
        carry = false;
        if (currentIndices[i] === currentLengths[i]) {
          currentIndices[i] = 0;
          carry = true;
        }
      }
    }

    // emit value combination
    this.injector.execute(pipesDone && carry, possibleCombinations);
  }
};

/**
 * @constructor
 * @extends Combinator
 */
function CollectorCombinator() {
  Combinator.call(this);
}
CollectorCombinator.prototype = Object.create(Combinator.prototype);

CollectorCombinator.prototype.notify = CollectorCombinator.prototype.notifyFailure = function (sender) {
  var valuePipes = this.valuePipes;
  if (!every(valuePipes, function (pipe) { return pipe.done })) {
    return;
  }

  var valueProviders = this.valueProviders;
  each(valuePipes, function (valuePipe, i) {
    valueProviders[i].value = map(valuePipe.values, id);
  });

  this.injector.execute(true, 1);
};

/**
 * @param {Injector} injector
 * @return {*}
 */
function createCombinator(injector) {
  if (injector.mode === ExecutionMode.COLLECT) {
    return new CollectorCombinator();
  } else if (injector.injections === null
      || (injector.injections.length <= 1 && injector.thisInjection === null)
      || (injector.thisInjection !== null && (injector.injections === null || injector.injections.length === 0))) {
    return new SimpleCombinator();
  }
  return new AllCombinationsCombinator();
}

/**
 * @constructor
 * @property {*} value
 */
function ValueProvider() {
  this.value = null;
}

/**
 * @param {String} id
 * @constructor
 * @property {String} id
 */
function Injection(id) {
  this.id = id;
}

/**
 * @readonly
 * @enum {number}
 */
var ExecutionMode = {
  STANDARD: 0,
  EACH: 1,
  COLLECT: 2,
  REDUCE: 3
};

/**
 * Provides methods to inject dependencies or constant values into functions. This means that a function will be
 * "partially evaluated". Additional arguments like the callback function or, in simple mode, the "return values" of the
 * previous function are provided by {@link fore}.
 * Retrieved by {@link inject}. Don't call this constructor by yourself.
 * @constructor
 */
function Injector(fn) {
  this.fn = fn;
  this.injections = null;
  this.thisInjection = null;
  this.errorHandler = null;

  this.mode = ExecutionMode.STANDARD;
  this.isSimpleChain = false;

  this.executor = null;
}

/**
 * Injects constant values or dependencies into this function starting from the left. Use {@link fore.ref} to inject
 * dependencies in auto mode. If no string constants need to be injected, <code>inject.args(...)</code> can also be
 * written using a shorter array notation, which is especially handy for anonymous functions:
 * @example
 * ((arg1, arg2) => ...).inject.args(fore.ref("arg1"), fore.ref("arg2"))
 * // shorter:
 * ["arg1", "arg2", (arg1, arg2) => ...]
 * @param {Injection|*} arguments The list of injections.
 * @return {Injector} <code>this</code>.
 * @chainable
 */
Injector.prototype.args = function args() {
  this.injections = map(arguments, function (arg) {
    return arg;
  });
  return this;
};

/**
 * Injects a constant value or dependency as <code>this</code> argument. Use {@link fore.ref} to inject dependencies in
 * auto mode. In chain mode, call this function without arguments in order to retrieve the "return value" of the previous
 * function as <code>this</code> argument instead of as first argument. If the previous function "returns" multiple values
 * only the first one will be passed, the others are ignored.
 * @param {Injection|Object} object The injection.
 * @return {Injector} <code>this</code>
 * @chainable
 */
Injector.prototype.this = function ths(object) {
  this.thisInjection = object;
  return this;
};

/**
 * Attaches an error handler to this function that will be called if the function invokes its callback with a non-null
 * first argument. This error will be passed as first argument to the errorHandler. Once an error occurs, the propagation
 * of this execution branch will be stopped.
 *
 * It also possible to register a general error handler to the entire fore-block using {@link fore.try}. Error handlers
 * attached directly to the function are prioritized.
 *
 * If an error occurs and no error handler has been registered the execution will break. So catch your errors!
 * @param {function(*)} errorHandler The error handler, a function which accepts one argument.
 * @return {Injector} <code>this</code>
 * @chainable
 */
Injector.prototype.catch = function ctch(errorHandler) {
  this.errorHandler = errorHandler;
  return this;
};

/**
 * @param {boolean} done
 * @param {number} expectedLength
 * @protected
 */
Injector.prototype.execute = function (done, expectedLength) {
  var injections = this.injections;

  var args;
  if (this.isSimpleChain) {
    args = [];
    if (injections !== null) {
      each(injections, function (valueProvider) {
        var value = valueProvider.value;
        if (value instanceof ArgumentsWrapper) {
          Array.prototype.push.apply(args, value.args);
        } else {
          args.push(value);
        }
      });
    }
  } else {
    args = injections === null ? [] : map(injections, function (valueProvider) {
          var value = valueProvider.value;
          return (value instanceof ArgumentsWrapper) ? value.args : value;
        });
  }

  var thisArg;
  var thisInjection = this.thisInjection;
  if (thisInjection instanceof ValueProvider) {
    if (thisInjection.value instanceof ArgumentsWrapper) {
      thisArg = thisInjection.value.args[0];
    } else {
      thisArg = thisInjection.value;
    }
  }

  this.executor.execute(thisArg, args, done, expectedLength);
};

/**
 * @param {Arguments} args
 * @constructor
 */
function ArgumentsWrapper(args) {
  var clone = this.args = new Array(args.length - 1);
  var i = 0, length = args.length;
  while (++i < length) {
    clone[i - 1] = args[i];
  }
}

/**
 * @constructor
 * @abstract
 * @property {ValuePipe} valuePipe
 * @property {Injector} injector
 */
function Executor(injector) {
  this.injector = injector;
  this.valuePipe = null;
}
/**
 * @abstract
 * @param {Object|null} thisArg
 * @param {Array.<*>} args
 * @param {boolean} done
 * @param {number} expectedLength
 */
Executor.prototype.execute = function (thisArg, args, done, expectedLength) {
};

/**
 * @param {Injector} injector
 * @constructor
 * @extends Executor
 */
function AsyncExecutor(injector) {
  Executor.call(this, injector);
  this.fn = injector.fn;
}
AsyncExecutor.prototype = Object.create(Executor.prototype);

AsyncExecutor.prototype.execute = function (thisArg, args, done, expectedLength) {
  var valuePipe = this.valuePipe;

  function emit(res) {
    valuePipe.push(res, done, expectedLength);
  }

  executeFunction(this.fn, thisArg, args, this.injector, emit);
};

/**
 * @param {function} fn
 * @param {*} thisArg
 * @param {Array.<*>} args
 * @param {Injector} injector
 * @param {function(*)} emit
 */
function executeFunction(fn, thisArg, args, injector, emit) {
  function callback(err, res) {
    if (err !== null) {
      handleError(injector, err);
    } else {
      if (arguments.length > 2) {
        res = new ArgumentsWrapper(arguments);
      }
      emit(res);
    }
  }

  args.push(callback);

  var returnValue = fn.apply(thisArg, args);

  if (returnValue === void 0) {
    return;
  }

  if (returnValue instanceof Promise) {
    executePromise(returnValue, injector, emit);
  } else {
    emit(returnValue);
  }
}

/**
 * @param {Injector} injector
 * @param {Promise} injector.fn
 * @constructor
 * @extends Executor
 */
function PromiseExecutor(injector) {
  Executor.call(this, injector);
  this.promise = injector.fn;
}
PromiseExecutor.prototype = Object.create(Executor.prototype);

PromiseExecutor.prototype.execute = function (thisArg, args, done, expectedLength) {
  var valuePipe = this.valuePipe;
  executePromise(this.promise, this.injector, function (value) {
    valuePipe.push(value, true, 1);
  });
};

/**
 * @param {Promise} promise
 * @param {Injector} injector
 * @param {function(*)} emit
 */
function executePromise(promise, injector, emit) {
  promise
      .then(emit)
      .catch(function (err) {
        handleError(injector, err);
      });
}

/**
 * @param {Iterator} iterator
 * @param {Injector} injector
 * @constructor
 * @extends Executor
 */
function IteratorExecutor(iterator, injector) {
  Executor.call(this, injector);
  this.iterator = iterator;
}
IteratorExecutor.prototype = Object.create(Executor.prototype);

IteratorExecutor.prototype.execute = function (thisArg, args, done, expectedLength) {
  var iterator = this.iterator;
  var valuePipe = this.valuePipe;
  var injector = this.injector;

  for (var next = iterator.next(), length = 1; !next.done; length++) {
    var value = next.value;

    // retrieve next already here because we must know if the iterator is done
    next = iterator.next();

    if (value instanceof Promise) {
      value
          .then(function (done, expectedLength, value) {
            valuePipe.push(value, done, expectedLength)
          }.bind(null, next.done, length))
          .catch(function (done, expectedLength, err) {
            handleError(injector, err);
            valuePipe.pushFailure(done, expectedLength);
          }.bind(null, next.done, length));
    } else {
      valuePipe.push(value, next.done, length);
    }
  }
};

/**
 * @param {function} generator
 * @param {Injector} injector
 * @constructor
 * @extends Executor
 */
function GeneratorExecutor(generator, injector) {
  Executor.call(this, injector);
  this.generator = generator;
}
GeneratorExecutor.prototype = Object.create(Executor.prototype);

GeneratorExecutor.prototype.execute = function (thisArg, args, done, expectedLength) {
  var iterator = this.generator.apply(thisArg, args);
  var iteratorExecutor = new IteratorExecutor(iterator, this.injector);
  iteratorExecutor.valuePipe = this.valuePipe;
  iteratorExecutor.execute(thisArg, args, done, expectedLength);
};

/**
 * @param {Injector} injector
 * @constructor
 * @extends Executor
 */
function ReduceExecutor(injector) {
  Executor.call(this, injector);
  this.fn = injector.fn;
  this.accumulationValue = injector.injections[0];

  this.pendingExecutions = [];
  this.isRunnning = false;

  this.executedLength = 0;
  this.done = false;
}
ReduceExecutor.prototype = Object.create(Executor.prototype);
ReduceExecutor.prototype.execute = function (thisArg, args, done, expectedLength) {
  var pendingExecutions = this.pendingExecutions;

  // save snapshot
  pendingExecutions.push([thisArg, args]);
  this.done = this.done || done;

  var execute = function () {
    if (pendingExecutions.length === 0) {
      return;
    }

    // restore snapshot
    var parameters = pendingExecutions.pop();
    parameters[1][0] = this.accumulationValue;

    this.executedLength++;
    executeFunction(this.fn, parameters[0], parameters[1], this.injector, function (value) {
      if (this.done && pendingExecutions.length === 0) {
        this.valuePipe.push(value, true, 1);
      } else {
        this.accumulationValue = value;
        execute();
      }
    }.bind(this));
  }.bind(this);

  if (!this.isRunnning) {
    this.isRunnning = true;
    execute();
    this.isRunnning = false;
  }
};

/**
 * @param {Injector} injector
 * @return {Executor}
 */
function createExecutor(injector) {
  switch (injector.mode) {
    case ExecutionMode.STANDARD:
    case ExecutionMode.COLLECT:
      if (injector.fn instanceof Promise) {
        return new PromiseExecutor(injector);
      } else {
        return new AsyncExecutor(injector);
      }

    case ExecutionMode.REDUCE:
      return new ReduceExecutor(injector);

    case ExecutionMode.EACH:
      var iterable = injector.fn;
      if (Array.isArray(iterable)) {
        var iterator;
        if (arrayValuesSupported) {
          iterator = iterable.values();
        } else {
          iterator = {
            next: (function () {
              var array = iterable;
              var i = 0;
              return function () {
                return i < array.length ? {value: array[i++]} : {done: true};
              }
            })()
          }
        }
        return new IteratorExecutor(iterator, injector)
      }

      if (typeof iterable === "function") {
        return new GeneratorExecutor(iterable, injector);
      }

      if (symbolsSupported && typeof iterable === "object" && typeof iterable[Symbol.iterator] === "function") {
        return new IteratorExecutor(iterable[Symbol.iterator](), injector);
      }
  }
}

/**
 * Starts the injection of values or dependencies into this function. Should be followed by one of the {@link Injector}
 * methods. Use <code>inject</code> to avoid function wrappers or things like {@link Function.prototype.bind}.
 * @return {Injector} The injector.
 */
function inject() {
  return new Injector(this);
}

/**
 * @param {function} fn
 * @return {Injector}
 */
function foreInject(fn) {
  return inject.call(fn);
}

// add inject to Function prototype
function attachInject() {
  Object.defineProperty(Function.prototype, "inject", {
    get: inject,
    configurable: true,
    enumerable: false
  });
}

/**
 * Configures foreJs.
 * @param {object=} properties The configuration object.
 * @param {boolean=} properties.dontHackFunctionPrototype Set <code>true</code> to keep <code>Function.prototype</code>
 *   clean and omit the {@link inject} getter. {@link inject} now exists as static property of {@link fore} instead:
 *   <code>fore.inject(myFunction).args(...)</code>. Default: <code>false</code>
 */
fore.config = function (properties) {
  var config = new Config(properties);

  if (config.dontHackFunctionPrototype) {
    if (Object.getOwnPropertyDescriptor(Function.prototype, "inject").get === inject) {
      delete Function.prototype.inject;
    }
    fore.inject = foreInject;
  } else {
    if (typeof fore.inject === "function") {
      delete fore.inject;
    }
    attachInject();
  }
};

/**
 * @param {Object} config
 * @constructor
 * @property {boolean} dontHackFunctionPrototype
 */
function Config(config) {
  config && each(Object.getOwnPropertyNames(config), function (name) {
    this[name] = config[name];
  }.bind(this));
}
Config.prototype.dontHackFunctionPrototype = false;

fore.config();

export default fore;
