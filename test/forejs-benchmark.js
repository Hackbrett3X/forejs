const benchmark = require("benchmark");

const fore = require("../src/forejs");
const ref = fore.ref;
const async = require("async");

function report() {
  console.log(this.name + ": ");
  this.forEach(function (benchmark) {
    return console.log("\t" + benchmark.name + ": " + (benchmark.stats.mean * 1000 * 1000) + "\u03BCs");
  });
}

function zero(callback) {
  callback.call(this, null, 0);
}

function plusOne(n, callback) {
  callback.call(this, null, n + 1);
}

function plus(n, m, callback) {
  callback.call(this, null, n + m);
}

(new benchmark.Suite("waterfall"))
    .add("pure node", function (deferred) {
      zero(n =>
          plusOne(n, n =>
              plusOne(n, n =>
                  plusOne(n, () => deferred.resolve()))))
    }, {defer: true})
    .add("foreJs", function (deferred) {
      fore(
          zero,
          plusOne,
          plusOne,
          plusOne,
          () => deferred.resolve()
      )
    }, {defer: true})
    .add("async", function (deferred) {
      async.waterfall([
            zero,
            plusOne,
            plusOne,
            plusOne,
          ],
          () => deferred.resolve()
      )
    }, {defer: true})
    .on("complete", report)
    .run();

(new benchmark.Suite("auto"))
    .add("foreJs", function (deferred) {
      fore({
        zero: zero,
        one1: plusOne.inject.args(ref("zero")),
        one2: plusOne.inject.args(ref("zero")),
        two: plusOne.inject.args(ref("one1")),
        three1: plus.inject.args(ref("one2"), ref("two")),
        three2: plus.inject.args(ref("one1"), ref("two")),
        six: plus.inject.args(ref("three1"), ref("three2")),
        _: ["six", () => deferred.resolve()]
      })
    }, {defer: true})
    .add("async", function (deferred) {
      async.auto({
        zero: zero,
        one1: ["zero", (results, cb) => plusOne(results.zero, cb)],
        one2: ["zero", (results, cb) => plusOne(results.zero, cb)],
        two: ["one1", (results, cb) => plusOne(results.one1, cb)],
        three1: ["one2", "two", (results, cb) => plus(results.one2, results.two, cb)],
        three2: ["one1", "two", (results, cb) => plus(results.one1, results.two, cb)],
        six: ["three1", "three2", (results, cb) => plus(results.three1, results.three2, cb)]
      }, () => deferred.resolve())
    }, {defer: true})
    .on("complete", report)
    .run();