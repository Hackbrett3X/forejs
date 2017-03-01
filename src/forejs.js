module.exports = fore;

var symbolsSupported = typeof Symbol === "function" && typeof Symbol.iterator === "symbol";
var arrayValuesSupported = typeof Array.prototype.values === "function";

/**
 * @callback Callback
 * @param {*} err
 * @param {*=} res
 */

/**
 * @param {...*} functions
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
  ids.forEach(function (id) {
    valuePipes[id] = new ValuePipe();
  });

  var rootInjectors = [];
  ids.forEach(function (id) {
    var hasInjections = [false];

    // create nodes
    var injector = desugar(functions[id]);
    var combinator = createCombinator(injector);
    var executor = createExecutor(injector);
    var valuePipe = valuePipes[id];

    // link them
    if (injector.injections !== null) {
      injector.injections = injector.injections.map(function (injection) {
        return createValuePipeFromInjection(valuePipes, combinator, injection, hasInjections);
      });
    }

    if (injector.thisInjection !== null) {
      injector.thisInjection = createValuePipeFromInjection(valuePipes, combinator, injector.thisInjection, hasInjections);
    }

    combinator.injector = injector;
    injector.executor = executor;
    executor.valuePipe = valuePipe;

    if (!hasInjections[0]) {
      rootInjectors.push(injector);
    }
  });

  // start execution chain
  rootInjectors.forEach(function (injector) {
    injector.execute();
  });
}

/**
 * @param {Object.<String, ValuePipe>} valuePipes
 * @param {AllCombinationsCombinator} combinator
 * @param {Injection} injection
 * @param {boolean[]} hasInjections
 * @return {ValueProvider}
 */
function createValuePipeFromInjection(valuePipes, combinator, injection, hasInjections) {
  var valueProvider = new ValueProvider();

  if (injection instanceof Injection) {
    hasInjections[0] = true;

    var valuePipe = valuePipes[injection.id];

    valuePipe.register(combinator);
    combinator.valuePipes.push(valuePipe);
    combinator.valueProviders.push(valueProvider);
  } else {
    valueProvider.value = injection;
  }

  return valueProvider;
}

/**
 * @param {*} functions
 */
function simpleChain(functions) {
  var valuePipes = Array.prototype.map.call(functions, function () {
    return new ValuePipe();
  });

  var rootInjector;

  for (var i = 0; i < functions.length; i++) {
    var injector = desugar(functions[i]);
    var executor = createExecutor(injector);
    var valuePipe = valuePipes[i];

    injector.injections = injector.injections && injector.injections.map(function (injection) {
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
  }

  rootInjector.execute();
}

fore.try = function () {
  var args = arguments;
  return {
    "catch": function (errorHandler) {
      var functions = args[0];
      if (typeof functions === "object" && Object.getPrototypeOf(functions) === Object.prototype) {
        Object.getOwnPropertyNames(args[0]).forEach(function (name) {
          functions[name] = injectErrorHandler(functions[name], errorHandler);
        });
        fore(functions);
      } else {
        var newArgs = new Array(args.length);
        for (var i = 0; i < args.length; i++) {
          newArgs[i] = injectErrorHandler(args[i], errorHandler);
        }
        fore.apply(null, newArgs);
      }

    }
  }
};

/**
 * @param {Array|Iterator|Iterable|function} iterable
 * @return {Injector}
 */
fore.each = function foreEach(iterable) {
  var injector = !(iterable instanceof Injector) ? new Injector(iterable) : iterable;
  injector.mode = ExecutionMode.EACH;
  return injector;
};

/**
 * @param {function|Injector|*[]} fn
 * @return {Injector}
 */
fore.collect = function (fn) {
  var injector = desugar(fn);
  injector.mode = ExecutionMode.COLLECT;
  return injector;
};

/**
 * @param {Injector|function} injector
 * @param {function} errorHandler
 * @return {Injector}
 */
function injectErrorHandler(injector, errorHandler) {
  if (injector instanceof Injector) {
    injector.errorHandler = errorHandler;
    return injector;
  } else {
    return injector.inject.catch(errorHandler);
  }
}

/**
 * @param {Injector|undefined} injector
 * @param {*} err
 */
function handleError(injector, err) {
  injector.errorHandler(err);
}

/**
 * @param {*[]|function|Injector} fn
 * @param {Injector} fn.injector
 * @return {Injector}
 */
function desugar(fn) {
  if (Array.isArray(fn)) {
    // desugar ["a", "b", function (a, b) {...}]
    var injector = fn[fn.length - 1].inject;
    return injector.args.apply(injector, fn.slice(0, fn.length - 1).map(function (arg) {
      return typeof arg === "string" ? fore.ref(arg) : arg;
    }));
  }

  if (!(fn instanceof Injector)) {
    return fn.inject;
  }

  return fn;
}

/**
 * @param {String} id
 */
fore.ref = function ref(id) {
  return new Injection(id);
};

/**
 * @constructor
 * @extends Array
 */
function ValuePipe() {
  this.observers = [];
  this.done = false;
  this.expectedLength = 0;
}
ValuePipe.prototype = Object.create(Array.prototype);

/**
 * @param {AllCombinationsCombinator} observer
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
  Array.prototype.push.call(this, value);

  if (done) {
    this.expectedLength = expectedLength;
  }
  this.done = this.length === this.expectedLength;

  var sender = this;
  this.observers.forEach(function (observer) {
    observer.notify(sender);
  });
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
 * @param {ValuePipe} sender
 * @abstract
 */
Combinator.prototype.notify = function (sender) {
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

  var currentLengths = valuePipes.map(function (valuePipe) {
    return valuePipe.length;
  });

  var possibleCombinations = currentLengths.reduce(function (length, l) {
    return length * l;
  });

  if (this.executionCounter >= possibleCombinations) {
    // prevent double execution
    return;
  }

  this.executionCounter = possibleCombinations;

  var senderIndex = valuePipes.indexOf(sender);

  valueProviders[senderIndex].value = valuePipes[senderIndex][currentLengths[senderIndex] - 1];

  // TODO: is ES6
  var currentIndices = new Array(valuePipes.length).fill(0);

  var carry = false;
  while (!carry) {
    carry = true;

    // set current values and count one step
    for (var i = 0; i < valuePipes.length; i++) {
      if (i === senderIndex) {
        continue;
      }

      valueProviders[i].value = valuePipes[i][currentIndices[i]];

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
    this.injector.execute(valuePipes.every(function (pipe) { return pipe.done }), possibleCombinations);
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

CollectorCombinator.prototype.notify = function (sender) {
  var valuePipes = this.valuePipes;
  if (!valuePipes.every(function (pipe) { return pipe.done })) {
    return;
  }

  var valueProviders = this.valueProviders;
  for (var i = 0; i < valuePipes.length; i++) {
    var valuePipe = valuePipes[i];
    valueProviders[i].value = valuePipe.slice(0);
  }

  this.injector.execute(true, 1);
};

/**
 * @param {Injector} injector
 * @return {*}
 */
function createCombinator(injector) {
  if (injector.mode === ExecutionMode.COLLECT) {
    return new CollectorCombinator();
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
  COLLECT: 2
};

/**
 * @param {function|Array} fn
 * @constructor
 * @property {function|Array} fn
 * @property {(Injection|ValueProvider)[]} injections
 * @property {Injection|ValueProvider} thisInjection
 * @property {function(*)} errorHandler
 * @property {Executor} executor
 * @property {ExecutionMode} mode
 */
function Injector(fn) {
  this.fn = fn;
  this.injections = null;
  this.thisInjection = null;
  this.errorHandler = null;
  this.mode = ExecutionMode.STANDARD;

  this.executor = null;
}

/**
 * @param {Injection|*} arguments
 * @return {Injector}
 */
Injector.prototype.args = function args() {
  var injections = this.injections = new Array(arguments.length);
  for (var i = 0; i < arguments.length; i++) {
    injections[i] = arguments[i];
  }
  return this;
};

/**
 * @param {Injection|Object} object
 * @return {Injector}
 */
Injector.prototype.this = function ths(object) {
  this.thisInjection = object;
  return this;
};

/**
 * @param {function(*)} errorHandler
 * @return {Injector}
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
  var args = this.injections === null ? [] : this.injections.map(function (valueProvider) {
        return valueProvider.value;
      });
  var thisArg = this.thisInjection && this.thisInjection.value;

  this.executor.execute(thisArg, args, done, expectedLength);
};

/**
 * @constructor
 * @abstract
 * @property {function} executee
 * @property {ValuePipe} valuePipe
 */
function Executor() {
  this.valuePipe = null;
}
/**
 * @abstract
 * @param {Object|null} thisArg
 * @param {*[]} args
 * @param {boolean} done
 * @param {number} expectedLength
 */
Executor.prototype.execute = function (thisArg, args, done, expectedLength) {
};

/**
 * @param {function} fn
 * @param {Injector} injector
 * @constructor
 * @extends Executor
 */
function AsyncExecutor(fn, injector) {
  Executor.call(this);
  this.injector = injector;
  this.fn = fn;
}
AsyncExecutor.prototype = Object.create(Executor.prototype);

AsyncExecutor.prototype.execute = function (thisArg, args, done, expectedLength) {
  var valuePipe = this.valuePipe;
  var injector = this.injector;

  function callback(err, res) {
    if (err !== null) {
      handleError(injector, err);
    } else {
      emit(res);
    }
  }

  function emit(res) {
    valuePipe.push(res, done, expectedLength);
  }

  var returnValue = this.fn.apply(thisArg, args.concat(callback));
  if (returnValue === void 0) {
    return;
  }

  if (returnValue instanceof Promise) {
    returnValue
        .then(function (res) {
          emit(res);
        })
        .catch(function (err) {
          handleError(injector, err);
        });
  } else {
    emit(returnValue);
  }
};

/**
 * @param {Iterator} iterator
 * @constructor
 * @extends Executor
 */
function IteratorExecutor(iterator) {
  Executor.call(this);
  this.iterator = iterator;
}
IteratorExecutor.prototype = Object.create(Executor.prototype);

IteratorExecutor.prototype.execute = function (thisArg, args, done) {
  var iterator = this.iterator;
  for (var next = iterator.next(), length = 1; !next.done; length++) {
    var value = next.value;

    // retrieve next already here because we must know if the iterator is done
    next = iterator.next();

    this.valuePipe.push(value, next.done, length);
  }
};

/**
 * @param {function} generator
 * @constructor
 * @extends Executor
 */
function GeneratorExecutor(generator) {
  Executor.call(this);
  this.generator = generator;
}
GeneratorExecutor.prototype = Object.create(Executor.prototype);

GeneratorExecutor.prototype.execute = function (thisArg, args, done, expectedLength) {
  var iterator = this.generator.apply(thisArg, args);
  var iteratorExecutor = new IteratorExecutor(iterator);
  iteratorExecutor.valuePipe = this.valuePipe;
  iteratorExecutor.execute(thisArg, args, done, expectedLength);
};

/**
 * @param {Injector} injector
 * @return {Executor}
 */
function createExecutor(injector) {
  if (injector.mode !== ExecutionMode.EACH) {
    return new AsyncExecutor(injector.fn, injector);
  }

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
    return new IteratorExecutor(iterator)
  }

  if (typeof iterable === "function") {
    return new GeneratorExecutor(iterable);
  }

  if (symbolsSupported && typeof iterable === "object" && typeof iterable[Symbol.iterator] === "function") {
    return new IteratorExecutor(iterable[Symbol.iterator]());
  }
}

/**
 * @return {Injector}
 */
function inject() {
  return new Injector(this);
}

// add inject to Function prototype
Object.defineProperty(Function.prototype, "inject", {
  get: inject,
  configurable: false,
  enumerable: false
});
