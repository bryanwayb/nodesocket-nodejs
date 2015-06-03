var nodesocket = require('../lib/index.js');

var client = nodesocket().createClient(22, '127.0.0.1'); // Connect to 127.0.0.1 on port 22

var example = client.func('example'); // Create a JavaScript function to call the 'example' function on the server.

client.on('verified', function(socket) { // Signals that we can now send functions to be executed.
	example(function(results) {
		console.log('Response Received: ' + results);
		client.close(); // Nicely shutdown the client.
	}, 'hello');
});

client.start();