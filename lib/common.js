module.exports = {
	nodesocketSignature: new Buffer('nsockv01'),
	EnumConnectionState: (function() {
		var i = 0;
		return {
			Disconnected:	i++,
			Connected:		i++,
			Verified:		i++,
			Processing:		i++,
			_max:			i
		};
	})(),
	EnumExecutionCode: (function() {
		var i = 0;
		return {
			ClientReady:	i++,
			ExecFunction:	i++,
			_max: 		i
		};
	})(),
	EnumDataType: (function() {
		var i = 0;
		return {
			'byte':		i++,
			'ubyte':	i++,
			'short':	i++,
			'ushort':	i++,
			'int':		i++,
			'uint':		i++,
			'float':	i++,
			'double':	i++,
			'string':	i++,
			'boolean':	i++,
			_max: 		i
		};
	})(),
	EnumServerResponse: (function() {
		var i = 0;
		return {
			Okay:				i++,
			NoResult:			i++, // Still 'ok', just don't read the result stream, there's nothing there
			InvalidFunction:	i++,
			ServerError:		i++,
			_max: 				i
		};
	})(),
	
	// Function to process and execute a payload buffer and return the response buffer
	parseExecutePayload: function(functions, payload, error) {
		var identifierEndPosition = 4 + payload.readUInt32LE(0);
		var identifier = payload.slice(4, identifierEndPosition).toString();
		
		var response = [ new Buffer(1) /* Status code response */ ];
		if(identifier in functions) {
			var args = [];
			for(var i = identifierEndPosition; i < payload.length;) {
				var dataType = payload.readUInt8(i++);
				var dataSize = payload.readUInt32LE(i);
				i += 4;
				var value = undefined;
				switch(dataType) {
					case module.exports.EnumDataType.byte:
						value = payload.readInt8(i);
						i++;
						break;
					case module.exports.EnumDataType.ubyte:
						value = payload.readUInt8(i);
						i++;
						break;
					case module.exports.EnumDataType.short:
						value = payload.readInt16LE(i);
						i += 2;
						break;
					case module.exports.EnumDataType.ushort:
						value = payload.readUInt16LE(i);
						i += 2;
						break;
					case module.exports.EnumDataType.int:
						value = payload.readInt32LE(i);
						i += 4;
						break;
					case module.exports.EnumDataType.uint:
						value = payload.readUInt32LE(i);
						i += 4;
						break;
					case module.exports.EnumDataType.float:
						value = payload.readFloatLE(i);
						i += 4;
						break;
					case module.exports.EnumDataType.double:
						value = payload.readDoubleLE(i);
						i += 8;
						break;
					case module.exports.EnumDataType.string:
						var next = i + dataSize;
						value = payload.slice(i, next).toString();
						i = next;
						break;
					case module.exports.EnumDataType.boolean:
						value = payload.readUInt8(i) > 0;
						i++;
						break;
					default:
						error(new Error('Unsupported data type argument received from client'));
						response[0].writeUInt8(module.exports.EnumServerResponse.ServerError, 0);
						return response[0]; // Early exit
				}
				
				args.push(value);
			}
	
			var result = functions[identifier].callback.apply(this, args);
			if(result === undefined || result === null) {
				response[0].writeUInt8(module.exports.EnumServerResponse.NoResult, 0);
			}
			else {
				response[0].writeUInt8(module.exports.EnumServerResponse.Okay, 0);
				
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
							error(new Error('Data type' + dataType + ' has gone unhandled by server'));
							response[0].writeUInt8(module.exports.EnumServerResponse.ServerError, 0);
							break;
					}
					
					if(dataType < module.exports.EnumDataType._max) {
						response.push(new Buffer([ dataType ]));
						response.push(tempBuf);
					}
				}
				else {
					error(new Error('Unsupported data type returned from nodesocket function'));
					response[0].writeUInt8(module.exports.EnumServerResponse.ServerError, 0);
				}
			}
		}
		else {
			response[0].writeUInt8(module.exports.EnumServerResponse.InvalidFunction, 0);
		}
	
		return Buffer.concat(response);
	},
	// Creates a remote function payload and sends it
	createExecutePayload: function(identifier, typemap, args, error) {
		var bufArray = [ new Buffer([ module.exports.EnumExecutionCode.ExecFunction ]) ];
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
			}
			else {
				error(new Error('Unsupported data type argument passed to remote function'));
				return;
			}
		}
		
		return Buffer.concat(bufArray);
	}
};