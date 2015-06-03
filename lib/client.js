var net = require('net'),
	NodeSocketCommon = require('./common.js');

function NodeSocketClient(port, ipaddress, options) {
	this._options = options || { };
	this._callbacks = this._options.callbacks || { };
	this._functions = this._options.functions || { };
	this._port = port;
	this._ipaddress = ipaddress;
	this._socket = undefined;
	this._state = NodeSocketCommon.EnumConnectionState.Disconnected;
}

NodeSocketClient.prototype.start = function() {
	var self = this;
	var socket = net.connect(this._port, this._ipaddress, function() {
		self._state = NodeSocketCommon.EnumConnectionState.Connected;
		
		socket.on('data', function(buffer) {
			if(self._state == NodeSocketCommon.EnumConnectionState.Connected) {
				if(buffer.slice(0, NodeSocketCommon.netsocketSignature.length).equals(NodeSocketCommon.netsocketSignature)) {
					console.log('CLIENT: Server verified');
					self._state = NodeSocketCommon.EnumConnectionState.Verified;
				}
			}
		});
		
		socket.write(NodeSocketCommon.netsocketSignature);
	});
	this._socket = socket;
};

NodeSocketClient.prototype.close = function() {
	if(this._socket) {
		this._socket.end();
	}
};

module.exports = NodeSocketClient;