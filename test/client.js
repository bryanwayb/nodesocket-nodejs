var nodesocket = require('../lib/index.js');

var client = nodesocket().createClient(22, '127.0.0.1'); // Connect to 127.0.0.1 on port 22

var example = client.linkFunction('example'); // Create a JavaScript function to call the 'example' function on the server.
var shutdown = client.linkFunction('shutdown');

client.on('error', function(error, socket) {
	console.log(error);
});

client.on('verified', function(socket) { // Signals that we can now send functions to be executed.
	example(function(results) {
		console.log('Response Received: ' + results);
	}, 'hello');
	example(function(results) {
		console.log('Response Received: ' + results);
	}, 'hello');
	
	shutdown(function() {
		console.log('Shutdown server. Now closing client');
		client.close();
	});
});

client.start();