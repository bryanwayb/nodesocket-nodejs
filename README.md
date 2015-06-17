NodeSocket for NodeJS
==

A network protocol for an execution space amongst application instances, via a slave to master relationship.

Server
--
```JavaScript
var nodesocket = require('nodesocket');
var server = nodesocket().createServer(8080, 'localhost');

server.defineFunction('remoteFunction', function() {
	console.log('Executed on the server. Closing...');
	server.close();
});

server.start();
```
By default, the server node is configured to be the slave, receiving function calls from the client.
Calling `defineFunction` configures the server instance to call the passed callback when that specific command is received from a client (master).

Client
--
```JavaScript
var nodesocket = require('nodesocket');
var client = nodesocket().createClient(8080, 'localhost');

var remoteFunction = client.linkFunction('remoteFunction');

client.on('verified', function() {
	remoteFunction(function() {
		console.log('Function returned. Closing...');
		client.close();
	});
});

client.connect();
```
Once the server is setup to receive a function called `'remoteFunction'`, you can create a 'linked' function by calling the appropriately named `linkFunction` function.
The process of connecting a client a server is slightly different because first the server must be verified as a NodeSocket node (when acting as a master). This is handled via the `'verified'` event that is raised.
Once verified, the client and server being 'talking' to each other in a language they both understand (being the NodeSocket protocol).

Switching Roles
==
By default the client's role is the master and the server is the slave, but these roles can be reversed, allowing the server to call functions residing on the client node.

As a client:
```JavaScript
client.defineFunction('remoteFunction', function() {
	console.log('Executed on the client. Closing...');
	client.close();
});

client.on('verified', function() {
	client.requestSlave(); // Tells server to take the reigns
});
```

To handle this request on the server:

```JavaScript
server.on('masterRequest', function(client) {
	var remoteFunction = client.linkFunction('remoteFunction');
	remoteFunction(function() {
		console.log('Function returned. Closing...');
		server.close();
	});
});
```

It's also possible for a server to request to become the master, without the clients initiative:

```JavaScript
server.on('verified', function(client) {
	client.requestMaster();
});

server.on('masterRequest', function(client) {
	// etc...
});
```

For security reasons it's also possible for a client to disable a remote becoming the master by passing the `denyMasterRequests: true` option in the `nodesocket` initializer:

```JavaScript
var nodesocket = require('nodesocket');
var client = nodesocket({
	denyMasterRequests: true
}).createClient(8080, 'localhost');
```

Passing Arguments
==
Passing arguments to a master function is incredibly simple, with almost no strings attached.

Client example:
```JavaScript
var remoteFunction = client.linkFunction('remoteFunction');

client.on('verified', function() {
	remoteFunction(function(result) {
		console.log('Result: ' + result);
	}, 'this is a parameter', 12.5, 10, true);
	/* Will output:
		Result: 125
	*/
});
```

Server example:
```JavaScript
server.defineFunction('remoteFunction', function(s, f, n, b) {
	console.log('The following parameters were passed:');
	for(var arg in arguments) {
		console.log(arg + ': ' + arguments[arg]);
	}
	
	return n * f;
	
	/* Will output:
		0: this is a parameter
		1: 12.5
		2: 10
		3: true
	*/
});
```

Type Mapping
--

Depending on the use, there may come a time when a specific datatype will be needed when passed to a linked function. These are taken care of during the initial function link, like so:

```JavaScript
var example = client.linkFunction('example', [
	'0': 'string',
	'1': 'uint',
	'2': 'double',
	// etc...
]);
```

This allows to sending of the right datatype, because otherwise defaults will be used and cached for future calls to the remote function (for performance reasons).

When defining a function, you can do the same with the return datatype:

```JavaScript
server.defineFunction('example', function(s, ui, d) {
	return 10.25;
}, 'float');
```

**Data types:**

>byte
ubyte
short
ushort
int
uint
float
double
string
boolean

*Note:* The current version of the NodeSocket protocol **does not** support arrays. If use of arrays are required, you can use the `apply` function for serialize/deserialize to JSON.

WebSocket Support
==
A WebSocket capable server can be configured by passing the `webSocket: true` option in the `nodesocket` initializer. You can also require that the requested host match the host/IP that the server is bound to with `webSocketVerifyHost: true`.

```JavaScript
var server = nodesocket({
	webSocket: true,
	webSocketVerifyHost: true /* Requires hostname to match 'localhost' */
}).createServer(8080, 'localhost');
```

The web browser implementation for the NodeSocket protocol can be found here: https://github.com/bryanwayb/nodesocket-browserify

SSL/TLS
==
Encrypted communication is also possible. To enable, pass `secure: true` to the `nodesocket` initializer options, as well as any options that would normally be passed to the NodeJS TLS/SSL API for configuration, as those options are passed through.

For a full list of the available configuration options, check out the NodeJS API documentation for [servers](https://nodejs.org/api/tls.html#tls_tls_createserver_options_secureconnectionlistener) and [clients](https://nodejs.org/api/tls.html#tls_tls_connect_port_host_options_callback).