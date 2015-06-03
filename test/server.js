var nodesocket = require('../lib/index.js');

var server = nodesocket().createServer(22, '127.0.0.1'); // Hosts the server with the IP 127.0.0.1 on port 22

server.func('example', function(s) { // Register a function called 'example'
	console.log('Hello, World. This is being executed on the server.\nParameter: ' + s);
	console.log('Giving okay to stop server connections and begin shutting down.');
	server.close();
	return 'The was returned from the server';
});

server.start();