var net = require('net'),
	tls = require('tls'),
	NodeSocketCommon = require('./common.js'),
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
	this._master = false;
	
	this._secure = this._options.secure;
	this._interface = this._secure ? tls : net;
	
	this._processCallback = undefined;
	this._processQueue = [];
}
util.inherits(NodeSocketClient, EventEmitter);

NodeSocketClient.prototype._write = function(buffer) {
	if(this._options.webSocket) {
		this._socket.write(NodeSocketCommon.makeWebSocketFrame(NodeSocketCommon.makeWebSocketFrameObject(buffer)));
	}
	else {
		this._socket.write(buffer);
	}
};

NodeSocketClient.prototype.remoteExecute = function(identifier, typemap, args, callback) {
	if(this._master) {
		if(this._state === NodeSocketCommon.EnumConnectionState.Verified) {
			var buffer = NodeSocketCommon.createExecutePayload(identifier, typemap, args, function(error) {
				self.emit('error', error, self._socket);
			});
			
			if(!buffer) {
				return false;
			}
			
			this._processCallback = callback;
			this._state = NodeSocketCommon.EnumConnectionState.Processing;
			
			this._write(buffer);
		}
		else if(this._state === NodeSocketCommon.EnumConnectionState.Processing) {
			this._processQueue.push(new NodeSocketCommon.ProcessQueue(this, this.remoteExecute, arguments));
		}
		else {
			this.emit('error', new Error('Unable to execute remote function on an unverified/disconnected node'), this._socket);
			return false;
		}
	}
	else {
		this.emit('error', new Error('Unable to execute remote function when acting as a slave'), this._socket);
		return false;
	}
	
	return true;
};

NodeSocketClient.prototype.defineFunction = function(identifier, callback, responseType) {
	this._functions[identifier] = NodeSocketCommon.makePayloadFunctionStore(callback, responseType);
};

NodeSocketClient.prototype.linkFunction = function(identifier, typemap) {
	var self = this;
	return function(callback) {
		if(!typemap) {
			typemap = { };
		}
		
		return self.remoteExecute.call(self, identifier, typemap, Array.prototype.slice.call(arguments, 1), callback);
	};
};

NodeSocketClient.prototype.requestMaster = function() {
	if(this._state === NodeSocketCommon.EnumConnectionState.Verified) {
		this._write(new Buffer([ NodeSocketCommon.EnumExecutionCode.RequestMaster ]));
		this._master = true;
	}
	else {
		this.emit('error', new Error('A master request must be done over an idle connection'), this._socket);
		return false;
	}
	
	return true;
};

NodeSocketClient.prototype.requestSlave = function() {
	if(!this._options.denyMasterRequests) {
		if(this._state === NodeSocketCommon.EnumConnectionState.Verified) {
			this._master = false;
			this._write(new Buffer([ NodeSocketCommon.EnumExecutionCode.RequestSlave ]));
		}
		else {
			this.emit('error', new Error('A slave request must be done over an idle connection'), this._socket);
			return false;
		}
	}
	else {
		self.emit('error', new Error('Unable to request as a slave when the current connection denies a remote master'), this._socket);
		return false;
	}
	
	return true;
};

NodeSocketClient.prototype._nodeDataReceived = function(buffer) {
	this.emit('data', this._socket, buffer);
	
	var bufferPosition = buffer.length; // Prevent infinite loops

	if(this._state === NodeSocketCommon.EnumConnectionState.Connected) {
		if(NodeSocketCommon.nodesocketSignature.equals(buffer)) {
			this._state = NodeSocketCommon.EnumConnectionState.Verified;
			bufferPosition = NodeSocketCommon.nodesocketSignature.length;
			
			this._socket.setKeepAlive(this._options.keepAlive, this._options.keepAliveDelay);
			this.requestMaster();
			
			this.emit('verified', this._socket);
		}
	}
	else if(this._state === NodeSocketCommon.EnumConnectionState.Verified) {
		var execCode = buffer.readUInt8(0);
		
		if(this._master) {
			if(execCode === NodeSocketCommon.EnumExecutionCode.RequestMaster) {
				bufferPosition = 1;
				this._master = this._options.denyMasterRequests;
				
				this.emit('masterRequest', this._socket, this._master);
			}
			else {
				this._write(new Buffer([ NodeSocketCommon.EnumNodeResponse.NotAllowed ]));
			}
		}
		else {
			if(execCode === NodeSocketCommon.EnumExecutionCode.ExecFunction) {
				var self = this;
				
				var writeBuffer = NodeSocketCommon.parseExecutePayload(this._functions, buffer.slice(1), function(error) {
					self.emit('error', error, this._socket);
				});
				
				bufferPosition = 1 + writeBuffer.position;
				
				this._write(writeBuffer.value);
			}
			else if(execCode === NodeSocketCommon.EnumExecutionCode.RequestSlave) {
				this.requestMaster();
				bufferPosition = 1;
			}
			else {
				this._write(new Buffer([ NodeSocketCommon.EnumNodeResponse.InvalidExecCode ]));
			}
		}
	}
	else if(this._state === NodeSocketCommon.EnumConnectionState.Processing) {
		var nodeResponse = buffer.readUInt8(0);

		if(nodeResponse === NodeSocketCommon.EnumNodeResponse.Okay) { // No error reported by node
			var resultBuffer = NodeSocketCommon.parseResultPayload(buffer.slice(1));
			bufferPosition = 1 + resultBuffer.position;
			this._processCallback(resultBuffer.value);
		}
		else if(nodeResponse === NodeSocketCommon.EnumNodeResponse.NoResult) {
			bufferPosition = 1;
			this._processCallback();
		}
		else {
			if(nodeResponse in NodeSocketCommon.EnumNodeResponseErrorString) {
				this.emit('error', new Error(NodeSocketCommon.EnumNodeResponseErrorString[nodeResponse]), this._socket);
				bufferPosition = 1;
			}
			else {
				this.emit('error', new Error('Unknown response received from the connected node'), this._socket);
			}
		}
		
		this._processCallback = undefined;
		
		this._state = NodeSocketCommon.EnumConnectionState.Verified;
		if(this._processQueue.length > 0) {
			this._processQueue.splice(0, 1)[0].execute();
		}
	}
	
	if(bufferPosition < buffer.length) {
		this._nodeDataReceived(buffer.slice(bufferPosition));
	}
	
	return bufferPosition; // This is for the NodeSocketServer class
};

NodeSocketClient.prototype._nodeSocketError = function(socket, error) {
	this.emit('error', error, socket);
};

NodeSocketClient.prototype._nodeDisconnected = function(socket) {
	this._state = NodeSocketCommon.EnumConnectionState.Disconnected;
	this.emit('disconnect', socket);
};

NodeSocketClient.prototype._nodeTimeout = function(socket) {
	this.emit('timeout', socket);
	socket.end();
};

NodeSocketClient.prototype._nodeClosed = function(socket, had_error) {
	this.emit('close', socket, had_error);
};

NodeSocketClient.prototype._nodeOCSPResponse = function(socket, response) {
	this.emit('OCSPResponse', socket, response);
};

NodeSocketClient.prototype._nodeConnected = function(socket) {
	this._state = NodeSocketCommon.EnumConnectionState.Connected;
	this.emit('connect', socket);
	
	var self = this;
	socket.on('data', function(buffer) {
		self._nodeDataReceived.call(self, buffer);
	});

	socket.on('end', function() {
		self._nodeDisconnected.call(self, socket);
	});
	
	socket.on('timeout', function() {
		self._nodeTimeout.call(self, socket);
	});
	
	socket.on('close', function(had_error) {
		self._nodeClosed.call(self, socket, had_error);
	});
	
	if(this._secure) {
		socket.on('OCSPResponse', function(response) {
			self._nodeOCSPResponse.call(self, socket, response);
		});
	}
	
	this._write(NodeSocketCommon.nodesocketSignature);
};

NodeSocketClient.prototype.connect = function() {
	var args = [ this._port, this._ipaddress];
	
	if(this._secure) {
		args.push(this._options);
	}
	
	var self = this;
	args.push(function() {
		self._nodeConnected.call(self, self._socket);
	});
	
	this._socket = this._interface.connect.apply(this, args);

	this._socket.on('error', function(error) {
		self._nodeSocketError.call(self, self._socket, error);
	});
};

NodeSocketClient.prototype.close = function() {
	if(this._socket) {
		this._socket.end();
	}
	else {
		this.emit('error', new Error('Unable to stop client, no client instance available'));
		return false;
	}
	
	return true;
};

module.exports = NodeSocketClient;