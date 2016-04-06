"use strict";

function BufferPool(size, maxLength) {
	this.size = size;
	this.pool = [];
	this.maxLength = maxLength || 100;
}

BufferPool.prototype = {
	get: function() {
		var ret = this.pool.pop();
		if(ret) return ret;
		return new Buffer(this.size);
	},
	put: function(buffer) {
		if(!this.maxLength || this.pool.length < this.maxLength)
			this.pool.push(buffer);
	},
	drain: function() {
		this.put = function(){};
	}
};

module.exports = BufferPool;
