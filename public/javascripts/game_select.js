$(document).ready(function(e){
	var submit = document.getElementById("new_game_form");
	submit.addEventListener("submit", function(event){
		event.preventDefault();
		var text = document.getElementById("game_id_text").value;
		var Exp = /^\w+$/;
		if(!text.match(Exp)){
			alert("Only alphanumeric characters please. ");
		} else {
			window.location.href = "/game/" + encodeURIComponent(text.toLowerCase());
		}
	});
});
