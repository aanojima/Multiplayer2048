function GameManager(size, InputManager, Actuator, ScoreManager) {

  this.game_id      = document.getElementsByName("game_id")[0].content;

  // var socket = new WebSocket("ws://athena.dialup.mit.edu:8080", "instruction-protocol");
  // var socket = new WebSocket("ws://localhost:5000", this.game_id);
  var socket = io();

  this.size         = size; // Size of the grid
  this.inputManager = new InputManager(socket);
  this.scoreManager = new ScoreManager;
  this.actuator     = new Actuator;

  this.startTiles   = 2;

  this.inputManager.on("move", this.move.bind(this));
  this.inputManager.on("restart", this.restart.bind(this));
  this.inputManager.on("keepPlaying", this.keepGoing.bind(this));

  var self = this;

  socket.on('loadGame', function(data) {
    var cells = data.cells;
    var score = data.score;
    self.restore(cells, score);
    if (!self.movesAvailable()) {
      self.over = true; // Game over!
      self.actuate(); // Restart Menu
    } else {
      for (var i = 0; i < self.size; i++){
        for (var j = 0; j < self.size; j++){
          if (self.grid.cells[i][j] && self.grid.cells[i][j].value >= 2048){
            self.won = true; // Already Won
            break;
          }
        }
      }
      if (self.won){
        self.actuate(); // Keep Playing vs. Try Again Menu
      }
    }
  });

  socket.on('message', function(data) {
    if (data.instruction == "move"){
      // move      
      var newTile = data.newTile;
      var mapped = parseInt(data.direction);
      if (mapped !== undefined) {
        self.inputManager.emit("move", {direction : mapped, newX : newTile.x, newY : newTile.y, newValue : newTile.value});
      }
    } else if (data.instruction == "restart"){
      // restart
      var cells = data.cells;
      var score = 0;
      self.inputManager.emit("restart", {cells : cells, score : score});
    } else if (data.instruction == "keepPlaying"){
      // keep playing
      self.inputManager.emit("keepPlaying");
    }
  });

}

// Restart the game
GameManager.prototype.restart = function (data) {
  this.actuator.continue();
  this.restore(data.cells, data.score);
};

// Keep playing after winning
GameManager.prototype.keepGoing = function () {
  this.keepPlaying = true;
  this.actuator.continue();
};

GameManager.prototype.isGameTerminated = function () {
  if (this.over || (this.won && !this.keepPlaying)) {
    return true;
  } else {
    return false;
  }
};

// Set up the game
GameManager.prototype.setup = function () {
  this.grid        = new Grid(this.size);

  this.score       = 0;
  this.over        = false;
  this.won         = false;
  this.keepPlaying = false;

  // Add the initial tiles
  this.addStartTiles();

  // Update the actuator
  this.actuate();
};

// Restore the game
GameManager.prototype.restore = function(cells, score){
  this.grid         = new Grid(this.size);
  
  this.score        = score;
  this.over         = false;
  this.won          = false;
  this.keepPlaying  = false;

  // Add the saved tiles
  this.addSavedTiles(cells);

  // Update the actuator
  this.actuate();
};

GameManager.prototype.addSavedTiles = function (cells) {
  if (cells.length != this.size){
    return;
  }
  for (var i = 0; i < cells.length; i++){
    if (cells[i].length != this.size){
      return;
    }
    for (var j = 0; j < cells.length; j++){
      if (cells[i][j]){
        this.addTile(i, j, cells[i][j].value);  
      }
    }
  }
}

GameManager.prototype.addTile = function (x, y, value) {
  if (this.grid.cellsAvailable()){
    var tile = new Tile({x : x, y : y}, value);
    this.grid.insertTile(tile);  
  }
}

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function () {
  for (var i = 0; i < this.startTiles; i++) {
    this.addRandomTile();
  }
};

// Adds a tile in a random position
GameManager.prototype.addRandomTile = function () {
  if (this.grid.cellsAvailable()) {
    var value = Math.random() < 0.9 ? 2 : 4;
    var tile = new Tile(this.grid.randomAvailableCell(), value);

    this.grid.insertTile(tile);
  }
};

// Sends the updated grid to the actuator
GameManager.prototype.actuate = function () {
  if (this.scoreManager.get() < this.score) {
    this.scoreManager.set(this.score);
  }
  this.actuator.actuate(this.grid, {
    score:      this.score,
    over:       this.over,
    won:        this.won,
    bestScore:  this.scoreManager.get(),
    terminated: this.isGameTerminated()
  });

};

// Save all tile positions and remove merger info
GameManager.prototype.prepareTiles = function () {
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};

// Move a tile and its representation
GameManager.prototype.moveTile = function (tile, cell) {
  this.grid.cells[tile.x][tile.y] = null;
  this.grid.cells[cell.x][cell.y] = tile;
  tile.updatePosition(cell);
};

// Move tiles on the grid in the specified direction
GameManager.prototype.move = function (data) {
  // 0: up, 1: right, 2:down, 3: left
  var self = this;

  var direction = data.direction;
  var newX = data.newX;
  var newY = data.newY;
  var newValue = data.newValue;

  if (this.isGameTerminated()) return; // Don't do anything if the game's over

  var cell, tile;

  var vector     = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved      = false;

  // Save the current tile positions and remove merger information
  this.prepareTiles();

  // Traverse the grid in the right direction and move tiles
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = { x: x, y: y };
      tile = self.grid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPosition(cell, vector);
        var next      = self.grid.cellContent(positions.next);

        // Only one merger per row traversal?
        if (next && next.value === tile.value && !next.mergedFrom) {
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          // Converge the two tiles' positions
          tile.updatePosition(positions.next);

          // Update the score
          self.score += merged.value;

          // The mighty 2048 tile
          if (merged.value === 2048) self.won = true;
        } else {
          self.moveTile(tile, positions.farthest);
        }

        if (!self.positionsEqual(cell, tile)) {
          moved = true; // The tile moved from its original cell!
        }
      }
    });
  });

  if (moved) {
    self.addTile(newX, newY, newValue);

    if (!this.movesAvailable()) {
      this.over = true; // Game over!
    }
    this.actuate();
  }
};

// Get the vector representing the chosen direction
GameManager.prototype.getVector = function (direction) {
  // Vectors representing tile movement
  var map = {
    0: { x: 0,  y: -1 }, // up
    1: { x: 1,  y: 0 },  // right
    2: { x: 0,  y: 1 },  // down
    3: { x: -1, y: 0 }   // left
  };

  return map[direction];
};

// Build a list of positions to traverse in the right order
GameManager.prototype.buildTraversals = function (vector) {
  var traversals = { x: [], y: [] };

  for (var pos = 0; pos < this.size; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }

  // Always traverse from the farthest cell in the chosen direction
  if (vector.x === 1) traversals.x = traversals.x.reverse();
  if (vector.y === 1) traversals.y = traversals.y.reverse();

  return traversals;
};

GameManager.prototype.findFarthestPosition = function (cell, vector) {
  var previous;

  // Progress towards the vector direction until an obstacle is found
  do {
    previous = cell;
    cell     = { x: previous.x + vector.x, y: previous.y + vector.y };
  } while (this.grid.withinBounds(cell) &&
           this.grid.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell // Used to check if a merge is required
  };
};

GameManager.prototype.movesAvailable = function () {
  return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};

// Check for available matches between tiles (more expensive check)
GameManager.prototype.tileMatchesAvailable = function () {
  var self = this;

  var tile;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      tile = this.grid.cellContent({ x: x, y: y });

      if (tile) {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell   = { x: x + vector.x, y: y + vector.y };

          var other  = self.grid.cellContent(cell);

          if (other && other.value === tile.value) {
            return true; // These two tiles can be merged
          }
        }
      }
    }
  }

  return false;
};

GameManager.prototype.positionsEqual = function (first, second) {
  return first.x === second.x && first.y === second.y;
};
