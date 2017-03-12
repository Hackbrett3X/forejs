const benchmark = require("benchmark");

const fore = require("../src/forejs");
const async = require("async");

function report() {
  this.forEach(function (benchmark) {
    return console.log(benchmark.name + ": " + (benchmark.stats.mean * 1000 * 1000) + "\u03BCs");
  });
}

function start(callback) {
  callback.call(this, null, 0);
}

function doSomething(n, callback) {
  callback.call(this, null, n + 1);
}

(new benchmark.Suite("waterfall", {defer: true}))
    .add("pure node", function (deferred) {
      start(n =>
          doSomething(n, n =>
              doSomething(n, n =>
                  doSomething(n, () => deferred.resolve()))))
    }, {defer: true})
    .add("foreJs", function (deferred) {
      fore(
          start,
          doSomething,
          doSomething,
          doSomething,
          () => deferred.resolve()
      )
    }, {defer: true})
    .add("async", function (deferred) {
      async.waterfall([
            start,
            doSomething,
            doSomething,
            doSomething,
          ],
          () => deferred.resolve()
      )
    }, {defer: true})
    .on("complete", report)
    .run();