var NodeSocketServer = require('./server.js');
var NodeSocketClient = require('./client.js');

function NodeSocket(options) {
	this._options = options || { };
}

NodeSocket.prototype.createServer = function(port, ipaddress) {
	return new NodeSocketServer(port, ipaddress, this._options);
};

NodeSocket.prototype.createClient = function(port, ipaddress) {
	return new NodeSocketClient(port, ipaddress, this._options);
};

module.exports = function(options) {
	return new NodeSocket(options);
};

var server = module.exports().createServer(22, '127.0.0.1');
server.on('clientConnect', function(client, socket) {
	console.log('Client connected');
});
server.on('clientDisconnect', function(client, socket) {
	console.log('Client disconnected');
});
server.on('clientTimeout', function(client, socket) {
	console.log('Timeout');
});
server.on('clientClosed', function(client, socket, had_error) {
	console.log('Closing: ' + had_error);
});
server.start();

var client = module.exports().createClient(22, '127.0.0.1');
client.start();

process.stdin.resume();//so the program will not close instantly

function exitHandler(options, err) {
    if (options.cleanup) {
		console.log('Exiting...');
		server.close();
		client.close();
	}
    if (err) console.log(err.stack);
    if (options.exit) process.exit();
}

//do something when app is closing
process.on('exit', exitHandler.bind(null,{cleanup:true}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {exit:true}));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {exit:true}));