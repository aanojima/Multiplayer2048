function KeyboardInputManager(socket) {
  this.game_id = document.getElementsByName("game_id")[0].content;
  this.events = {};
  this.socket = socket;
  this.listen();
}

KeyboardInputManager.prototype.on = function (event, callback) {
  if (!this.events[event]) {
    this.events[event] = [];
  }
  this.events[event].push(callback);
};

KeyboardInputManager.prototype.emit = function (event, data) {
  var callbacks = this.events[event];
  if (callbacks) {
    callbacks.forEach(function (callback) {
      callback(data);
    });
  }
};

KeyboardInputManager.prototype.listen = function () {
  var self = this;

  var map = {
    38: 0, // Up
    39: 1, // Right
    40: 2, // Down
    37: 3, // Left
    75: 0, // vim keybindings
    76: 1,
    74: 2,
    72: 3,
    87: 0, // W
    68: 1, // D
    83: 2, // S
    65: 3  // A
  };

  document.addEventListener("keydown", function (event) {
    var modifiers = event.altKey || event.ctrlKey || event.metaKey ||
                    event.shiftKey;
    var mapped    = map[event.which];
    if (!modifiers) {
      if (mapped !== undefined) {
        event.preventDefault();
        var data = {
          game_id : self.game_id,
          instruction : "move",
          direction : mapped,
        }

        self.socket.emit('message', data);
      }

      if (event.which === 32) self.restart.bind(self)(event);
    }
  });

  var instructRestart = function(event){
    var data = {};
    data.game_id = self.game_id;
    data.instruction = "restart";
    self.socket.emit('message', data);
  }

  var instructKeepPlaying = function(event){
    var data = {};
    data.game_id = self.game_id;
    data.instruction = "keepPlaying";
    self.socket.emit('message', data);
  }

  var retry = document.querySelector(".retry-button");
  retry.addEventListener("click", this.restart.bind(this));
  retry.addEventListener("click", instructRestart)
  retry.addEventListener("touchend", instructRestart);

  var keepPlaying = document.querySelector(".keep-playing-button");
  keepPlaying.addEventListener("click", this.keepPlaying.bind(this));
  keepPlaying.addEventListener("click", instructKeepPlaying);
  keepPlaying.addEventListener("touchend", instructKeepPlaying);

  // Listen to swipe events
  var touchStartClientX, touchStartClientY;
  var gameContainer = document.getElementsByClassName("game-container")[0];

  gameContainer.addEventListener("touchstart", function (event) {
    if (event.touches.length > 1) return;

    touchStartClientX = event.touches[0].clientX;
    touchStartClientY = event.touches[0].clientY;
    event.preventDefault();
  });

  gameContainer.addEventListener("touchmove", function (event) {
    event.preventDefault();
  });

  gameContainer.addEventListener("touchend", function (event) {

    if (event.touches.length > 0) return;

    var dx = event.changedTouches[0].clientX - touchStartClientX;
    var absDx = Math.abs(dx);

    var dy = event.changedTouches[0].clientY - touchStartClientY;
    var absDy = Math.abs(dy);

    if (Math.max(absDx, absDy) > 10) {
      // (right : left) : (down : up)
      var data = {
        instruction : "move",
        game_id : self.game_id,
        direction : absDx > absDy ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0),
      }
      self.socket.emit('message', data);
    }
  });
};

KeyboardInputManager.prototype.restart = function (event) {
  event.preventDefault();
  this.emit("restart");
};

KeyboardInputManager.prototype.keepPlaying = function (event) {
  event.preventDefault();
  this.emit("keepPlaying");
};
