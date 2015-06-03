module.exports = {
	netsocketSignature: new Buffer('nsockv01'),
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
	executionCode: {
		ExecFunction:	0x1,
		ReverseRequest:	0x2
	},
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
			_max: 		i
		};
	})(),
	EnumServerResponse: (function() {
		var i = 0;
		return {
			Okay:		i++,
			NoResult:	i++, // Still 'ok', just don't read the result stream, there's nothing there
			_max: 		i
		};
	})(),
};