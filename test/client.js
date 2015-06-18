var nodesocket = require('../lib/index.js');

var client = nodesocket({
	bidirectional: true
}).createClient(8080, 'localhost');

client.on('error', function(error, client, server) {
	console.log(error);
});

client.defineFunction('clientFunction', function() {
	console.log('Executed on client');
});

var serverFunction = client.linkFunction('serverFunction');

client.on('verified', function(socket) {
	setInterval(function() {
		serverFunction(function() {
			console.log('Returned');
		});
	}, 500);
});

client.connect();