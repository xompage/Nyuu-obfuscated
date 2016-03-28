"use strict";

module.exports = function(size) {
	this.queue = [];
	this.addQueue = [];
	this.takeQueue = [];
	this.size = size || 10;
};

// TODO: consider ability to cancel the queue

module.exports.prototype = {
	pendingAdds: 0,
	hasFinished: false,
	add: function(time, data, cb) {
		if(time <= 0) // NOTE: result is undefined for time < 0
			this._add(data, cb);
		else {
			setTimeout(function() {
				this.pendingAdds--;
				this._add(data, cb);
				if(this.hasFinished && !this.pendingAdds)
					this._flushTakes();
			}.bind(this), time);
			this.pendingAdds++;
		}
	},
	_add: function(data, cb) {
		// if there's something waiting for data, just give it
		var f = this.takeQueue.shift();
		if(f !== undefined) {
			f(data);
		} else {
			this.queue.push(data);
		}
		if(cb) {
			if(this.queue.length+this.pendingAdds > this.size)
				this.addQueue.push(cb); // size exceeded, so defer callback
			else
				cb();
		}
	},
	take: function(cb) {
		var ret = this.queue.shift();
		if(ret === undefined) {
			if(this.takeQueue)
				this.takeQueue.push(cb); // waiting for data
			else
				cb(); // already finished
		} else {
			if(this.queue.length+this.pendingAdds <= this.size) {
				var next = this.addQueue.shift();
				if(next) next(); // signal that more data can be added
			}
			cb(ret);
		}
	},
	takeSync: function() {
		var ret = this.queue.shift();
		if(ret !== undefined) {
			var next = this.addQueue.shift();
			if(next) next(); // signal that more data can be added
		}
		return ret;
	},
	finished: function() {
		this.add = function() {
			throw new Error('Cannot add after finished');
		};
		this.hasFinished = true;
		if(!this.pendingAdds)
			this._flushTakes();
	},
	totalQueueSize: function() {
		return this.pendingAdds + this.queue.length;
	},
	isEmpty: function() {
		return !this.pendingAdds && !this.queue.length && !this.addQueue.length;
	},
	_flushTakes: function() {
		var f;
		while(f = this.takeQueue.shift())
			f();
		this.takeQueue = null;
	}
};

