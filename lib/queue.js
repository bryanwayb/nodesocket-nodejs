function ProcessQueue(thisArg, method, args) {
	this._thisArg = thisArg;
	this._method = method;
	this._args = args;
}

ProcessQueue.prototype.execute = function() {
	this._method.apply(this._thisArg, this._args);
};

module.exports = ProcessQueue;