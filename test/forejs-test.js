var expect = require("chai").expect;
var it = require("mocha").it;
var before = require("mocha").before;
var describe = require("mocha").describe;

var fore = require("../src/forejs");

function one(callback) {
  setTimeout(function () {
    callback(null, 1);
  }, 0);
}

function plusOne(n, callback) {
  setTimeout(function () {
    callback(null, n + 1);
  }, 0);
}

function plus(n, m, callback) {
  setTimeout(function () {
    callback(null, n + m);
  }, 0);
}

function error(error, callback) {
  setTimeout(function () {
    callback(error || "error")
  }, 0)
}

describe("General functionality", function () {

  describe("Simple chaining/defer", function () {
    it("one - defer with 0 arguments", function () {
      fore(
          one.defer(),
          function (res) {
            expect(res).to.equal(1);
          }
      )
    });

    it("plusOne - defer with 1 argument", function () {
      fore(
          plusOne.defer(0),
          function (res) {
            expect(res).to.equal(1);
          }
      )
    });

    it("plus - defer with 2 arguments", function () {
      fore(
          plus.defer(0, 1),
          function (res) {
            expect(res).to.equal(1);
          }
      )
    });

    it("one plusOne plus 1 - chain them all", function () {
      fore(
          one.defer(),
          plusOne.defer(),
          plus.defer(1),
          function (res) {
            expect(res).to.equal(3);
          }
      )
    });
  });

  describe("Catching errors", function () {
    it("catch", function () {
      fore(
          error.defer("msg").catch(function (error) {
            expect(error).to.equal("msg");
          })
      );
    });

    it("catch - stop propagation on error", function () {
      fore(
          error.defer("msg").catch(function (error) {
            expect(error).to.equal("msg");
          }),
          function () {
            expect.fail();
          }
      );
    });
  })
});