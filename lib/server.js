var net = require('net'),
	NodeSocketCommon = require('./common.js'),
	EventEmitter = require('events'),
	util = require('util');

function NodeSocketServer(port, ipaddress, options) {
	EventEmitter.call(this);

	this._options = options || { };
	this._functions = this._options.functions || { };
	this._port = port;
	this._ipaddress = ipaddress;
	
	var self = this;
	this._server = net.createServer(function(socket) {
		self._serverListener.call(self, socket);
	});
}
util.inherits(NodeSocketServer, EventEmitter);

NodeSocketServer.prototype._clientDisconnected = function(client, socket) {
	this.emit('clientDisconnect', client, socket);
};

NodeSocketServer.prototype._parseExecuteFunction = function(client, socket, buffer) {
	console.log('Execute function here');
};

NodeSocketServer.prototype._clientDataReceived = function(client, socket, buffer) {
	console.log('Data: ' + buffer.toString());
	
	if(this._state == NodeSocketCommon.EnumConnectionState.Connected) {
		if(buffer.slice(0, NodeSocketCommon.netsocketSignature.length).equals(NodeSocketCommon.netsocketSignature)) {
			console.log('SERVER: Client verified');
			socket.write(NodeSocketCommon.netsocketSignature); // Send same verification string back to the client
			socket.setKeepAlive(this._options.keepAlive, this._options.keepAliveDelay);
			this._state = NodeSocketCommon.EnumConnectionState.Verified;
		}
		else {
			// Not a compatible client
		}
	}
	else if(this._state == NodeSocketCommon.EnumConnectionState.Verified) {
		var execCode = buffer.readUInt8(0);
		switch(execCode) {
			case NodeSocketCommon.executionCode.ExecFunction:
				this._parseExecuteFunction(client, socket, buffer.slice(1));
				break;
		}
	}
};

NodeSocketServer.prototype._clientTimeout = function(client, socket) {
	this.emit('clientTimeout', client, socket);
	
	socket.end();
};

NodeSocketServer.prototype._clientClosed = function(client, socket, had_error) {
	this.emit('clientClosed', client, socket);
};

NodeSocketServer.prototype._serverListener = function(socket) {
	var self = this;
	var client = { }; // Shared property storage for each client
	this._state = NodeSocketCommon.EnumConnectionState.Connected;
	
	this.emit('clientConnect', client, socket);

	socket.on('end', function() {
		self._clientDisconnected.call(self, client, socket);
	});
	
	socket.on('data', function(buffer) {
		self._clientDataReceived.call(self, client, socket, buffer);
	});
	
	socket.on('timeout', function() {
		self._clientTimeout.call(self, client, socket);
	});
	
	socket.on('close', function(had_error) {
		self._clientClosed.call(self, client, socket, had_error);
	});
};

NodeSocketServer.prototype.start = function() {
	if(this._server) {
		this._server.listen(this._port, this._host, this._options.backlog, function() {
			console.log('Started');
		});
	}
};

NodeSocketServer.prototype.close = function() {
	if(this._server) {
		this._server.close(function() {
			console.log('Server stopped');
		});
	}
};

module.exports = NodeSocketServer;