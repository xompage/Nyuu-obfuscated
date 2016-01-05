"use strict";

module.exports = function() {
	this.queue = [];
	this.takeQueue = [];
};

module.exports.prototype = {
	pendingAdds: 0,
	hasFinished: false,
	add: function(time, data) {
		if(time <= 0) // NOTE: result is undefined for time < 0
			this._add(data);
		else {
			setTimeout(function() {
				this._add(data);
				this.pendingAdds--;
				if(this.hasFinished && !this.pendingAdds)
					this._flushTakes();
			}.bind(this), time);
			this.pendingAdds++;
		}
	},
	_add: function(data) {
		// if there's something waiting for data, just give it
		var f = this.takeQueue.shift();
		if(f !== undefined)
			return f(data);
		
		// enqueue data
		this.queue.push(data);
	},
	take: function(cb) {
		var ret = this.queue.shift();
		if(ret === undefined) {
			if(this.takeQueue)
				this.takeQueue.push(cb); // waiting for data
			else
				cb(); // already finished
		} else {
			cb(ret);
		}
	},
	takeSync: function() {
		return this.queue.shift();
	},
	finished: function() {
		this.add = function() {
			throw new Error('Cannot add after finished');
		};
		this.hasFinished = true;
		if(!this.pendingAdds)
			this._flushTakes();
	},
	_flushTakes: function() {
		var f;
		while(f = this.takeQueue.shift())
			f();
		this.takeQueue = null;
	}
};

