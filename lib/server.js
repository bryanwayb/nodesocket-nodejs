var net = require('net'),
	NodeSocketCommon = require('./common.js');

function NodeSocketServer(port, ipaddress, options) {
	this._options = options || { };
	this._callbacks = this._options.callbacks || { };
	this._functions = this._options.functions || { };
	this._port = port;
	this._ipaddress = ipaddress;
	
	var self = this;
	this._server = net.createServer(function(c) {
		self._serverListener.call(self, c);
	});
}

NodeSocketServer.prototype._serverListener = function(c) {
	var self = this;
	
	console.log('Client Connected');

	c.on('end', function() {
		console.log('Client Disconnected');
	});
	
	c.on('data', function(buffer) {
		if(self._state == NodeSocketCommon.EnumConnectionState.Connected) {
			if(buffer.slice(0, NodeSocketCommon.netsocketSignature.length).equals(NodeSocketCommon.netsocketSignature)) {
				console.log('SERVER: Client verified');
				c.write(NodeSocketCommon.netsocketSignature);
				c.setKeepAlive(self._options.keepAlive, self._options.keepAliveDelay);
			}
		}
		else if(self._state == NodeSocketCommon.EnumConnectionState.Verified) {
			var execCode = buffer.readUInt8(0);
			switch(execCode) {
				case NodeSocketCommon.executionCode.ExecFunction:
					console.log('Execute function');
					break;
			}
		}
	});
	
	c.on('timeout', function() {
		console.log('Timeout');
		self.close();
	});
	
	c.on('close', function(had_error) {
		console.log('Closing');
	});
};

NodeSocketServer.prototype.start = function() {
	if(this._server) {
		this._server.listen(this._port, this._host, this._options.backlog, function() {
			console.log('Started');
		});
	}
};

NodeSocketServer.prototype.close = function() {
	if(this._server) {
		this._server.close(function() {
			console.log('Server stopped');
		});
	}
};

module.exports = NodeSocketServer;