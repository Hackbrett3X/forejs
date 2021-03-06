const expect = require("chai").expect;
const it = require("mocha").it;
const describe = require("mocha").describe;

const forePath = process.argv.length === 4 ? process.argv[3] : "src/forejs";
console.log("Testing file: '" + forePath + "'");
const fore = require(require("path").join("../", forePath));

function delay(res, callback) {
  setTimeout(function () {
    callback(null, res);
  }, Math.random() * 10);
}

function one(callback) {
  delay(1, callback);
}

function plusOne(n, callback) {
  delay(n + 1, callback);
}

function plus(n, m, callback) {
  delay(n + m, callback);
}

function toUpperCase(callback) {
  delay(this.toUpperCase(), callback);
}

function error(error, callback) {
  setTimeout(function () {
    callback(error)
  }, Math.random() * 10)
}

describe("General functionality", function () {

  describe("Chain mode/inject", function () {
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
    it("Chain mode", function (done) {
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

    it("Auto mode", function (done) {
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

    it("Auto mode - combined with args", function (done) {
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

    it("catch - auto mode", function (done) {
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

    it("general catch - auto mode", function (done) {
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

    // this functionality was removed due to performance issues
    // it("throw", function (done) {
    //   fore.try(
    //       function () {
    //         throw new Error("msg")
    //       },
    //       function () {
    //         expect.fail();
    //       }
    //   ).catch(function (err) {
    //     expect(err.message).to.equal("msg");
    //     done();
    //   })
    // })
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

  describe("Support for synchronous functions", function () {
    function oneSync() {
      return 1;
    }
    function plusOneSync(n) {
      return n + 1;
    }
    function plusSync(n, m) {
      return n + m;
    }

    it("Chain mode", function (done) {
      fore(
          oneSync,
          plusOneSync,
          plusOne,
          plusSync.inject.args(1),
          function (n) {
            expect(n).to.equal(4);
            done();
          }
      );
    });

    it("Auto mode", function (done) {
      fore({
        one: oneSync,
        two: ["one", plusOneSync],
        three: ["two", plusOne],
        four: [1, "three", plusSync],
        _: ["four", function (n) {
          expect(n).to.equal(4);
          done();
        }]
      });
    });
  });

  describe("nesting", function () {
    it("Chain mode", function (done) {
      fore(
          one,
          function (one, callback) {
            fore(
                plusOne.inject.args(one),
                plusOne,
                // we cannot write:
                // callback.inject.args(null)
                // because callback would be called with three arguments (null, 3, callback). The "callback" argument
                // is automatically added by fore
                function (three) {
                  callback(null, three);
                }
            )
          },
          plusOne,
          function (n) {
            expect(n).to.equal(4);
            done();
          }
      )
    });

    it("Auto mode", function (done) {
      fore({
        one: one,
        three: ["one", function (one, callback) {
          fore({
            two: plusOne.inject.args(one),
            three: ["two", plusOne],
            // same here
            _: ["three", function (three) {
              callback(null, three)
            }]
          })
        }],
        four: ["three", plusOne],
        _: ["four", function (n) {
          expect(n).to.equal(4);
          done();
        }]
      })
    });

  });

  describe("multiple 'return values'", function () {
    it("Chain mode", function (done) {
      fore(
          function (callback) {
            callback(null, 1, 2, 3);
          },
          function (one, two, three, callback) {
            expect(one).equal(1);
            expect(two).equal(2);
            expect(three).equal(3);
            expect(callback).to.be.a("function");
            done();
          }
      )
    });

    it("Chain mode and this injection", function (done) {
      fore(
          function (callback) {
            callback(null, "a", "b", "c")
          },
          toUpperCase.inject.this(),
          function (a) {
            expect(a).equal("A");
            done();
          }
      )
    });

    it("Auto mode", function (done) {
      fore({
        oneTwoThree: function (callback) {
          callback(null, 1, 2, 3);
        },
        tenTwentyThirty: function (callback) {
          callback(null, 10, 20, 30);
        },
        _: ["oneTwoThree", "tenTwentyThirty", function (oneTwoThree, tenTwentyThirty, callback) {
          expect(oneTwoThree).to.have.members([1, 2, 3]);
          expect(tenTwentyThirty).to.have.members([10, 20, 30]);
          expect(callback).to.be.a("function");
          done();
        }]
      })
    })
  })
});

describe("Error reports", function () {
  it("unbound identifier", function () {
    expect(function() {
      fore({
        _: ["a", function (a) {
          expect.fail();
        }]
      })
    }).to.throw(/Unbound identifier/);
  })
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

  describe("Chain mode", function () {
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

  describe("Auto mode", function () {
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

    it("Auto mode", function (done) {
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

  describe("direct promises", function () {
    it("Chain mode", function (done) {
      fore(
          promiseOne(),
          function (one) {
            expect(one).to.equal(1);
            done();
          }
      )
    });

    it("Auto mode", function (done) {
      fore({
        one: promiseOne(),
        _: ["one", function (one) {
          expect(one).to.equal(1);
          done();
        }]
      });
    });

  })
});

describe("syntactic sugar: injections as array", function () {
  it("Chain mode", function (done) {
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

  it("general catch and array syntactic sugar", function (done) {
    fore.try(
        [1, function (one, callback) {
          callback("msg");
        }]
    ).catch(function (err) {
      expect(err).equal("msg");
      done();
    });
  });

  describe("Multiple functions", function () {
    it("Without injections", function (done) {
      fore({
        two: [one, plusOne],
        _: ["two", function (two) {
          expect(two).equal(2);
          done();
        }]
      });
    });

    it("With injections", function (done) {
      fore({
        one: one,
        three: ["one", plusOne, plusOne],
        _: ["three", function (three) {
          expect(three).equal(3);
          done();
        }]
      });
    });

    it("With (nested) injections", function (done) {
      fore({
        one: one,
        three: ["one", plusOne, plus.inject.args(1)],
        _: ["three", function (three) {
          expect(three).equal(3);
          done();
        }]
      });
    });
  });
});

describe("each", function () {
  function* oneTwoThree() {
    yield* [1, 2, 3];
  }


  describe("Chain mode", function () {
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
        onesDelayed: ["ones", delay],
        tensDelayed: ["tens", delay],
        hundredsDelayed: ["hundreds", delay],
        _: ["onesDelayed", "tensDelayed", "hundredsDelayed", function (ones, tens, hundreds) {
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

  describe("Promise iterators", function () {
    function* oneTwoThreePromise() {
      yield Promise.resolve(1);
      yield Promise.resolve(2);
      yield Promise.resolve(3);
    }

    it("Chain mode", function (done) {
      fore(
          fore.each(oneTwoThreePromise),
          (function () {
            let counter = 0;
            return function (n) {
              expect(n).to.be.oneOf([1, 2, 3]);
              counter++;
              if (counter === 3) {
                done();
              }
              if (counter > 3) {
                expect.fail();
              }
            }
          })()
      )
    });

    it("Complex", function (done) {
      fore({
        numbers: fore.each(oneTwoThreePromise),
        _: ["numbers", (function () {
          let counter = 0;
          return function (n) {
            expect(n).to.be.oneOf([1, 2, 3]);
            counter++;
            if (counter === 3) {
              done();
            }
            if (counter > 3) {
              expect.fail();
            }
          }
        })()]
      })
    });

    it("catch", function (done) {
      fore(
          fore.each((function* () {
            yield Promise.reject("msg");
          }).inject.catch(function (err) {
            expect(err).to.equal("msg");
            done();
          })),
          function () {
            expect.fail();
          }
      )
    });
    
    it("general catch", function (done) {
      fore.try(
          fore.each(function* () {
            yield Promise.reject("msg");
          }),
          function () {
            expect.fail();
          }
      ).catch(function (err) {
        expect(err).to.equal("msg");
        done();
      })
    });

    it("last promise rejected", function (done) {
      let counter = 0;
      function ok() {
        if (counter++ === 1) {
          done();
        }
      }
      fore.try(
          fore.each(function* () {
            yield Promise.resolve(1);
            yield Promise.resolve(2);
            yield Promise.reject("msg");
          }),
          fore.collect(function (res) {
            expect(res).to.have.members([1, 2]);
            ok();
          })
      ).catch(function (err) {
        expect(err).to.equal("msg");
        ok();
      })
    })
  });
});

describe("collect", function () {
  describe("Chain mode", function () {
    it("1-dimensional", function (done) {
      fore(
          fore.each([1, 2, 3]),
          delay,
          fore.collect(function (values) {
            expect(values).to.have.members([1, 2, 3]);
            done();
          })
      )
    });

    it("proper propagation", function (done) {
      fore(
          fore.each([1, 2, 3]),
          fore.collect(function (res, callback) {
            callback(null, res);
          }),
          delay,
          function (values) {
            expect(values).to.have.members([1, 2, 3]);
            done();
          }
      )
    });
  });

  describe("Auto mode", function () {
    it("1-dimensional", function (done) {
      fore({
        "ones": fore.each([1, 2, 3]),
        "onesDelayed": ["ones", delay],
        "_": fore.collect(["onesDelayed", function (ones) {
          expect(ones).to.have.members([1, 2, 3]);
          done();
        }])
      })
    });

    it("3-dimensional", function (done) {
      fore({
        ones: fore.each([1, 2, 3]),
        tens: fore.each([10, 20, 30]),
        hundreds: fore.each([100, 200, 300]),
        onesDelayed: ["ones", delay],
        tensDelayed: ["tens", delay],
        hundredsDelayed: ["hundreds", delay],
        _: fore.collect(["onesDelayed", "tensDelayed", "hundredsDelayed", function (ones, tens, hundreds) {
          expect(ones).to.have.members([1, 2, 3]);
          expect(tens).to.have.members([10, 20, 30]);
          expect(hundreds).to.have.members([100, 200, 300]);

          done();
        }])
      })
    });
  })
});

describe("reduce", function () {
  describe("Chain mode", function () {
    it("1-dimensional", function (done) {
      fore(
          fore.each([1, 2, 3]),
          delay,
          fore.reduce(function (array, value, callback) {
            callback(null, array.concat(value));
          }, []),
          function (values) {
            expect(values).to.have.members([1, 2, 3]);
            done();
          }
      )
    });
  });

  describe("Auto mode", function () {
    it("1-dimensional", function (done) {
      fore({
        "ones": fore.each([1, 2, 3]),
        "onesDelayed": ["ones", delay],
        "array": fore.reduce(["onesDelayed", function (array, n, callback) {
          callback(null, array.concat(n));
        }], []),
        "_": ["array", function (array) {
          expect(array).to.have.members([1, 2, 3]);
          done();
        }]
      })
    });

    it("3-dimensional", function (done) {
      fore({
        ones: fore.each([1, 2, 3]),
        tens: fore.each([10, 20, 30]),
        hundreds: fore.each([100, 200, 300]),
        onesDelayed: ["ones", delay],
        tensDelayed: ["tens", delay],
        hundredsDelayed: ["hundreds", delay],
        array: fore.reduce(["onesDelayed", "tensDelayed", "hundredsDelayed", function (array, ones, tens, hundreds, callback) {
          callback(null, array.concat(ones + tens + hundreds));
        }], []),
        "_": ["array", function (array) {
          expect(array).to.have.members([
            111, 112, 113, 121, 122, 123, 131, 132, 133,
            211, 212, 213, 221, 222, 223, 231, 232, 233,
            311, 312, 313, 321, 322, 323, 331, 332, 333
          ]);
          done();
        }]
      })
    });
  });
});

describe("Or-injections", function () {
  it("Simple", function (done) {
    let received = [];
    fore({
      a: () => "a",
      b: () => "b",
      _: ["a|b", function (aOrB) {
        if (received.indexOf(aOrB) >= 0) {
          expect.fail();
          return done();
        } else {
          received.push(aOrB);
        }

        if (received.length === 2) {
          expect(received).to.have.members(["a", "b"]);
          done();
        }
      }]
    });
  });

  it("This injection", function (done) {
    let received = [];
    fore({
      a: () => "a",
      b: () => "b",
      _: (function () {
        if (received.indexOf(this) >= 0) {
          expect.fail();
          return done();
        } else {
          received.push(this + ""); // somehow the test framework thinks "this" is {0: "a"} instead of just "a"
        }

        if (received.length === 2) {
          expect(received).to.have.members(["a", "b"]);
          done();
        }
      }).inject.this(fore.ref("a|b"))
    });
  });

  it("each/collect", function (done) {
    fore({
      ab: fore.each(["a", "b"]),
      c: () => "c",
      abDelayed: ["ab", delay],
      cDelayed: ["c", delay],
      _: fore.collect(["abDelayed|cDelayed", function (chars) {
          expect(chars).to.have.members(["a", "b", "c"]);
          done();
      }])
    });
  });

  it("each/reduce", function (done) {
    fore({
      ab: fore.each(["a", "b"]),
      c: () => "c",
      chars: fore.reduce(["ab|c", (array, char) => array.concat(char)], []),
      _: ["chars", function (chars) {
        expect(chars).to.have.members(["a", "b", "c"]);
        done();
      }]
    });
  });
});

describe("config", function () {
  it("dontHackFunctionPrototype", function (done) {
    expect(Object.getOwnPropertyDescriptor(Function.prototype, "inject").get).to.be.a("function");
    fore.config({dontHackFunctionPrototype: true});
    expect(Function.prototype.inject).to.be.a("undefined");
    expect(fore.inject).to.be.a("function");

    fore(
        one,
        fore.inject(plus).args(1),
        two => {
          expect(two).equal(2);
          fore.config({dontHackFunctionPrototype: false});
          expect(Object.getOwnPropertyDescriptor(Function.prototype, "inject").get).to.be.a("function");
          done();
        }
    )
  });
});