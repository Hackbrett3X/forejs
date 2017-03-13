module.exports = fore;

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
      injector.injections = map(injector.injections, function (injection) {
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

    var valuePipe = valuePipes[injection.id];
    if (!valuePipe) {
      throw new Error("Unbound identifier '" + injection.id + "'.");
    }

    // TODO: replace push
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
  var valuePipes = map(functions, function () {
    return new ValuePipe();
  });

  var rootInjector = null;

  each(functions, function (fn, i) {
    var injector = desugar(fn);
    injector.isSimpleChain = true;
    var executor = createExecutor(injector);
    var valuePipe = valuePipes[i];

    injector.injections = injector.injections && replace(injector.injections, function (injection) {
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
 * @param {function|Injector|*[]} fn
 * @param {*} initialValue
 * @return Injector
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
    var i = -1, length = fn.length - 1;
    var injections = injector.injections = new Array(length);
    while (++i < length) {
      var arg = fn[i];
      injections[i] = typeof arg === "string" ? fore.ref(arg) : arg;
    }
    return injector;
  }

  if (!(fn instanceof Injector)) {
    return new Injector(fn);
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
 * @property {*[]} values
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
 * @param {Combinator} observer
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
 * @param {ValuePipe} sender
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
  // TODO: every
  if (!valuePipes.every(function (pipe) { return pipe.done })) {
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
 * @param {function|Array|Promise} fn
 * @constructor
 * @property {function|Array} fn
 * @property {(Injection|ValueProvider)[]} injections
 * @property {Injection|ValueProvider} thisInjection
 * @property {function(*)} errorHandler
 * @property {Executor} executor
 * @property {ExecutionMode} mode
 * @property {boolean} isSimpleChain
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
 * @param {Injection|*} arguments
 * @return {Injector}
 */
Injector.prototype.args = function args() {
  this.injections = map(arguments, function (arg) {
    return arg;
  });
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
 * @param {Arguments} arguments
 * @constructor
 */
function ArgumentsWrapper(arguments) {
  var args = this.args = new Array(arguments.length - 1);
  for (var i = 1; i < arguments.length; i++) {
    args[i - 1] = arguments[i];
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
 * @param {*[]} args
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
 * @param {*[]} args
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

IteratorExecutor.prototype.execute = function (thisArg, args, done) {
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
      break;

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
