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
    var fn = desugar(functions[id]);

    var hasInjections = [false];

    // create nodes
    var combinator = new Combinator();
    var injector = fn.$injector;
    var executor = createExecutor(fn, injector);
    var valuePipe = valuePipes[id];

    // link them
    if (injector.injections !== null) {
      injector.injections = injector.injections.map(function (injection) {
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
  rootInjectors.forEach(function (injector) {
    injector.execute();
  });
}

/**
 * @param {Object.<String, ValuePipe>} valuePipes
 * @param {Combinator} combinator
 * @param {Injection} injection
 * @param {boolean[]} hasInjections
 * @return {ValueProvider}
 */
function createValueProviderFromInjection(valuePipes, combinator, injection, hasInjections) {
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
    var fn = desugar(functions[i]);

    var injector = fn.$injector;
    var executor = createExecutor(fn, injector);
    var valuePipe = valuePipes[i];

    injector.injections = injector.injections && injector.injections.map(function (injection) {
      var valueProvider = new ValueProvider();
      valueProvider.value = injection;
      return valueProvider;
    });

    if (i > 0) {
      var combinator = new Combinator();
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
      if (typeof functions === "object") {
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
 * @constructor
 * @property {Array|Iterator|function} iterable
 * @property {Injector} $injector
 */
function ForeEach(iterable) {
  this.iterable = iterable;
}

/**
 * @param {Array|Iterator|Iterable|function} iterable
 * @return {ForeEach}
 */
fore.each = function foreEach(iterable) {
  return new ForeEach(iterable);
};

/**
 * @param {function} fn
 * @param {Injector} fn.$injector
 * @param {function} errorHandler
 * @return {InjectorFunction}
 */
function injectErrorHandler(fn, errorHandler) {
  var injector = fn.$injector;
  if (injector instanceof Injector) {
    injector.catch = errorHandler;
    return fn;
  } else {
    return fn.inject.catch(errorHandler);
  }
}

/**
 * @param {Injector|undefined} injector
 * @param {*} err
 */
function handleError(injector, err) {
  injector.catch(err);
}

/**
 * @param {*[]|function|ForeEach} fn
 * @param {Injector} fn.$injector
 * @return {InjectorFunction}
 */
function desugar(fn) {
  if (fn instanceof ForeEach) {
    if (fn.iterable.$injector instanceof Injector) {
      fn.$injector = fn.iterable.$injector;
    } else {
      fn.$injector = new Injector();
    }
    return fn;
  }

  if (Array.isArray(fn)) {
    // desugar ["a", "b", function (a, b) {...}]
    return fn[fn.length - 1].inject.args.apply(null, fn.slice(0, fn.length - 1).map(function (arg) {
      return typeof arg === "string" ? fore.ref(arg) : arg;
    }));
  }

  if (!(fn.$injector instanceof Injector)) {
    return fn.inject;
  }

  return fn;
}

/**
 * @param {Promise|undefined} promise
 * @param {Callback} callback
 */
function supportPromise(promise, callback) {
  if (promise instanceof Promise) {
    promise
        .then(function (res) {
          callback(null, res);
        })
        .catch(function (err) {
          callback(err);
        });
  }
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
}
ValuePipe.prototype = Object.create(Array.prototype);

/**
 * @param {Combinator} observer
 */
ValuePipe.prototype.register = function (observer) {
  if (this.observers.indexOf(observer) < 0) {
    this.observers.push(observer);
  }
};

/**
 * @param {*} value
 */
ValuePipe.prototype.push = function (value) {
  Array.prototype.push.call(this, value);
  var sender = this;
  this.observers.forEach(function (observer) {
    observer.notify(sender);
  });
};


/**
 * @constructor
 * @property {Injector} injector
 * @property {ValuePipe[]} valuePipes
 * @property {ValueProvider[]} valueProviders
 */
function Combinator() {
  this.injector = null;
  this.valuePipes = [];
  this.valueProviders = [];
  this.executionCounter = 0;
}

/**
 * @param {ValuePipe} sender
 */
Combinator.prototype.notify = function (sender) {
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

  var senderIndex = valuePipes.findIndex(function (valuePipe) {
    return valuePipe === sender;
  });

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
          currentIndices[0] = 0;
          carry = true;
        }
      }
    }

    // emit value combination
    this.executionCounter++;
    this.injector.execute();
  }
};

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
 * @constructor
 * @property {(Injection|ValueProvider)[]} injections
 * @property {Injection|ValueProvider} thisInjection
 * @property {function(*)} catch
 * @property {Executor} executor
 */
function Injector() {
  this.injections = null;
  this.thisInjection = null;
  this.catch = null;

  this.executor = null;
}

Injector.prototype.execute = function () {
  var args = this.injections === null ? [] : this.injections.map(function (valueProvider) {
        return valueProvider.value;
      });
  var thisArg = this.thisInjection && this.thisInjection.value;

  this.executor.execute(thisArg, args);
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
 * @param {Object|null} thisArg
 * @param {*[]} args
 */
Executor.prototype.execute = function (thisArg, args) {
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

AsyncExecutor.prototype.execute = function (thisArg, args) {
  var valuePipe = this.valuePipe;
  var injector = this.injector;

  function callback(err, res) {
    if (err !== null) {
      handleError(injector, err);
    } else {
      valuePipe.push(res);
    }
  }

  supportPromise(this.fn.apply(thisArg, args.concat(callback)), callback);
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

IteratorExecutor.prototype.execute = function (thisArg, args) {
  var iterator = this.iterator;
  for (var next = iterator.next(); !next.done; next = iterator.next()) {
    this.valuePipe.push(next.value);
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

GeneratorExecutor.prototype.execute = function (thisArg, args) {
  var iterator = this.generator.apply(thisArg, args);
  var iteratorExecutor = new IteratorExecutor(iterator);
  iteratorExecutor.valuePipe = this.valuePipe;
  iteratorExecutor.execute(thisArg, args);
};

/**
 * @param {ForeEach|function} fn
 * @param {Injector} injector
 * @return {Executor}
 */
function createExecutor(fn, injector) {
  if (!(fn instanceof ForeEach)) {
    return new AsyncExecutor(fn, injector);
  }

  var iterable = fn.iterable;
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
 * @callback InjectorFunction
 * @property {function(...*): InjectorFunction} args
 * @property {function(Object): InjectorFunction} this
 * @property {function(function(*)): InjectorFunction} catch
 */

/**
 * @return {InjectorFunction}
 */
function inject() {
  var originalFunction = this;

  // clone the function
  var fn = function () {
    return originalFunction.apply(this, arguments);
  };

  var injector = new Injector();

  fn.args = function args() {
    var injections = injector.injections = new Array(arguments.length);
    for (var i = 0; i < arguments.length; i++) {
      injections[i] = arguments[i];
    }
    return fn;
  };

  fn.this = function ths(object) {
    injector.thisInjection = object;
    return fn;
  };

  fn.catch = function ctch(errorHandler) {
    injector.catch = errorHandler;
    return fn;
  };

  fn.$injector = injector;

  return fn;
}

// add inject to Function prototype
Object.defineProperty(Function.prototype, "inject", {
  get: inject,
  configurable: false,
  enumerable: false
});
