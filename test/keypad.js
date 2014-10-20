var MockFirmata = require("./mock-firmata"),
  five = require("../lib/johnny-five.js"),
  events = require("events"),
  sinon = require("sinon"),
  Board = five.Board,
  Keypad = five.Keypad,
  board = new Board({
    io: new MockFirmata(),
    debug: false,
    repl: false
  });

board.io.sp = {
  write: function() {

  }
};

exports["Keypad: (Analog)"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();
    this.analogRead = sinon.spy(board.io, "analogRead");
    this.keypad = new Keypad({
      pin: "A1",
      board: board
    });

    done();
  },

  tearDown: function(done) {
    this.clock.restore();
    this.analogRead.restore();
    done();
  },

  press: function(test) {
    test.expect(1);

    var callback = this.analogRead.args[0][1];
    var spy = sinon.spy();

    this.keypad.on("down", spy);

    // Only 3 are valid.
    callback(403);
    callback(322);
    callback(11);
    callback(38);
    callback(512);

    test.equal(spy.callCount, 3);
    test.done();
  },

  hold: function(test) {
    test.expect(1);

    var callback = this.analogRead.args[0][1];
    var spy = sinon.spy();

    this.keypad.on("hold", spy);

    callback(403);
    this.clock.tick(600);
    callback(403);

    test.equal(spy.callCount, 1);
    test.done();
  },

  release: function(test) {
    test.expect(1);

    var callback = this.analogRead.args[0][1];
    var spy = sinon.spy();

    this.keypad.on("release", spy);

    callback(403);
    callback(0);

    test.equal(spy.callCount, 1);
    test.done();
  },

  context: function(test) {
    test.expect(1);

    var callback = this.analogRead.args[0][1];
    var keypad = this.keypad;

    this.keypad.on("press", function() {
      test.equal(this, keypad);
      test.done();
    });
    callback(403);

  }
};

exports["Keypad: (MPR121)"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();
    this.i2cConfig = sinon.spy(board.io, "sendI2CConfig");
    this.i2cWrite = sinon.spy(board.io, "sendI2CWriteRequest");
    this.spWrite = sinon.spy(board.io.sp, "write");
    this.keypad = new Keypad({
      controller: "MPR121",
      address: 0x5A,
      board: board
    });

    done();
  },

  tearDown: function(done) {
    this.i2cConfig.restore();
    this.i2cWrite.restore();
    this.spWrite.restore();
    this.clock.restore();
    done();
  },
  initialize: function(test) {
    test.expect(3);

    test.equal(this.i2cConfig.callCount, 1);
    // 10 settings
    // 26 Thresholds
    test.equal(this.i2cWrite.callCount, 36);
    test.equal(this.spWrite.callCount, 1);

    test.done();
  },
  press: function(test) {
    test.expect(1);

    var spy = sinon.spy();

    this.keypad.on("down", spy);

    // Only 3 are valid.
    this.keypad.io.emit("I2C-reply-90", [ 64, 0 ]);
    this.keypad.io.emit("I2C-reply-90", [ 2, 0 ]);
    this.keypad.io.emit("I2C-reply-90", [ 4, 0, 0 ]);
    this.keypad.io.emit("I2C-reply-90", [ 4 ]);
    this.keypad.io.emit("I2C-reply-90", [ 4, 0 ]);

    test.equal(spy.callCount, 3);
    test.done();
  },

  hold: function(test) {
    test.expect(1);

    var spy = sinon.spy();

    this.keypad.on("hold", spy);

    this.keypad.io.emit("I2C-reply-90", [ 64, 0 ]);
    this.clock.tick(600);
    this.keypad.io.emit("I2C-reply-90", [ 64, 0 ]);

    test.equal(spy.callCount, 1);
    test.done();
  },

  release: function(test) {
    test.expect(1);

    var spy = sinon.spy();

    this.keypad.on("release", spy);

    this.keypad.io.emit("I2C-reply-90", [ 64, 0 ]);
    this.keypad.io.emit("I2C-reply-90", [ 0, 0 ]);

    test.equal(spy.callCount, 1);
    test.done();
  },
};
