var net = require('net'),
	tls = require('tls'),
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
	
	this._secure = this._options.secure;
	this._interface = this._secure ? tls : net;
	
	var self = this;
	this._server = this._interface.createServer(this._options, function(socket) {
		self._serverListener.call(self, socket);
	});
	this._server.on('error', function (error) {
		self.emit('error', error);
	});
	
	if(this._secure) {
		this._server.on('OCSPRequest', function(certificate, issuer, callback) {
			self.emit('OCSPRequest', certificate, issuer, callback);
		});
		this._server.on('clientError', function(exception, tlsSocket) {
			self.emit('clientError', exception, tlsSocket);
		});
	}
}
util.inherits(NodeSocketServer, EventEmitter);

NodeSocketServer.prototype._nodeDisconnected = function(client, socket) {
	client._state = NodeSocketCommon.EnumConnectionState.Disconnected;
	this.emit('disconnect', client, socket);
};

NodeSocketServer.prototype._nodeSocketError = function(client, socket, error) {
	this.emit('error', error, client, socket);
};

NodeSocketServer.prototype.defineFunction = function(identifier, callback, responseType) {
	this._functions[identifier] = NodeSocketCommon.makePayloadFunctionStore(callback, responseType);
};

NodeSocketServer.prototype._nodeDataReceived = function(client, socket, buffer) {
	this.emit('data', client, socket, buffer);
	
	var bufferPosition = buffer.length;
	
	if(client._state === NodeSocketCommon.EnumConnectionState.Connected) {
		if(NodeSocketCommon.nodesocketSignature.equals(buffer)) {
			bufferPosition = NodeSocketCommon.nodesocketSignature.length;
			socket.write(NodeSocketCommon.nodesocketSignature); // Send same verification string back to the client
			socket.setKeepAlive(this._options.keepAlive, this._options.keepAliveDelay);
		}
		else if(buffer.readUInt8(0) === NodeSocketCommon.EnumExecutionCode.RequestMaster) { // Don't recognize the client until it explicitly requests to become the master
			bufferPosition = 1;
			client._state = NodeSocketCommon.EnumConnectionState.Verified;
			client._master = false;
			
			this.emit('verified', client, socket);
		}
		else {
			this.emit('error', new Error('Client failed verification'), client, socket);
			socket.end();
			return;
		}
	}
	else if(client._state === NodeSocketCommon.EnumConnectionState.Processing) {
		bufferPosition = client._nodeDataReceived(buffer);
	}
	else if(client._state === NodeSocketCommon.EnumConnectionState.Verified) {
		var execCode = buffer.readUInt8(0);
		
		if(client._master) {
			if(execCode === NodeSocketCommon.EnumExecutionCode.RequestMaster) {
				bufferPosition = 1;
				client._master = this._options.denyMasterRequests;

				this.emit('masterRequest', client, socket, client._master);
			}
			else {
				socket.write(new Buffer([ NodeSocketCommon.EnumNodeResponse.NotAllowed ]));
			}
		}
		else {
			if(execCode === NodeSocketCommon.EnumExecutionCode.ExecFunction) {
				var self = this;
				
				var writeBuffer = NodeSocketCommon.parseExecutePayload(this._functions, buffer.slice(1), function(error) {
					self.emit('error', error, client, socket);
				});
				
				bufferPosition = 1 + writeBuffer.position;
				
				socket.write(writeBuffer.value);
			}
			else if(execCode === NodeSocketCommon.EnumExecutionCode.RequestSlave) {
				client.requestMaster();
				bufferPosition = 1;
			}
			else {
				socket.write(new Buffer([ NodeSocketCommon.EnumNodeResponse.InvalidExecCode ]));
			}
		}
	}
	
	if(bufferPosition < buffer.length) {
		this._nodeDataReceived(buffer.slice(bufferPosition));
	}
};

NodeSocketServer.prototype._nodeTimeout = function(client, socket) {
	this.emit('timeout', client, socket);
	socket.end();
};

NodeSocketServer.prototype._nodeClosed = function(client, socket, had_error) {
	this.emit('close', client, socket, had_error);
};

NodeSocketServer.prototype._serverListener = function(socket) {
	var self = this;
	var client = new NodeSocketClient(socket.remotePort, socket.remoteAddress, this._options);
	client._socket = socket;
	client._state = NodeSocketCommon.EnumConnectionState.Connected;
	
	this.emit('connect', client, socket);
	
	socket.on('error', function(error) {
		self._nodeSocketError.call(self, client, socket, error);
	});

	socket.on('end', function() {
		self._nodeDisconnected.call(self, client, socket);
	});
	
	socket.on('data', function(buffer) {
		self._nodeDataReceived.call(self, client, socket, buffer);
	});
	
	socket.on('timeout', function() {
		self._nodeTimeout.call(self, client, socket);
	});
	
	socket.on('close', function(had_error) {
		self._nodeClosed.call(self, client, socket, had_error);
	});
};

NodeSocketServer.prototype.listen = function() {
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