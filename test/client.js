var nodesocket = require('../lib/index.js');

var client = nodesocket().createClient(8080, 'localhost');

client.on('error', function(error, client, server) {
	console.log(error);
});

var serverFunction = client.linkFunction('serverFunction');

client.on('verified', function(socket) {
	setInterval(function() {
		serverFunction(function(r) {
			console.log(r);
		}, undefined, 'testing');
	}, 500);
});

client.connect();