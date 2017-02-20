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
  var graph = {};
  var roots = [];
  Object.getOwnPropertyNames(functions).forEach(function (name) {
    var fn = functions[name];

    if (Array.isArray(fn)) {
      // desugar ["a", "b", function (a, b) {...}]
      fn = fn[fn.length - 1].inject.args.apply(null, fn.slice(0, fn.length - 1).map(function (arg) {
        return fore.ref(arg);
      }));
    }

    var executorNode = getOrCreateNode(graph, name);
    executorNode.function = fn;

    var numberOfInjections = 0;

    var injector = fn.$injector;
    if (injector instanceof Injector) {

      var injections = injector.injections;
      if (injections !== null) {
        injections.forEach(function (injection) {
          if (injection instanceof Injection) {
            if (connect(getOrCreateNode(graph, injection.id), executorNode)) {
              numberOfInjections++;
            }
          }
        });
      }

      var thisInjection = injector.thisInjection;
      if (thisInjection && thisInjection instanceof Injection) {
        if (connect(getOrCreateNode(graph, thisInjection.id), executorNode)) {
          numberOfInjections++;
        }
      }
    }

    if (numberOfInjections === 0) {
      roots.push(executorNode);
    }

  });

  var results = {};
  roots.forEach(function (node) {
    node.execute(results);
  });
}

/**
 * @param {*} functions
 */
function simpleChain(functions) {
  var currentIndex = 0;

  function callback(err, res) {
    if (err !== null && err !== void 0) {
      handleError(functions[currentIndex].$injector, err);
      return;
    }

    currentIndex++;
    if (currentIndex >= functions.length) {
      return;
    }

    var fn = functions[currentIndex];
    var injector = fn.$injector;
    if (!(injector instanceof Injector)) {
      supportPromise(fn(res, callback), callback);
      return;
    }

    if (injector.thisInjection === void 0) {
      // inject.this has been called without args -> pass result as "this"
      injector.thisInjection = res;
    } else if (injector.injections === null) {
      injector.injections = [res];
    } else {
      injector.injections.push(res);
    }

    supportPromise(fn(callback), callback);
  }

  supportPromise(functions[0](callback), callback);
}

/**
 *
 * @param {ExecutorNode} fromNode
 * @param {ExecutorNode} toNode
 * @return {boolean} false iff this dependency already existed
 */
function connect(fromNode, toNode) {
  if (fromNode.dependents.indexOf(toNode) < 0) {
    fromNode.dependents.push(toNode);
    toNode.dependencies.push(fromNode);
    return true;
  } else {
    return false;
  }
}

/**
 * @param {Object.<String, ExecutorNode>} graph
 * @param {String} id
 * @returns {ExecutorNode}
 */
function getOrCreateNode(graph, id) {
  return graph[id] || (graph[id] = new ExecutorNode(id));
}

/**
 * @typedef {Object.<String, *>} Results
 */

/**
 * @param {String} id
 * @constructor
 */
function ExecutorNode(id) {
  this.id = id;
  this.dependencies = [];
  this.executedDependencies = 0;
  this.dependents = [];
  this.function = null;
}

/**
 * @param {Results} results
 */
ExecutorNode.prototype.execute = function execute(results) {
  var fn = this.function;

  var injector = fn.$injector;
  if (injector instanceof Injector) {
    injector.results = results;
  }

  var node = this;
  function callback(err, res) {
    if (err !== null && err !== void 0) {
      handleError(injector, err);
    } else {
      results[node.id] = res;
      node.dependents.forEach(function (node) {
        node.notify(results);
      });
    }
  }

  supportPromise(fn(callback), callback);
};

/**
 * @param {Results} results
 */
ExecutorNode.prototype.notify = function (results) {
  this.executedDependencies++;

  if (this.executedDependencies === this.dependencies.length) {
    this.execute(results);
  }
};

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
  if (injector instanceof Injector && injector.catch !== null) {
    injector.catch(err);
  }
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
 * @param {String} id
 * @constructor
 */
function Injection(id) {
  this.id = id;
}

/**
 * @param {Results} results
 * @return {*}
 */
Injection.prototype.resolve = function resolve(results) {
  return results[this.id];
};

/**
 * @constructor
 */
function Injector() {
  this.injections = null;
  this.thisInjection = null;
  this.results = null;
  this.catch = null;
}

/**
 * @callback InjectorFunction
 * @property {function(...*): InjectorFunction} args
 * @property {function(Object): InjectorFunction} this
 */

/**
 * @return {InjectorFunction}
 */
function inject() {
  var originalFunction = this;

  var injector = new Injector();

  function fn(callback) {
    var thisInjection = injector.thisInjection;
    var thisArg = thisInjection && (thisInjection instanceof Injection ?
            thisInjection.resolve(injector.results) : thisInjection);

    var injections = injector.injections;
    var args;
    if (injections !== null) {
      args = new Array(injections.length + 1);
      injections.forEach(function (arg, i) {
        args[i] = arg instanceof Injection ? arg.resolve(injector.results) : arg;
      });
    } else {
      args = new Array(1);
    }

    args[args.length - 1] = callback;

    supportPromise(originalFunction.apply(thisArg, args), callback);
  }

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
