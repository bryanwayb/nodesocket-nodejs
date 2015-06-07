var net = require('net'),
	NodeSocketCommon = require('./common.js'),
	ProcessQueue = require('./queue.js'),
	EventEmitter = require('events'),
	util = require('util');

function NodeSocketClient(port, ipaddress, options) {
	EventEmitter.call(this);
	
	this._options = options || { };
	this._port = port;
	this._ipaddress = ipaddress;
	this._socket = undefined;
	this._functions = { };
	this._state = NodeSocketCommon.EnumConnectionState.Disconnected;
	
	this._processCallback = undefined;
	this._processQueue = [];
}
util.inherits(NodeSocketClient, EventEmitter);

NodeSocketClient.prototype.remoteExecute = function(identifier, typemap, args, callback) {
	if(this._state === NodeSocketCommon.EnumConnectionState.Verified) {
		var buffer = NodeSocketCommon.createExecutePayload(identifier, typemap, args, function(error) {
			self.emit('error', error, this._socket);
		});
		this._processCallback = callback;
		this._state = NodeSocketCommon.EnumConnectionState.Processing;
		this._socket.write(buffer);
	}
	else if(this._state === NodeSocketCommon.EnumConnectionState.Processing) {
		this._processQueue.push(new ProcessQueue(this, this.remoteExecute, arguments));
	}
	else {
		this.emit('error', new Error('Unable to execute remote function on an unverified/disconnected server'), this._socket);
	}
};

NodeSocketClient.prototype.defineFunction = function(identifier, callback, responseType) {
	this._functions[identifier] = {
		callback: callback,
		responseType: responseType
	};
};

NodeSocketClient.prototype.linkFunction = function(identifier, typemap) {
	var self = this;
	return function(callback) {
		if(!typemap) {
			typemap = { };
		}
		arguments = Array.prototype.slice.call(arguments, 1);
		return self.remoteExecute.call(self, identifier, typemap, arguments, callback);
	};
};

NodeSocketClient.prototype._serverDataReceived = function(socket, buffer) {
	this.emit('data', socket, buffer);

	if(this._state === NodeSocketCommon.EnumConnectionState.Connected) {
		if(buffer.slice(0, NodeSocketCommon.nodesocketSignature.length).equals(NodeSocketCommon.nodesocketSignature)) {
			this._state = NodeSocketCommon.EnumConnectionState.Verified;
			
			socket.setKeepAlive(this._options.keepAlive, this._options.keepAliveDelay);
			socket.write(new Buffer([ NodeSocketCommon.EnumExecutionCode.ClientReady ]));
			
			this.emit('verified', socket);
		}
	}
	else if(this._state === NodeSocketCommon.EnumConnectionState.Verified) {
		var execCode = buffer.readUInt8(0);
		switch(execCode) {
			case NodeSocketCommon.EnumExecutionCode.ExecFunction:
				var self = this;
				socket.write(NodeSocketCommon.parseExecutePayload(this._functions, buffer.slice(1), function(error) {
					self.emit('error', error, socket);
				}));
				break;
			default:
				this.emit('error', new Error('Unrecognized execution code received from server'), socket);
				socket.end();
				return;
		}
	}
	else if(this._state === NodeSocketCommon.EnumConnectionState.Processing) {
		var serverResponse = buffer.readUInt8(0);
		if(serverResponse === NodeSocketCommon.EnumServerResponse.Okay) { // No error reported by server
			var dataType = buffer.readUInt8(1);
			var result = undefined;
			switch(dataType) {
				case NodeSocketCommon.EnumDataType.byte:
					result = buffer.readInt8(2);
					break;
				case NodeSocketCommon.EnumDataType.ubyte:
					result = buffer.readUInt8(2);
					break;
				case NodeSocketCommon.EnumDataType.short:
					result = buffer.readInt16LE(2);
					break;
				case NodeSocketCommon.EnumDataType.ushort:
					result = buffer.readUInt16LE(2);
					break;
				case NodeSocketCommon.EnumDataType.int:
					result = buffer.readInt32LE(2);
					break;
				case NodeSocketCommon.EnumDataType.uint:
					result = buffer.readUInt32LE(2);
					break;
				case NodeSocketCommon.EnumDataType.float:
					result = buffer.readFloatLE(2);
					break;
				case NodeSocketCommon.EnumDataType.double:
					result = buffer.readDoubleLE(2);
					break;
				case NodeSocketCommon.EnumDataType.string:
					result = buffer.slice(2).toString();
					break;
				case NodeSocketCommon.EnumDataType.ubyte:
					result = buffer.readUInt8(2) > 0;
					break;
				default:
					this.emit('error', new Error('Unrecognized data type ' + dataType + ' returned from server'), this._socket);
					return;
			}
		
			this._processCallback(result);
		}
		else if(serverResponse === NodeSocketCommon.EnumServerResponse.NoResult) {
			this._processCallback(undefined);
		}
		else if(serverResponse === NodeSocketCommon.EnumServerResponse.InvalidFunction) {
			throw Error('NodeSocket server returned an invalid function status code');
		}
		else if(serverResponse === NodeSocketCommon.EnumServerResponse.ServerError) {
			this.emit('error', new Error('Server reported an error'), this._socket);
		}
		else {
			this.emit('error', new Error('Unknown response received from server'), this._socket);
		}
		
		this._processCallback = undefined;
		
		this._state = NodeSocketCommon.EnumConnectionState.Verified;
		if(this._processQueue.length > 0) {
			this._processQueue.splice(0, 1)[0].execute();
		}
	}
};

NodeSocketClient.prototype._serverSocketError = function(socket, error) {
	this.emit('error', error, socket);
};

NodeSocketClient.prototype._serverDisconnected = function(socket) {
	this._state = NodeSocketCommon.EnumConnectionState.Disconnected;
	this.emit('disconnect', socket);
};

NodeSocketClient.prototype._serverTimeout = function(socket) {
	this.emit('timeout', socket);
	socket.end();
};

NodeSocketClient.prototype._serverClosed = function(socket, had_error) {
	this.emit('close', socket, had_error);
};

NodeSocketClient.prototype._clientConnected = function(socket) {
	this._state = NodeSocketCommon.EnumConnectionState.Connected;
	this.emit('connect', socket);
	
	var self = this;
	socket.on('data', function(buffer) {
		self._serverDataReceived.call(self, socket, buffer);
	});

	socket.on('end', function() {
		self._serverDisconnected.call(self, socket);
	});
	
	socket.on('timeout', function() {
		self._serverTimeout.call(self, socket);
	});
	
	socket.on('close', function(had_error) {
		self._serverClosed.call(self, socket, had_error);
	});
	
	socket.write(NodeSocketCommon.nodesocketSignature);
};

NodeSocketClient.prototype.start = function() {
	var self = this;
	this._socket = net.connect(this._port, this._ipaddress, function() {
		self._clientConnected.call(self, self._socket);
	});
	this._socket.on('error', function(error) {
		self._serverSocketError.call(self, self._socket, error);
	});
};

NodeSocketClient.prototype.stop = function() {
	if(this._socket) {
		this._socket.end();
	}
	else {
		this.emit('error', new Error('Unable to stop client, no client instance available'));
	}
};

module.exports = NodeSocketClient;