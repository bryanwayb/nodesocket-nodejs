var net = require('net'),
	NodeSocketCommon = require('./common.js'),
	ProcessQueue = require('./queue.js'),
	EventEmitter = require('events'),
	util = require('util');

function NodeSocketClient(port, ipaddress, options) {
	EventEmitter.call(this);
	
	this._options = options || { };
	this._functions = this._options.functions || { };
	this._port = port;
	this._ipaddress = ipaddress;
	this._socket = undefined;
	this._state = NodeSocketCommon.EnumConnectionState.Disconnected;
	
	this._processCallback = undefined;
	this._processQueue = [];
}
util.inherits(NodeSocketClient, EventEmitter);

NodeSocketClient.prototype.remoteExecute = function(identifier, typemap, args, callback) {
	if(this._state === NodeSocketCommon.EnumConnectionState.Verified) {
		var bufArray = [ new Buffer([ NodeSocketCommon.executionCode.ExecFunction ]) ];
		var buf = new Buffer(4);
		
		buf.writeUInt32LE(identifier.length);
		bufArray.push(buf);
		
		var tempBuf = new Buffer(identifier);
		bufArray.push(tempBuf);
		
		for(var i = 0; i < args.length; i++) {
			var iStr = i.toString();
			var argtype = typemap[iStr];
			
			if(!argtype) {
				switch(typeof args[i]) {
					case 'number':
						if(args[i] === (args[i]|0)) {
							argtype = 'int'; // Default to int for normal numbers
						}
						else {
							argtype = 'float'; // float for anything else
						}
						break;
					case 'string':
						argtype = 'string';
						break;
					default:
						// Error here
						break;
				}
				typemap[iStr] = argtype;
			}
			
			var dataType = NodeSocketCommon.EnumDataType[argtype];
			if(dataType !== undefined) {
				switch(dataType) {
					case NodeSocketCommon.EnumDataType.byte:
						tempBuf = new Buffer(1);
						tempBuf.writeInt8(args[i], 0);
						break;
					case NodeSocketCommon.EnumDataType.ubyte:
						tempBuf = new Buffer(1);
						tempBuf.writeUInt8(args[i], 0);
						break;
					case NodeSocketCommon.EnumDataType.short:
						tempBuf = new Buffer(2);
						tempBuf.writeInt16LE(args[i], 0);
						break;
					case NodeSocketCommon.EnumDataType.ushort:
						tempBuf = new Buffer(2);
						tempBuf.writeUInt16LE(args[i], 0);
						break;
					case NodeSocketCommon.EnumDataType.int:
						tempBuf = new Buffer(4);
						tempBuf.writeInt32LE(args[i], 0);
						break;
					case NodeSocketCommon.EnumDataType.uint:
						tempBuf = new Buffer(4);
						tempBuf.writeUInt32LE(args[i], 0);
						break;
					case NodeSocketCommon.EnumDataType.float:
						tempBuf = new Buffer(4);
						tempBuf.writeFloatLE(args[i], 0);
						break;
					case NodeSocketCommon.EnumDataType.double:
						tempBuf = new Buffer(8);
						tempBuf.writeDoubleLE(args[i], 0);
						break;
					case NodeSocketCommon.EnumDataType.string:
						tempBuf = new Buffer(args[i]);
						break;
					default:
						// Error here
						break;
				}
				var argHeader = new Buffer(5);
				argHeader.writeUInt8(dataType, 0);
				argHeader.writeUInt32LE(tempBuf.length, 1);
				bufArray.push(argHeader);
				bufArray.push(tempBuf);
			}
			else {
				// Error, unsuported type passed in argument
			}
		}
		
		this._processCallback = callback;
		this._state = NodeSocketCommon.EnumConnectionState.Processing;
		this._socket.write(Buffer.concat(bufArray));
	}
	else if(this._state === NodeSocketCommon.EnumConnectionState.Processing) {
		this._processQueue.push(new ProcessQueue(this, this.remoteExecute, arguments));
	}
	else {
		// Error, server not verified or connected
	}
};

NodeSocketClient.prototype.func = function(identifier, typemap) {
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
			this.emit('verified', socket);
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
				default:
					// Error here
					break;
			}
		
			this._processCallback(result);
		}
		else if(serverResponse === NodeSocketCommon.EnumServerResponse.NoResult) {
			this._processCallback(undefined);
		}
		else if(serverResponse === NodeSocketCommon.EnumServerResponse.InvalidFunction) {
			throw Error('NodeSocket server returned an invalid function status code');
		}
		else {
			// Error on server
		}
		
		this._processCallback = undefined;
		
		this._state = NodeSocketCommon.EnumConnectionState.Verified;
		if(this._processQueue.length > 0) {
			this._processQueue.splice(0, 1)[0].execute();
		}
	}
};

NodeSocketClient.prototype._clientConnected = function(socket) {
	this._state = NodeSocketCommon.EnumConnectionState.Connected;
	this.emit('connect', socket);
	
	var self = this;
	socket.on('data', function(buffer) {
		self._serverDataReceived.call(self, socket, buffer);
	});
	
	socket.write(NodeSocketCommon.nodesocketSignature);
};

NodeSocketClient.prototype.start = function() {
	var self = this;
	this._socket = net.connect(this._port, this._ipaddress, function() {
		self._clientConnected.call(self, self._socket);
	});
};

NodeSocketClient.prototype.close = function() {
	if(this._socket) {
		this._socket.end();
	}
};

module.exports = NodeSocketClient;