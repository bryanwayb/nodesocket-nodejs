var nodesocket = require('../lib/index.js');

var server = nodesocket({
	webSocket: true,
	webSocketVerifyHost: true
}).createServer(8080, 'localhost'); // Hosts the server with the IP 127.0.0.1 on port 8080 with WebSocket mode enabled

server.on('error', function(error, client, server) {
	console.log(error);
});

server.defineFunction('example', function(s) { // Register a function called 'example'
	console.log('Hello, World. This is being executed on the server.\nParameter: ' + s);
	return 'This was returned from the server';
});

server.on('data', function(client, server, buffer) {
	console.log(buffer.toString('hex'));
});

server.listen();