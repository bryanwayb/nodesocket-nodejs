var NetSocketServer = require('./server.js');
var NetSocketClient = require('./client.js');

function NetSocket(options) {
	this._options = options || { };
}

NetSocket.prototype.createServer = function(port, ipaddress) {
	return new NetSocketServer(port, ipaddress, this._options);
};

NetSocket.prototype.createClient = function(port, ipaddress) {
	return new NetSocketClient(port, ipaddress, this._options);
};

module.exports = function(options) {
	return new NetSocket(options);
};

var server = module.exports().createServer(22, '127.0.0.1');
var client = module.exports().createClient(22, '127.0.0.1');

var remoteTest = client.func('testing');

server.on('start', function() {
	console.log('SERVER: started');
});
server.on('stop', function() {
	console.log('SERVER: stopped');
});
server.on('connect', function(client, socket) {
	console.log('SERVER: client connected');
});
server.on('disconnect', function(client, socket) {
	console.log('SERVER: client disconnected');
});
server.on('timeout', function(client, socket) {
	console.log('SERVER: client timeout');
});
server.on('close', function(client, socket, had_error) {
	console.log('SERVER: closing: ' + had_error);
});
server.on('data', function(client, socket, buffer) {
	console.log('SERVER: data: ' + buffer.toString());
});
server.on('verified', function(client, socket) {
	console.log('SERVER: client verified');
});
server.start();

client.on('verified', function(socket) {
	remoteTest(function(results) {
		console.log('Response Received');
	}, 1234);
	remoteTest(function(results) {
		console.log('Response Received');
	}, 1234);
});
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