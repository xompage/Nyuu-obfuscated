"use strict";

function BufferedStreamReader(stream, bufferSize) {
	this.stream = stream;
	this.bufferSize = bufferSize || 65536; // default to 64K
	this.bufferQueue = [];
	this.readQueue = [];
	
	var onData = this.onData.bind(this),
	    onEnd = this.onEnd.bind(this),
	    onError = this.onError.bind(this);
	stream.on('data', onData);
	stream.once('end', onEnd);
	stream.once('close', onError);
	stream.once('error', onError);
	this._removeListeners = function() {
		this.stream.removeListener('data', onData);
		this.stream.removeListener('end', onEnd);
		this.stream.removeListener('close', onError);
		this.stream.removeListener('error', onError);
	};
}
BufferedStreamReader.prototype = {
	_eof: false,
	EOF: false,
	bufferedLen: 0,
	err: null,
	
	onData: function(chunk) {
		this.bufferQueue.push(chunk);
		this.bufferedLen += chunk.length;
		
		// if awaiting stuff, push to read
		while(this.readQueue.length && this.readQueue[0][0] <= this.bufferedLen) {
			var req = this.readQueue.shift();
			this._readout.apply(this, req);
		}
		
		var nextReadLen = this.readQueue.length ? this.readQueue[0][0] : 0;
		if(this.bufferedLen >= Math.max(this.bufferSize, nextReadLen))
			this.stream.pause();
	},
	onEnd: function() {
		this._eof = true;
		// push out all remaining read requests
		var q = this.readQueue;
		this.readQueue = null;
		this._closeStream();
		q.forEach(function(req) {
			this._readout.apply(this, req);
		}.bind(this));
	},
	onError: function(err) {
		this.err = err = err || new Error('Stream closed');
		var q = this.readQueue;
		this.close();
		q.forEach(function(req) {
			req[1](err);
		});
	},
	read: function(size, cb) {
		if(this.EOF || this.err) return cb(this.err);
		if(!this.readQueue.length && this.bufferedLen >= size) {
			this._readout(size, cb);
			if(!this._eof && this.bufferedLen < this.bufferSize)
				this.stream.resume();
		} else
			this.readQueue.push([size, cb]);
	},
	close: function() {
		this._closeStream();
		this.bufferQueue = null;
		this.readQueue = null;
	},
	_closeStream: function() {
		if(this.stream) {
			this._removeListeners();
			this.stream.close();
			this.stream = null;
		}
	},
	
	// read out size bytes from buffer and send to cb
	_readout: function(size, cb) {
		if(this.EOF) return cb(null, null);
		var l = 0;
		for(var i=0; i<this.bufferQueue.length; i++) {
			var buf = this.bufferQueue[i];
			var newL = l + buf.length;
			if(newL >= size) {
				// we're done, stop here
				var bufs;
				if(newL == size) {
					// chunk sizes just happens to match exactly
					bufs = this.bufferQueue.splice(0, i+1);
				} else {
					// need to split up the last chunk
					bufs = i ? this.bufferQueue.splice(0, i) : [];
					bufs.push(this.bufferQueue.slice(0, size - l));
					this.bufferQueue[0] = this.bufferQueue[0].slice(size - l);
				}
				this.bufferedLen -= size;
				cb(null, Buffer.concat(bufs, size));
				return;
			} else {
				l = newL;
			}
		}
		if(this._eof) {
			// put through all remaining data
			var bufs = this.bufferQueue;
			this.bufferQueue = [];
			this.bufferedLen = 0;
			this.EOF = true;
			cb(null, Buffer.concat(bufs, l));
		} else {
			throw new Error('Insufficient data to cover request!');
		}
	}
};

module.exports = BufferedStreamReader;
