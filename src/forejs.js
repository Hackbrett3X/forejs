module.exports = fore;

/**
 * @param {...*} functions
 */
function fore(functions) {
  if (typeof functions === "object") {
    var graph = {};
    var roots = [];
    Object.getOwnPropertyNames(functions).forEach(function (name) {
      var fn = functions[name];

      getOrCreateNode(graph, name).function = fn;

      var numberOfInjections = 0;

      var injector = fn.$injector;
      if (injector instanceof Injector) {
        injector.injections.forEach(function (injection) {
          if (injection instanceof Injection) {
            if (connect(graph, injection.id, name)) {
              numberOfInjections++;
            }
          }
        });

        var thisInjection = injector.thisInjection;
        if (thisInjection && thisInjection instanceof Injection) {
          if (connect(graph, thisInjection.id, name)) {
            numberOfInjections++;
          }
        }
      }

      if (numberOfInjections === 0) {
        roots.push(getOrCreateNode(graph, name));
      }

    });

    var results = {};
    roots.forEach(function (node) {
      node.execute(results);
    });


  } else {
    // TODO: simple case: chain all function calls
    for (var i = 0; i < arguments.length; i++) {
      var fn = arguments[i];


    }
  }
}

/**
 *
 * @param {Object.<String, ExecutorNode>} graph
 * @param {String} from
 * @param {String} to
 * @return {boolean} false iff this dependency already existed
 */
function connect(graph, from, to) {
  var fromNode = getOrCreateNode(graph, from);
  var toNode = getOrCreateNode(graph, to);

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

  if (fn.$injector instanceof Injector) {
    fn.$injector.results = results;
  }

  fn(function (err, res) {
    if (err != null) {
      // TODO: error case
    } else {
      results[this.id] = res;
      this.dependents.forEach(function (node) {
        node.notify(results);
      });
    }
  }.bind(this))
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

/**
 * @param {String} id
 */
fore.get = function get(id) {
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
    var args = new Array(injections.length + 1);
    injections.forEach(function (arg, i) {
      args[i] = arg instanceof Injection ? arg.resolve(injector.results) : arg;
    });
    args[args.length - 1] = callback;

    originalFunction.apply(thisArg, args);
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

  fn.$injector = injector;

  return fn;
}

// add inject to Function prototype
Object.defineProperty(Function.prototype, "inject", {
  get: inject,
  configurable: false,
  enumerable: false
});
