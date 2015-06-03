var NodeSocketServer = require('./server.js');
var NodeSocketClient = require('./client.js');

function NodeSocket(options) {
	this._options = options || { };
}

NodeSocket.prototype.createServer = function(port, ipaddress) {
	return new NodeSocketServer(port, ipaddress, this._options);
};

NodeSocket.prototype.createClient = function(port, ipaddress) {
	return new NodeSocketClient(port, ipaddress, this._options);
};

module.exports = function(options) {
	return new NodeSocket(options);
};