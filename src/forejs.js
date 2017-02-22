module.exports = fore;

/**
 * @callback Callback
 * @param {*} err
 * @param {*=} res
 */

/**
 * @param {...*} functions
 */
function fore(functions) {
  if (typeof functions === "object") {
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
    // TODO: loop executor
    var executor = new AsyncExecutor(injector);
    executor.executee = fn;
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
    // TODO: loop executor
    var executor = new AsyncExecutor(injector);
    executor.executee = fn;
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
 * @param {*[]|function} fn
 * @param {Injector} fn.$injector
 * @return {InjectorFunction}
 */
function desugar(fn) {
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
  // TODO: create combinations

  var possibleCombinations = 1;

  for (var i = 0; i < this.valuePipes.length; i++) {
    var input = this.valuePipes[i];
    if (input.length === 0) {
      return;
    }

    possibleCombinations *= input.length;

    this.valueProviders[i].value = input[0];
  }

  if (this.executionCounter >= possibleCombinations) {
    // prevent double execution
    return;
  }

  this.executionCounter++;
  this.injector.execute();
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
  this.executee = null;
  this.valuePipe = null;
}
/**
 * @param {Object|null} thisArg
 * @param {*[]} args
 */
Executor.prototype.execute = function (thisArg, args) {
};

/**
 * @param {Injector} injector
 * @constructor
 * @extends Executor
 */
function AsyncExecutor(injector) {
  this.injector = injector;
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

  supportPromise(this.executee.apply(thisArg, args.concat(callback)), callback);
};

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
