var nodesocket = require('../lib/index.js');

var server = nodesocket().createServer(22, '127.0.0.1'); // Hosts the server with the IP 127.0.0.1 on port 22

server.on('error', function(error, client, server) {
	console.log(error);
});

server.defineFunction('example', function(s) { // Register a function called 'example'
	console.log('Hello, World. This is being executed on the server.\nParameter: ' + s);
	return 'This was returned from the server';
});

server.defineFunction('shutdown', function() {
	console.log('Giving okay to stop server connections and begin shutting down.');
	server.close();
});

server.on('verified', function(client, server) {
	var clientFunction = client.linkFunction('clientFunction');
	(function loop() {
		clientFunction(function(results) {
			console.log('Response Received From Client: ' + results);
			setTimeout(loop, 2000);
		}, 'sent from server');
	})();
});

server.start();