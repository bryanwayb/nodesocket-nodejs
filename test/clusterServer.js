var cluster = require('cluster');

if(cluster.isMaster)
{
	var cpuCount = require('os').cpus().length;
	for(var i = 0; i < cpuCount; i++) {
		cluster.fork();
	}
	
	cluster.on('exit', function(worker, code, signal) {
		if(code > 0) {
			console.log('Worker ' + worker.process.pid + ' exited abnormally, restarting');
			cluster.fork();
		}
	});
}
else {
	require('./server.js');
}