module.exports = {
	netsocketSignature: new Buffer('nsockv01', 'utf-8'),
	EnumConnectionState: (function() {
		var i = 0;
		return {
			Disconnected: i++,
			Connected: i++,
			Verified: i++,
			_max: i
		};
	})(),
	executionCode: {
		ExecFunction:	0x1,
		ReverseRequest:	0x2
	}
};