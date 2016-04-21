"use strict";

var spawn = require('child_process').spawn;

function ProcessManager() {
	this.procs = {};
}

ProcessManager.prototype = {
	running: 0,
	_onEndHook: null,
	start: function(cmd, opts) {
		var proc;
		if(process.platform === 'win32') {
			opts.windowsVerbatimArguments = true;
			proc = spawn(process.env.comspec || 'cmd.exe', ['/s', '/c', '"' + cmd + '"'], opts);
		} else {
			proc = spawn('/bin/sh', ['-c', cmd], opts);
		}
		this.procs[proc.pid] = proc;
		this.running++;
		
		var onExit = this._onExit.bind(this, proc.pid);
		proc.once('exit', onExit);
		proc.once('error', onExit);
	},
	
	_onExit: function(pid) {
		delete this.procs[pid];
		this.running--;
		if(this.running < 1 && this._onEndHook) {
			this._onEndHook();
			this._onEndHook = null;
		}
	},
	
	killAll: function(sig) {
		for(var pid in this.procs)
			this.procs[pid].kill(sig);
	},
	
	// Limitation: can only assign one hook!
	onEnd: function(f) {
		this._onEndHook = f;
	}
};

module.exports = ProcessManager;
