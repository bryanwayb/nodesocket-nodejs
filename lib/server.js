var net = require('net'),
	NodeSocketCommon = require('./common.js'),
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

NodeSocketServer.prototype._parseExecuteFunction = function(client, socket, buffer) {
	var identifierEndPosition = 4 + buffer.readUInt32LE(0);
	var identifier = buffer.slice(4, identifierEndPosition).toString();
	
	var response = [ new Buffer(1) /* Status code response */ ];
	if(identifier in this._functions) {
		var args = [];
		for(var i = identifierEndPosition; i < buffer.length;) {
			var dataType = buffer.readUInt8(i++);
			var dataSize = buffer.readUInt32LE(i);
			i += 4;
			var value = undefined;
			switch(dataType) {
				case NodeSocketCommon.EnumDataType.byte:
					value = buffer.readInt8(i);
					i++;
					break;
				case NodeSocketCommon.EnumDataType.ubyte:
					value = buffer.readUInt8(i);
					i++;
					break;
				case NodeSocketCommon.EnumDataType.short:
					value = buffer.readInt16LE(i);
					i += 2;
					break;
				case NodeSocketCommon.EnumDataType.ushort:
					value = buffer.readUInt16LE(i);
					i += 2;
					break;
				case NodeSocketCommon.EnumDataType.int:
					value = buffer.readInt32LE(i);
					i += 4;
					break;
				case NodeSocketCommon.EnumDataType.uint:
					value = buffer.readUInt32LE(i);
					i += 4;
					break;
				case NodeSocketCommon.EnumDataType.float:
					value = buffer.readFloatLE(i);
					i += 4;
					break;
				case NodeSocketCommon.EnumDataType.double:
					value = buffer.readDoubleLE(i);
					i += 8;
					break;
				case NodeSocketCommon.EnumDataType.string:
					var next = i + dataSize;
					value = buffer.slice(i, next).toString();
					i = next;
					break;
				default:
					this.emit('error', new Error('Unsupported data type argument received from client'), client, socket);
					response[0].writeUInt8(NodeSocketCommon.EnumServerResponse.ServerError, 0);
					socket.write(response[0]);
					return; // Early exit
			}
			
			args.push(value);
		}

		var result = this._functions[identifier].callback.apply(this, args);
		if(result === undefined || result === null) {
			response[0].writeUInt8(NodeSocketCommon.EnumServerResponse.NoResult, 0);
		}
		else {
			response[0].writeUInt8(NodeSocketCommon.EnumServerResponse.Okay, 0);
			
			var argtype = this._functions[identifier].responseType;
			
			if(!argtype) {
				switch(typeof result) {
					case 'number':
						if(result === (result|0)) {
							argtype = 'int'; // Default to int for normal numbers
						}
						else {
							argtype = 'float'; // float for anything else
						}
						break;
					case 'string':
						argtype = 'string';
						break;
				}
				this._functions[identifier].responseType = argtype;
			}
			
			var tempBuf = undefined;
			var dataType = NodeSocketCommon.EnumDataType[argtype];
			if(dataType !== undefined) {
				switch(dataType) {
					case NodeSocketCommon.EnumDataType.byte:
						tempBuf = new Buffer(1);
						tempBuf.writeInt8(result, 0);
						break;
					case NodeSocketCommon.EnumDataType.ubyte:
						tempBuf = new Buffer(1);
						tempBuf.writeUInt8(result, 0);
						break;
					case NodeSocketCommon.EnumDataType.short:
						tempBuf = new Buffer(2);
						tempBuf.writeInt16LE(result, 0);
						break;
					case NodeSocketCommon.EnumDataType.ushort:
						tempBuf = new Buffer(2);
						tempBuf.writeUInt16LE(result, 0);
						break;
					case NodeSocketCommon.EnumDataType.int:
						tempBuf = new Buffer(4);
						tempBuf.writeInt32LE(result, 0);
						break;
					case NodeSocketCommon.EnumDataType.uint:
						tempBuf = new Buffer(4);
						tempBuf.writeUInt32LE(result, 0);
						break;
					case NodeSocketCommon.EnumDataType.float:
						tempBuf = new Buffer(4);
						tempBuf.writeFloatLE(result, 0);
						break;
					case NodeSocketCommon.EnumDataType.double:
						tempBuf = new Buffer(8);
						tempBuf.writeDoubleLE(result, 0);
						break;
					case NodeSocketCommon.EnumDataType.string:
						tempBuf = new Buffer(result);
						break;
					default:
						this.emit('error', new Error('Data type' + dataType + ' has gone unhandled by server'), client, socket);
						response[0].writeUInt8(NodeSocketCommon.EnumServerResponse.ServerError, 0);
						break;
				}
				
				if(dataType < NodeSocketCommon.EnumDataType._max) {
					response.push(new Buffer([ dataType ]));
					response.push(tempBuf);
				}
			}
			else {
				this.emit('error', new Error('Unsupported data type returned from nodesocket function'), client, socket);
				response[0].writeUInt8(NodeSocketCommon.EnumServerResponse.ServerError, 0);
			}
		}
	}
	else {
		response[0].writeUInt8(NodeSocketCommon.EnumServerResponse.InvalidFunction, 0);
	}

	socket.write(Buffer.concat(response));
};

NodeSocketServer.prototype.func = function(identifier, callback, responseType) {
	this._functions[identifier] = {
		callback: callback,
		responseType: responseType
	};
};

NodeSocketServer.prototype._clientDataReceived = function(client, socket, buffer) {
	this.emit('data', client, socket, buffer);
	
	if(client._state == NodeSocketCommon.EnumConnectionState.Connected) {
		if(buffer.slice(0, NodeSocketCommon.nodesocketSignature.length).equals(NodeSocketCommon.nodesocketSignature)) {
			client._state = NodeSocketCommon.EnumConnectionState.Verified;
			this.emit('verified', client, socket);
			
			socket.write(NodeSocketCommon.nodesocketSignature); // Send same verification string back to the client
			socket.setKeepAlive(this._options.keepAlive, this._options.keepAliveDelay);
		}
		else {
			this.emit('error', new Error('Client failed verification'), client, socket);
			socket.end();
			return;
		}
	}
	else if(client._state == NodeSocketCommon.EnumConnectionState.Verified) {
		var execCode = buffer.readUInt8(0);
		switch(execCode) {
			case NodeSocketCommon.executionCode.ExecFunction:
				this._parseExecuteFunction(client, socket, buffer.slice(1));
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
	var client = { }; // Shared property storage for each client
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