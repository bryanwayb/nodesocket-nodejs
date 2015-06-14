var net = require('net'),
	tls = require('tls'),
	crypto = require('crypto'),
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
	
	if(this._options.webSocket) {
		this._buffer = ''; // Carry-over storage for WebSocket frames
		this._bufferOpCode = 0;
	}
	
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

function makeHttpResponse(httpCode, headers) {
	var ret = 'HTTP/1.1 ' + httpCode + '\r\n';
	if(headers) {
		for(var i = 0; i < headers.length; i++) {
			ret += headers[i] + '\r\n';
		}
	}
	return (ret += '\r\n');
}

NodeSocketServer.prototype._nodeWebSocketDataReceived = function(client, socket, buffer) {
	this.emit('data', client, socket, buffer);

	// This section conforms to the HTTP 1.1 protocol and the Dec, 2011 revision of the WebSocket protocol
	//	https://tools.ietf.org/html/rfc6455
	if(client._state === NodeSocketCommon.EnumConnectionState.WebSocketConnected) {
		var httpMessage = buffer.toString();
	
		// Begin parsing the HTTP request
		var httpRequestLineEnd = Math.max(httpMessage.indexOf('\r\n'), 0);
		var httpRequestLine = httpMessage.slice(0, httpRequestLineEnd).split(/ /gm);
		
		if(httpRequestLine[0] !== 'GET') {
			socket.end(makeHttpResponse('405 Method Not Allowed'));
			this.emit('error', new Error('Client request method must be GET, received ' + httpRequestLine[0]), client, socket);
			return;
		}
		
		var httpVersion = httpRequestLine[2].split(/\//);
		if(httpVersion[1] < 1.1) {
			socket.end(makeHttpResponse('505 HTTP Version not supported'));
			this.emit('error', new Error('Client request specify HTTP 1.1 or greater, received ' + httpRequestLine[2]), client, socket);
			return;
		}
		
		var httpRequestHost;
		var httpUpgrade;
		var httpConnection;
		var httpSecWebSocketKey;
		var httpSecWebSocketProtocol;
		var httpRequestOrigin;
		
		var httpRequestHeaders = httpMessage.slice(httpRequestLineEnd + 2, Math.max(httpMessage.indexOf('\r\n\r\n'), httpMessage.length)).split(/\r\n/gm);
		for(var i = 0; i < httpRequestHeaders.length; i++) {
			var headerSeperationIndex = Math.max(httpRequestHeaders[i].indexOf(':'), 0);
			
			var headerName = httpRequestHeaders[i].slice(0, headerSeperationIndex).trim();
			var headerValue = httpRequestHeaders[i].slice(headerSeperationIndex + 1).trim();
			
			switch(headerName.toLowerCase()) {
				case 'host':
					var hostPortPosition = headerValue.indexOf(':');
					if(hostPortPosition === -1) {
						hostPortPosition = headerValue.length;
					}
					httpRequestHost = headerValue.slice(0, hostPortPosition);
					break;
				case 'origin':
					httpRequestOrigin = headerValue;
					break;
				case 'upgrade':
					httpUpgrade = headerValue.toLowerCase();
					break;
				case 'connection':
					httpConnection = headerValue.toLowerCase();
					break;
				case 'sec-websocket-key':
					httpSecWebSocketKey = headerValue;
					break;
				case 'sec-websocket-protocol':
					httpSecWebSocketProtocol = headerValue.toLowerCase().split(/,/);
					for(var o = 0; o < httpSecWebSocketProtocol.length; o++) {
						httpSecWebSocketProtocol[o] = httpSecWebSocketProtocol[o].trim();
					}
					break;
			}
		}
		
		if(this._options.webSocketVerifyHost && httpRequestHost !== this._ipaddress) {
			socket.end(makeHttpResponse('404 Not Found'));
			this.emit('error', new Error('Client specified a different host than what is allowed, received ' + (httpRequestHost ? httpRequestHost : '(no host sent)')), client, socket);
			return;
		}
		
		if(httpConnection !== 'upgrade' || httpUpgrade !== 'websocket' || !httpSecWebSocketKey || !httpRequestOrigin) {
			socket.end(makeHttpResponse('400 Bad Request'));
			this.emit('error', new Error('Client sent a malformed WebSocket request'), client, socket);
			return;
		}
		
		if(!httpSecWebSocketProtocol || httpSecWebSocketProtocol.indexOf('nodesocket') === -1) {
			socket.end(makeHttpResponse('400 Bad Request'));
			this.emit('error', new Error('Client does not specify the NodeSocket sub-protocol'), client, socket);
			return;
		}
		
		client._state = NodeSocketCommon.EnumConnectionState.Connected;
		
		socket.write(makeHttpResponse('101 Switching Protocols', [
			'Upgrade: websocket',
			'Connection: Upgrade',
			'Sec-WebSocket-Accept: ' + crypto.createHash('sha1').update(httpSecWebSocketKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64'),
			'Sec-WebSocket-Protocol: nodesocket'
		]));
	}
	else if(client._state !== NodeSocketCommon.EnumConnectionState.Disconnected) {
		var frame = NodeSocketCommon.parseWebSocketFrame(buffer);
		
		if(frame.opcode === 0x9) {
			frame.opcode = 0xA;
			socket.write(NodeSocketCommon.makeWebSocketFrame(frame));
		}
		else if(frame.opcode >= 0x0 && frame.opcode <= 0x2) {
			// Call _nodeDataReceived here and wrap response in WebSocket frame.
			// TODO: Need to create a wrapper for writing to the client
		}
	}
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
	
	var dataCallback = undefined;
	if(this._options.webSocket) {
		dataCallback = this._nodeWebSocketDataReceived;
		client._state = NodeSocketCommon.EnumConnectionState.WebSocketConnected;
	}
	else {
		dataCallback = this._nodeDataReceived;
		client._state = NodeSocketCommon.EnumConnectionState.Connected;
	}
	
	this.emit('connect', client, socket);
	
	socket.on('error', function(error) {
		self._nodeSocketError.call(self, client, socket, error);
	});

	socket.on('end', function() {
		self._nodeDisconnected.call(self, client, socket);
	});

	socket.on('data', function(buffer) {
		dataCallback.call(self, client, socket, buffer);
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