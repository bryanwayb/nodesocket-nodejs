var net = require('net'),
	NodeSocketCommon = require('./common.js'),
	NodeSocketClient = require('./client.js'),
	EventEmitter = require('events'),
	util = require('util');

function NodeSocketServer(port, ipaddress, options) {
	EventEmitter.call(this);

	this._options = options || { };
	this._port = port;
	this._ipaddress = ipaddress;
	this._functions = { };
	
	var self = this;
	this._server = net.createServer(function(socket) {
		self._serverListener.call(self, socket);
	});
	this._server.on('error', function (error) {
		self.emit('error', error);
	});
}
util.inherits(NodeSocketServer, EventEmitter);

NodeSocketServer.prototype._clientDisconnected = function(client, socket) {
	client._state = NodeSocketCommon.EnumConnectionState.Disconnected;
	this.emit('disconnect', client, socket);
};

NodeSocketServer.prototype._clientSocketError = function(client, socket, error) {
	this.emit('error', error, client, socket);
};

NodeSocketServer.prototype.defineFunction = function(identifier, callback, responseType) {
	this._functions[identifier] = {
		callback: callback,
		responseType: responseType
	};
};

NodeSocketServer.prototype._clientDataReceived = function(client, socket, buffer) {
	this.emit('data', client, socket, buffer);
	
	if(client._state === NodeSocketCommon.EnumConnectionState.Connected) {
		if(buffer.slice(0, NodeSocketCommon.nodesocketSignature.length).equals(NodeSocketCommon.nodesocketSignature)) {
			socket.write(NodeSocketCommon.nodesocketSignature); // Send same verification string back to the client
			socket.setKeepAlive(this._options.keepAlive, this._options.keepAliveDelay);
		}
		else if(buffer.readUInt8(0) === NodeSocketCommon.EnumExecutionCode.ClientReady) {
			client._state = NodeSocketCommon.EnumConnectionState.Verified;
			this.emit('verified', client, socket);
		}
		else {
			this.emit('error', new Error('Client failed verification'), client, socket);
			socket.end();
			return;
		}
	}
	else if(client._state === NodeSocketCommon.EnumConnectionState.Processing) {
		client._serverDataReceived(socket, buffer);
	}
	else if(client._state === NodeSocketCommon.EnumConnectionState.Verified) {
		var execCode = buffer.readUInt8(0);
		switch(execCode) {
			case NodeSocketCommon.EnumExecutionCode.ExecFunction:
				var self = this;
				socket.write(NodeSocketCommon.parseExecutePayload(this._functions, buffer.slice(1), function(error) {
					self.emit('error', error, client, socket);
				}));
				break;
			default:
				this.emit('error', new Error('Unrecognized execution code received from client'), client, socket);
				socket.end();
				return;
		}
	}
};

NodeSocketServer.prototype._clientTimeout = function(client, socket) {
	this.emit('timeout', client, socket);
	socket.end();
};

NodeSocketServer.prototype._clientClosed = function(client, socket, had_error) {
	this.emit('close', client, socket, had_error);
};

NodeSocketServer.prototype._serverListener = function(socket) {
	var self = this;
	var client = new NodeSocketClient(socket.remotePort, socket.remoteAddress, this._options); // Shared property storage for each client
	client._socket = socket;
	client._state = NodeSocketCommon.EnumConnectionState.Connected;
	
	this.emit('connect', client, socket);
	
	socket.on('error', function(error) {
		self._clientSocketError.call(self, client, socket, error);
	});

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
		var self = this;
		this._server.listen(this._port, this._host, this._options.backlog, function() {
			self.emit('start');
		});
	}
	else {
		this.emit('error', new Error('Unable to start server, no server instance available'));
	}
};

NodeSocketServer.prototype.close = function() {
	if(this._server) {
		var self = this;
		this._server.close(function() {
			self.emit('stop');
		});
	}
	else {
		this.emit('error', new Error('Unable to stop server, no server instance available'));
	}
};

module.exports = NodeSocketServer;