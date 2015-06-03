var net = require('net'),
	NetSocketCommon = require('./common.js'),
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
	client._state = NetSocketCommon.EnumConnectionState.Disconnected;
	this.emit('disconnect', client, socket);
};

NodeSocketServer.prototype._parseExecuteFunction = function(client, socket, buffer) {
	var response = new Buffer([ NetSocketCommon.EnumServerResponse.NoResult ]); // Just for testing
	socket.write(response);
};

NodeSocketServer.prototype._clientDataReceived = function(client, socket, buffer) {
	this.emit('data', client, socket, buffer);
	
	if(client._state == NetSocketCommon.EnumConnectionState.Connected) {
		if(buffer.slice(0, NetSocketCommon.netsocketSignature.length).equals(NetSocketCommon.netsocketSignature)) {
			client._state = NetSocketCommon.EnumConnectionState.Verified;
			this.emit('verified', client, socket);
			
			socket.write(NetSocketCommon.netsocketSignature); // Send same verification string back to the client
			socket.setKeepAlive(this._options.keepAlive, this._options.keepAliveDelay);
		}
		else {
			// Not a compatible client
		}
	}
	else if(client._state == NetSocketCommon.EnumConnectionState.Verified) {
		var execCode = buffer.readUInt8(0);
		switch(execCode) {
			case NetSocketCommon.executionCode.ExecFunction:
				this._parseExecuteFunction(client, socket, buffer.slice(1));
				break;
		}
	}
};

NodeSocketServer.prototype._clientTimeout = function(client, socket) {
	this.emit('timeout', client, socket);
	socket.end();
};

NodeSocketServer.prototype._clientClosed = function(client, socket, had_error) {
	this.emit('close', client, socket);
};

NodeSocketServer.prototype._serverListener = function(socket) {
	var self = this;
	var client = { }; // Shared property storage for each client
	client._state = NetSocketCommon.EnumConnectionState.Connected;
	
	this.emit('connect', client, socket);

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
};

NodeSocketServer.prototype.close = function() {
	if(this._server) {
		var self = this;
		this._server.close(function() {
			self.emit('stop');
		});
	}
};

module.exports = NodeSocketServer;