
function ProcessQueue(thisArg, method, args) { // Used to store function calls and their arguments to execute at a later time
	this._thisArg = thisArg;
	this._method = method;
	this._args = args;
}

ProcessQueue.prototype.execute = function() {
	this._method.apply(this._thisArg, this._args);
};

function makeBufferPosResponse(value, position) {
	return {
		value: value,
		position: position
	};
}

module.exports = {
	nodesocketSignature: new Buffer('nsockv01', module.exports.encoding),
	encoding: 'utf-8',
	
	EnumConnectionState: {
		Disconnected:	0x0,
		Connected:		0x1,
		Verified:		0x2,
		Processing:		0x3,
		_max:			0x4
	},
	EnumExecutionCode: {
		RequestMaster:	0x0,
		RequestSlave:	0x1,
		ExecFunction:	0x2,
		_max: 			0x3
	},
	EnumDataType: {
		'byte':		0x0,
		'ubyte':	0x1,
		'short':	0x2,
		'ushort':	0x3,
		'int':		0x4,
		'uint':		0x5,
		'float':	0x6,
		'double':	0x7,
		'string':	0x8,
		'boolean':	0x9,
		_max: 		0xA
	},
	EnumNodeResponse: {
		Okay:				0x0,
		NoResult:			0x1, // Still 'ok', just don't read the result stream, there's nothing there
		InvalidFunction:	0x2,
		NodeError:			0x3,
		InvalidExecCode:	0x4,
		NotAllowed:			0x5,
		_max: 				0x6
	},
	EnumNodeResponseErrorString: {
		0x0: 'Okay',
		0x1: 'Okay',
		0x2: 'An invalid function was specified',
		0x3: 'Node reported an internal error',
		0x4: 'An invalid execution code was specified',
		0x5: 'Remote functions are not allowed from this node, remote is the current master',
	},
	
	ProcessQueue: ProcessQueue,
	
	makePayloadFunctionStore: function(callback, responseType) {
		return {
			callback: callback,
			responseType: responseType
		};
	},
	
	// Function to process and execute a payload buffer and return the response buffer
	parseExecutePayload: function(functions, payload, error) {
		var payloadLength = payload.readUInt32LE(0);
		var identifierEndPosition = 8 + payload.readUInt32LE(4);
		var identifier = payload.slice(8, identifierEndPosition).toString(module.exports.encoding);
		
		var position = identifierEndPosition;
		
		var response = [ new Buffer(1) /* Status code response */ ];
		if(identifier in functions) {
			var args = [];
			for(; position < payloadLength;) {
				var dataType = payload.readUInt8(position++);
				var dataSize = payload.readUInt32LE(position);
				position += 4;
				var value = undefined;
				switch(dataType) {
					case module.exports.EnumDataType.byte:
						value = payload.readInt8(position);
						position++;
						break;
					case module.exports.EnumDataType.ubyte:
						value = payload.readUInt8(position);
						position++;
						break;
					case module.exports.EnumDataType.short:
						value = payload.readInt16LE(position);
						position += 2;
						break;
					case module.exports.EnumDataType.ushort:
						value = payload.readUInt16LE(position);
						position += 2;
						break;
					case module.exports.EnumDataType.int:
						value = payload.readInt32LE(position);
						position += 4;
						break;
					case module.exports.EnumDataType.uint:
						value = payload.readUInt32LE(position);
						position += 4;
						break;
					case module.exports.EnumDataType.float:
						value = payload.readFloatLE(position);
						position += 4;
						break;
					case module.exports.EnumDataType.double:
						value = payload.readDoubleLE(position);
						position += 8;
						break;
					case module.exports.EnumDataType.string:
						var next = position + dataSize;
						value = payload.slice(position, next).toString(module.exports.encoding);
						position = next;
						break;
					case module.exports.EnumDataType.boolean:
						value = payload.readUInt8(position) > 0;
						position++;
						break;
					default:
						error(new Error('Unsupported data type argument received from client'));
						response[0].writeUInt8(module.exports.EnumNodeResponse.NodeError, 0);
						return response[0]; // Early exit
				}
				
				args.push(value);
			}
	
			var result = functions[identifier].callback.apply(this, args);
			if(result === undefined || result === null) {
				response[0].writeUInt8(module.exports.EnumNodeResponse.NoResult, 0);
			}
			else {
				response[0].writeUInt8(module.exports.EnumNodeResponse.Okay, 0);
				
				var argtype = functions[identifier].responseType;
				
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
						case 'boolean':
							argtype = 'boolean';
							break;
					}
					functions[identifier].responseType = argtype;
				}
				
				var tempBuf = undefined;
				var dataType = module.exports.EnumDataType[argtype];
				if(dataType !== undefined) {
					switch(dataType) {
						case module.exports.EnumDataType.byte:
							tempBuf = new Buffer(1);
							tempBuf.writeInt8(result, 0);
							break;
						case module.exports.EnumDataType.ubyte:
							tempBuf = new Buffer(1);
							tempBuf.writeUInt8(result, 0);
							break;
						case module.exports.EnumDataType.short:
							tempBuf = new Buffer(2);
							tempBuf.writeInt16LE(result, 0);
							break;
						case module.exports.EnumDataType.ushort:
							tempBuf = new Buffer(2);
							tempBuf.writeUInt16LE(result, 0);
							break;
						case module.exports.EnumDataType.int:
							tempBuf = new Buffer(4);
							tempBuf.writeInt32LE(result, 0);
							break;
						case module.exports.EnumDataType.uint:
							tempBuf = new Buffer(4);
							tempBuf.writeUInt32LE(result, 0);
							break;
						case module.exports.EnumDataType.float:
							tempBuf = new Buffer(4);
							tempBuf.writeFloatLE(result, 0);
							break;
						case module.exports.EnumDataType.double:
							tempBuf = new Buffer(8);
							tempBuf.writeDoubleLE(result, 0);
							break;
						case module.exports.EnumDataType.string:
							tempBuf = new Buffer(result);
							break;
						case module.exports.EnumDataType.boolean:
							tempBuf = new Buffer(1);
							tempBuf.writeUInt8(result ? 0x1 : 0x0, 0);
							break;
						default:
							error(new Error('Data type' + dataType + ' has gone unhandled by this node implementation'));
							response[0].writeUInt8(module.exports.EnumNodeResponse.NodeError, 0);
							break;
					}
					
					if(dataType < module.exports.EnumDataType._max) {
						var argHeader = new Buffer(5);
						argHeader.writeUInt8(dataType, 0);
						argHeader.writeUInt32LE(tempBuf.length, 1);
						response.push(argHeader);
						response.push(tempBuf);
					}
				}
				else {
					error(new Error('Unsupported data type returned from nodesocket function'));
					response[0].writeUInt8(module.exports.EnumNodeResponse.NodeError, 0);
				}
			}
		}
		else {
			response[0].writeUInt8(module.exports.EnumNodeResponse.InvalidFunction, 0);
		}
	
		return makeBufferPosResponse(Buffer.concat(response), position);
	},
	
	parseResultPayload: function(buffer) {
		var dataType = buffer.readUInt8(0);
		var dataSize = buffer.readUInt32LE(1);
		var result = undefined;
		
		switch(dataType) {
			case module.exports.EnumDataType.byte:
				result = buffer.readInt8(5);
				break;
			case module.exports.EnumDataType.ubyte:
				result = buffer.readUInt8(5);
				break;
			case module.exports.EnumDataType.short:
				result = buffer.readInt16LE(5);
				break;
			case module.exports.EnumDataType.ushort:
				result = buffer.readUInt16LE(5);
				break;
			case module.exports.EnumDataType.int:
				result = buffer.readInt32LE(5);
				break;
			case module.exports.EnumDataType.uint:
				result = buffer.readUInt32LE(5);
				break;
			case module.exports.EnumDataType.float:
				result = buffer.readFloatLE(5);
				break;
			case module.exports.EnumDataType.double:
				result = buffer.readDoubleLE(5);
				break;
			case module.exports.EnumDataType.string:
				result = buffer.slice(5, dataSize + 5).toString(module.exports.encoding);
				break;
			case module.exports.EnumDataType.ubyte:
				result = buffer.readUInt8(1) > 0;
				break;
			default:
				this.emit('error', new Error('Unrecognized data type ' + dataType + ' returned from node'), this._socket);
				return; // Stop processing here
		}
		
		return makeBufferPosResponse(result, 5 + dataSize);
	},
	
	// Creates a remote function payload and sends it
	createExecutePayload: function(identifier, typemap, args, error) {
		var bufArray = [ new Buffer([ module.exports.EnumExecutionCode.ExecFunction ]) ];
		bufArray.push(new Buffer(4)); // [1] = reserverd for total payload size, minus the execution code
		
		var buf = new Buffer(4);
		buf.writeUInt32LE(identifier.length);
		bufArray.push(buf);
		
		var tempBuf = new Buffer(identifier);
		bufArray.push(tempBuf);
		
		var payloadLength = 4 + identifier.length;
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
					case 'boolean':
						argtype = 'string';
						break;
				}
				typemap[iStr] = argtype;
			}
			
			var dataType = module.exports.EnumDataType[argtype];
			if(dataType !== undefined) {
				switch(dataType) {
					case module.exports.EnumDataType.byte:
						tempBuf = new Buffer(1);
						tempBuf.writeInt8(args[i], 0);
						break;
					case module.exports.EnumDataType.ubyte:
						tempBuf = new Buffer(1);
						tempBuf.writeUInt8(args[i], 0);
						break;
					case module.exports.EnumDataType.short:
						tempBuf = new Buffer(2);
						tempBuf.writeInt16LE(args[i], 0);
						break;
					case module.exports.EnumDataType.ushort:
						tempBuf = new Buffer(2);
						tempBuf.writeUInt16LE(args[i], 0);
						break;
					case module.exports.EnumDataType.int:
						tempBuf = new Buffer(4);
						tempBuf.writeInt32LE(args[i], 0);
						break;
					case module.exports.EnumDataType.uint:
						tempBuf = new Buffer(4);
						tempBuf.writeUInt32LE(args[i], 0);
						break;
					case module.exports.EnumDataType.float:
						tempBuf = new Buffer(4);
						tempBuf.writeFloatLE(args[i], 0);
						break;
					case module.exports.EnumDataType.double:
						tempBuf = new Buffer(8);
						tempBuf.writeDoubleLE(args[i], 0);
						break;
					case module.exports.EnumDataType.string:
						tempBuf = new Buffer(args[i]);
						break;
					case module.exports.EnumDataType.boolean:
						tempBuf = new Buffer(1);
						tempBuf.writeUInt8(args[i] ? 0x1 : 0x0, 0);
						break;
					default:
						error(new Error('Data type' + dataType + ' has gone unhandled by client'));
						return;
				}
				var argHeader = new Buffer(5);
				argHeader.writeUInt8(dataType, 0);
				argHeader.writeUInt32LE(tempBuf.length, 1);
				bufArray.push(argHeader);
				bufArray.push(tempBuf);
				
				payloadLength += argHeader.length + tempBuf.length;
			}
			else {
				error(new Error('Unsupported data type argument passed to remote function'));
				return;
			}
		}
		
		bufArray[1].writeUInt32LE(payloadLength);
		
		return Buffer.concat(bufArray);
	}
};