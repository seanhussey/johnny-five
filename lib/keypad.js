var Emitter = require("events").EventEmitter;
var util = require("util");
var Board = require("../lib/board.js");
var __ = require("../lib/fn.js");
var Pins = Board.Pins;
var map = Board.map;

var priv = new Map();

var aliases = {
  down: ["down", "press", "tap", "impact", "hit"],
  up: ["up", "release"],
  "hold": ["hold"]
};

var trigger = function(key, value) {
  aliases[key].forEach(function(type) {
    this.emit(type, value);
  }, this);
};

var Controllers = {
  MPR121QR2: {
    initialize: function(opts) {
      var state = priv.get(this);
      var defs = require("../lib/definitions/mpr121.js");
      var address = opts.address;
      var hold = opts.holdTime ? opts.holdTime : 500;
      var keys = Object.keys(defs.keys).length;
      var i;

      var i2cWrite = function(reg, data) {
        this.io.sendI2CWriteRequest(address, [reg, data]);
      }.bind(this);

      var i2cContinuousRead = function(callback) {
        this.io.sp.write(
          new Buffer(
            [
              0xF0, 0x76, address, 16,
              // Send dummy slave register
              // https://github.com/firmata/arduino/pull/156
              // https://github.com/firmata/arduino/pull/155
              -1 & 0x7F, (-1 >> 7) & 0x7F,
              // Request 2 bytes
              2 & 0x7F, (2 >> 7) & 0x7F,
              0xF7
            ]
          )
        );
        this.io.on("I2C-reply-" + address, callback.bind(this));
      }.bind(this);

      this.io.sendI2CConfig();

      i2cWrite(defs.MHD_RISING, 0x01);
      i2cWrite(defs.NHD_AMOUNT_RISING, 0x01);
      i2cWrite(defs.NCL_RISING, 0x00);
      i2cWrite(defs.FDL_RISING, 0x00);
      i2cWrite(defs.MHD_FALLING, 0x01);
      i2cWrite(defs.NHD_AMOUNT_FALLING, 0x01);
      i2cWrite(defs.NCL_FALLING, 0xFF);
      i2cWrite(defs.FDL_FALLING, 0x02);

      for (i = 0; i < 13; i++) {
        i2cWrite(defs.ELE0_TOUCH_THRESHOLD + (i << 1), 40);
        i2cWrite(defs.ELE0_RELEASE_THRESHOLD + (i << 1), 20);
      }

      i2cWrite(defs.FILTER_CONFIG, 0x04);
      i2cWrite(defs.ELECTRODE_CONFIG, 0x0C);

      state.touches = touches(keys);

      i2cContinuousRead(function(data) {
        if (data.length === 2) {
          var LSB = data[0];
          var MSB = data[1];
          // Touch data is 16bit
          var touched = (MSB << 8) | LSB;

          for (var i = 0; i < keys; i++) {
            var key = defs.keys[i];
            if (touched & (1 << i)) {

              if (state.touches[i] === 0) {

                state.timeout = Date.now() + hold;
                trigger.call(this, "down", key);

              } else if (state.touches[i] === 1) {
                if (state.timeout !== null && Date.now() > state.timeout) {

                  state.timeout = Date.now() + hold;
                  trigger.call(this, "hold", key);

                }
              }

              state.touches[i] = 1;
            } else {
              if (state.touches[i] === 1) {

                state.timeout = null;
                trigger.call(this, "up", key);

              }

              state.touches[i] = 0;
            }
          }
        }
      });
    }
  },
};



var Devices = {
  ANALOG: {
    scale: {
      "3.3": { bottom: 26, step: 58, top: 721 },
      "5": { bottom: 17, step: 40, top: 496 }
    },
    initialize: function(opts) {
      var state = priv.get(this);
      var vref = opts.vref ? opts.vref : 5;
      var hold = opts.holdTime ? opts.holdTime : 500;
      var keys = opts.keys ? opts.keys : 12;
      var scale = Devices.ANALOG.scale[vref];

      state.touches = touches(keys);

      this.io.pinMode(this.pin, this.io.MODES.ANALOG);
      this.io.analogRead(this.pin, function(data) {

        var value = data < scale.bottom || data > scale.top ?
          null : (keys - ((data - scale.bottom) / scale.step)) | 0;

        for (var i = 0; i < keys; i++) {
          var key = i + 1;
          if (i === value) {

            if (state.touches[i] === 0) {

              state.timeout = Date.now() + hold;
              trigger.call(this, "down", key);

            } else if (state.touches[i] === 1) {
              if (state.timeout !== null && Date.now() > state.timeout) {

                state.timeout = Date.now() + hold;
                trigger.call(this, "hold", key);

              }
            }

            state.touches[i] = 1;
          } else {
            if (state.touches[i] === 1) {

              state.timeout = null;
              trigger.call(this, "up", key);

            }
            state.touches[i] = 0;
          }
        }
      }.bind(this));
    }
  },
  DIGITAL: {
    initialize: function() {}
  },
  DEFAULT: {
    initialize: function() {}
  }
};

// Otherwise known as...
Controllers["MPR121"] = Controllers.MPR121QR2;

function touches(length) {
  return Array.from({ length: length }, function() {
    return 0;
  });
}

function Keypad(opts) {
  var controller;
  var pinValue;
  var state;

  if (!(this instanceof Keypad)) {
    return new Keypad(opts);
  }

  pinValue = typeof opts === "object" ? opts.pin : opts;

  // Initialize a Device instance on a Board
  Board.Device.call(
    this, this.opts = Board.Options(opts)
  );

  state = {
    touches: null,
    timeout: null,
  };

  priv.set(this, state);

  if (pinValue && pinValue.startsWith("A")) {
    Devices.ANALOG.initialize.call(this, opts);
  } else {
    Devices.DIGITAL.initialize.call(this, opts);
  }

  if (typeof opts.controller === "string") {
    controller = Controllers[opts.controller];

    if (controller !== undefined) {
      controller.initialize.call(this, opts);
    }
  }
}

util.inherits(Keypad, Emitter);

module.exports = Keypad;
