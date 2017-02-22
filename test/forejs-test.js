const expect = require("chai").expect;
const it = require("mocha").it;
const describe = require("mocha").describe;

const fore = require("../src/forejs");

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

function toUpperCase(callback) {
  const str = this;
  setTimeout(function () {
    callback(null, str.toUpperCase());
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

  describe("This injections", function () {
    it("simple chain", function (done) {
      fore(
          function (callback) {
            callback(null, "abc")
          },
          toUpperCase.inject.this(),
          function (res) {
            expect(res).to.equal("ABC");
            done();
          }
      )
    });

    it("dependencies", function (done) {
      fore({
        str: function (callback) {
          callback(null, "abc")
        },
        upperCase: toUpperCase.inject.this(fore.ref("str")),
        _: (function (res) {
          expect(res).to.equal("ABC");
          done();
        }).inject.args(fore.ref("upperCase"))
      })
    });

    it("dependencies - combined with args", function (done) {
      fore({
        str: function (callback) {
          callback(null, "abc")
        },
        res: (function (str, callback) {
          callback(null, this.toUpperCase() + str.toUpperCase());
        }).inject.this(fore.ref("str")).args(fore.ref("str")),
        _: (function (res) {
          expect(res).to.equal("ABCABC");
          done();
        }).inject.args(fore.ref("res"))
      })
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
        error: error.inject.args(fore.ref("msg")).catch(function (error) {
          expect(error).to.equal("msg");
          done();
        }),
        _: (function () {
          expect.fail();
          done();
        }).inject.args(fore.ref("error"))
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
        error: error.inject.args(fore.ref("msg")),
        _: (function () {
          expect.fail();
          done();
        }).inject.args(fore.ref("error"))
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
        plus: plus.inject.args(fore.ref("one"), fore.ref("onePlusOne")),
        _: (function (plus) {
          expect(plus).to.equal(3);
          done();
        }).inject.args(fore.ref("plus"))

        // maybe some sugar:
        // _: ["plus", function () {
        //   expect(fore.get("plus").to.equal(3);
        // }]
      })
    });

    it("plus(plusOne(1), plusOne(1)) - duplicate dependency", function (done) {
      fore({
        onePlusOne: plusOne.inject.args(1),
        plus: plus.inject.args(fore.ref("onePlusOne"), fore.ref("onePlusOne")),
        _: (function (plus) {
          expect(plus).to.equal(4);
          done();
        }).inject.args(fore.ref("plus"))
      })
    });

    it("plus(plusOne(one), one)", function (done) {
      fore({
        one: one,
        two: plusOne.inject.args(fore.ref("one")),
        three: plus.inject.args(fore.ref("two"), fore.ref("one")),
        _: (function (res) {
          expect(res).to.equal(3);
          done();
        }).inject.args(fore.ref("three"))
      })
    })
  });
});

describe("Promise support", function () {
  function promiseOne() {
    return new Promise(function (resolve, reject) {
      one(function (err, res) {
        resolve(res);
      });
    });
  }

  function promisePlusOne(n) {
    return new Promise(function (resolve, reject) {
      plusOne(n, function (err, res) {
        resolve(res);
      });
    });
  }

  function promisePlus(n, m) {
    return new Promise(function (resolve, reject) {
      plus(n, m, function (err, res) {
        resolve(res);
      });
    });
  }

  function promiseError() {
    return new Promise(function (resolve, reject) {
      error("msg", function (err, res) {
        reject(err);
      });
    });
  }

  describe("simple chain", function () {
    it("one", function (done) {
      fore(
          promiseOne,
          function (res) {
            expect(res).to.equal(1);
            done();
          }
      )
    });

    it("one plusOne", function (done) {
      fore(
          promiseOne,
          promisePlusOne,
          function (res) {
            expect(res).to.equal(2);
            done();
          }
      )
    });

    it("one plusOne plus(1)", function (done) {
      fore(
          promiseOne,
          promisePlusOne,
          promisePlus.inject.args(1),
          function (res) {
            expect(res).to.equal(3);
            done();
          }
      )
    });
  });

  describe("Dependencies", function () {
    it("one", function (done) {
      fore({
        one: promiseOne,
        _: (function (res) {
          expect(res).to.equal(1);
          done();
        }).inject.args(fore.ref("one"))
      })
    });

    it("one plusOne", function (done) {
      fore({
        one: promiseOne,
        two: promisePlusOne.inject.args(fore.ref("one")),
        _: (function (res) {
          expect(res).to.equal(2);
          done();
        }).inject.args(fore.ref("two"))
      })
    });

    it("one plusOne plus(1)", function (done) {
      fore({
        one: promiseOne,
        two: promisePlusOne.inject.args(fore.ref("one")),
        three: promisePlus.inject.args(fore.ref("two"), 1),
        _: (function (res) {
          expect(res).to.equal(3);
          done();
        }).inject.args(fore.ref("three"))
      })
    });
  });

  describe("catch", function () {
    it("simple", function (done) {
      fore(
          promiseError.inject.args("msg").catch(function (err) {
            expect(err).to.equal("msg");
            done();
          }),
          function () {
            expect.fail();
            done();
          }
      )
    });

    it("Dependencies", function (done) {
      fore({
        err: promiseError.inject.args("msg").catch(function (err) {
          expect(err).to.equal("msg");
          done();
        }),
        _: (function () {
          expect.fail();
          done();
        }).inject.args(fore.ref("err"))
      })
    });

    it("general", function (done) {
      fore.try(
          promiseError.inject.args("msg"),
          function () {
            expect.fail();
            done();
          }
      ).catch(function (err) {
        expect(err).to.equal("msg");
        done();
      })
    });
  });
});

describe("syntactic sugar: injections as array", function () {
  it("simple chain", function (done) {
    fore(
        one,
        [1, plus],
        function (two) {
          expect(two).to.equal(2);
          done();
        }
    )
  });

  it("end position", function (done) {
    fore({
      one: one,
      _: ["one", function (one) {
        expect(one).to.equal(1);
        done();
      }]
    })
  });

  it("middle position", function (done) {
    fore({
      one: one,
      two: ["one", function (one, callback) {
        callback(null, one + 1);
      }],
      _: ["one", "two", function (one, two, callback) {
        expect(one).to.equal(1);
        expect(two).to.equal(2);
        expect(callback).to.be.a("function");
        expect(arguments.length).to.equal(3);
        done();
      }]
    })
  });

  it("mixed refs and real arguments", function (done) {
    fore({
      one: one,
      two: [1, "one", plus],
      _: ["two", function (two) {
        expect(two).to.equal(2);
        done();
      }]
    })
  });
});

describe("Iterator", function () {
  function* oneTwoThree() {
    yield* [1, 2, 3];
  }


  describe("Simple chain", function () {
    it("array", function (done) {
      fore(
          fore.each([1, 2, 3]),
          (function () {
            let counter = 1;
            return function (res) {
              expect(res).to.equal(counter++);
              if (res === 3) {
                done();
              }
            }
          })()
      )
    });

    it("oneTwoThree", function (done) {
      fore(
          fore.each(oneTwoThree),
          (function () {
            let counter = 1;
            return function (res) {
              expect(res).to.equal(counter++);
              if (res === 3) {
                done();
              }
            }
          })()
      )
    });

    it("proper propagation", function (done) {
      fore(
          fore.each(oneTwoThree),
          (function () {
            let counter = 1;
            return function (res, callback) {
              expect(res).to.equal(counter++);
              callback(null, res + 1);
            }
          })(),
          (function () {
            let counter = 2;
            return function (res) {
              expect(res).to.equal(counter++);
              if (res === 4) {
                done();
              }
            }
          })()
      )
    });

    it("chained fore.each", function (done) {
      fore(
          fore.each(oneTwoThree),
          fore.each(function* (n) {
            yield* [n, n + 10, n + 20]
          }),
          (function () {
            let i = 0;
            let values = [1, 11, 21, 2, 12, 22, 3, 13, 23];
            return function (res) {
              expect(res).to.equal(values[i++]);
              if (i === values.length) {
                done();
              }
            }
          })()
      )
    });
  });

  describe("Complex", function () {
    it("2-dimensional", function (done) {
      let counter = 0;
      let expectedValues = [11, 12, 13, 21, 22, 23, 31, 32, 33];
      fore({
        ones: fore.each(oneTwoThree),
        tens: fore.each([10, 20, 30]),
        _: ["ones", "tens", function (ones, tens) {
          let index = expectedValues.indexOf(ones + tens);
          if (index < 0) {
            expect.fail();
            done();
          } else {
            counter++;
            expectedValues[index] = true;
          }

          if (counter === expectedValues.length) {
            expect(expectedValues.every((t) => t)).to.equal(true);
            done();
          }
        }]
      })
    });

    it("3-dimensional", function (done) {
      let counter = 0;
      let expectedValues = [
        111, 112, 113, 121, 122, 123, 131, 132, 133,
        211, 212, 213, 221, 222, 223, 231, 232, 233,
        311, 312, 313, 321, 322, 323, 331, 332, 333
      ];
      fore({
        ones: fore.each(oneTwoThree),
        tens: fore.each([10, 20, 30]),
        hundreds: fore.each({
          [Symbol.iterator]: function* () {
            yield* [100, 200, 300];
          }
        }),
        _: ["ones", "tens", "hundreds", function (ones, tens, hundreds) {
          let index = expectedValues.indexOf(ones + tens + hundreds);
          if (index < 0) {
            expect.fail();
            done();
          } else {
            counter++;
            expectedValues[index] = true;
          }

          if (counter === expectedValues.length) {
            expect(expectedValues.every((t) => t)).to.equal(true);
            done();
          }
        }]
      })
    });
  });
});
