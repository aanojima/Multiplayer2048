var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var index = require('./routes/index');
var game = require('./routes/game');

var app = express();
var port = process.env.PORT || 3000;
var server = require('http').createServer(app);
var io = require('socket.io')(server);

var GameManager = require('./game_manager').GameManager;

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', index);
app.use('/game', game);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
});

// error handler
app.use(function(err, req, res, next) {
	// set locals, only providing error in development
	res.locals.message = err.message;
	res.locals.error = req.app.get('env') === 'development' ? err : {};

	// render the error page
	res.status(err.status || 500);
	res.render('error');
});

// Socket
server.listen(port);
console.log('Server is listening on port %d', port);

var games = {};
io.on('connection', function(connection) {
	connection.on('message', function(data) {
		var game_manager = games[data.game_id];
		if (data.instruction == "move") {
			game_manager.move(data.direction);
			data.newTile = game_manager.newTile;
		}
		else if (data.instruction == "restart") {
			game_manager.restart();
			data.cells = game_manager.grid.cells;
		}
		else if (data.instruction == "keepPlaying") {
			game_manager.keepGoing();
		}
		io.to(data.game_id).emit('message', data);
	});

	connection.on('disconnect', function(data) {
		var gameName = connection.gameName;
		connection.leave(gameName);
		if (games.hasOwnProperty(gameName) && games[gameName].removePlayer()) {
			// Empty game, delete
			// TODO - FEATURE: Delete after some time interval
			// * this allows players to leave for a short period of time and resume game later
			// * also allows tolerance for disconnections
			delete games[gameName];
		}
	});

	// Automatically join room
	var fullPath = connection.handshake.headers.referer;
	var re = /^(https?:\/\/[\w|\.|-]+:\d+\/game\/)(\w+)$/;
	var gameName = "";
	var matches = fullPath.match(re);
	var gameName = matches && matches.length >= 3 ? matches[2] : "";
	if (gameName == "") return;
	connection.join(gameName);
	connection.gameName = gameName;

	// Get the game info
	var game_manager = {};
	var data = {};
	if (games.hasOwnProperty(gameName)) {
		// Game already exists
		game_manager = games[gameName];
	}
	else {
		// create new game
		game_manager = new GameManager(gameName, 4);
		games[gameName] = game_manager;
	}
	game_manager.addPlayer();
	data.score = game_manager.score;
	data.cells = game_manager.grid.cells;
	connection.emit('loadGame', data);
});

module.exports = app;
