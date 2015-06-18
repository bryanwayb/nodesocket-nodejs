var nodesocket = require('../lib/index.js');

var server = nodesocket({
	bidirectional: true
}).createServer(8080, 'localhost'); // Hosts the server with the IP 127.0.0.1 on port 8080 with WebSocket mode enabled

server.on('error', function(error, client, server) {
	console.log(error);
});

server.defineFunction('serverFunction', function() {
	console.log('Executed on the server');
});

server.on('verified', function(client) {
	var clientFunction = client.linkFunction('clientFunction');
	
	setInterval(function() {
		clientFunction(function() {
			console.log('Returned');
		});
	}, 750);
});

server.listen();