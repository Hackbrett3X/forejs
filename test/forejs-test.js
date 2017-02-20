var expect = require("chai").expect;
var it = require("mocha").it;
var describe = require("mocha").describe;

var fore = require("../src/forejs");

// TODO: duplicate refs, inject.this

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
    callback(error)
  }, 0)
}

describe("General functionality", function () {

  describe("Simple chaining/inject", function () {
    it("one - inject with 0 arguments", function (done) {
      fore(
          one,
          function (res) {
            expect(res).to.equal(1);
            done();
          }
      )
    });

    it("plusOne - inject with 1 argument", function (done) {
      fore(
          plusOne.inject.args(0),
          function (res) {
            expect(res).to.equal(1);
            done();
          }
      )
    });

    it("plus - inject with 2 arguments", function (done) {
      fore(
          plus.inject.args(0, 1),
          function (res) {
            expect(res).to.equal(1);
            done();
          }
      )
    });

    it("one plusOne plus 1 - chain them all", function (done) {
      fore(
          one,
          plusOne,
          plus.inject.args(1),
          function (res) {
            expect(res).to.equal(3);
            done();
          }
      )
    });
  });

  describe("Catching errors", function () {
    it("catch", function (done) {
      fore(
          error.inject.args("msg").catch(function (error) {
            expect(error).to.equal("msg");
            done();
          })
      );
    });

    it("catch - stop propagation on error", function (done) {
      fore(
          error.inject.args("msg").catch(function (error) {
            expect(error).to.equal("msg");
            done();
          }),
          function () {
            expect.fail();
            done();
          }
      );
    });

    it("catch - with dependencies", function (done) {
      fore({
        msg: function (callback) {
          callback(null, "msg")
        },
        error: error.inject.args(fore.get("msg")).catch(function (error) {
          expect(error).to.equal("msg");
          done();
        }),
        _: (function () {
          expect.fail();
          done();
        }).inject.args(fore.get("error"))
      });
    });

    it("general catch - first function throws error", function (done) {
      fore.try(
          error.inject.args("msg"),
          one,
          function () {
            expect.fail();
            done();
          }
      ).catch(function (err) {
        expect(err).to.equal("msg");
        done();
      })
    });

    it("general catch - second function throws error", function (done) {
      fore.try(
          one,
          function (one, cb) {
            expect(one).to.equal(1);
            cb(null, "msg");
          },
          error,
          function () {
            expect.fail();
            done();
          }
      ).catch(function (err) {
        expect(err).to.equal("msg");
        done();
      })
    });

    it("general catch - with dependencies", function (done) {
      fore.try({
        msg: function (callback) {
          callback(null, "msg")
        },
        error: error.inject.args(fore.get("msg")),
        _: (function () {
          expect.fail();
          done();
        }).inject.args(fore.get("error"))
      }).catch(function (error) {
        expect(error).to.equal("msg");
        done();
      });
    });
  });

  describe("Complex dependencies", function () {
    it("plus(one, plusOne(1))", function (done) {
      fore({
        one: one,
        onePlusOne: plusOne.inject.args(1),
        plus: plus.inject.args(fore.get("one"), fore.get("onePlusOne")),
        _: (function (plus) {
          expect(plus).to.equal(3);
          done();
        }).inject.args(fore.get("plus"))

        // maybe some sugar:
        // _: ["plus", function () {
        //   expect(fore.get("plus").to.equal(3);
        // }]
      })
    });

    it("plus(plusOne(1), plusOne(1)) - duplicate dependency", function (done) {
      fore({
        onePlusOne: plusOne.inject.args(1),
        plus: plus.inject.args(fore.get("onePlusOne"), fore.get("onePlusOne")),
        _: (function (plus) {
          expect(plus).to.equal(4);
          done();
        }).inject.args(fore.get("plus"))
      })
    });
  });
});