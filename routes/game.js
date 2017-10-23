var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/:id', function(req, res, next) {
  var game_id = req.params["id"];
  res.render('game', {
  	game_id : game_id
  });
});

module.exports = router;
