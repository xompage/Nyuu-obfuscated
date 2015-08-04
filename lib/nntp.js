"use strict";

var tls = require('tls'), net = require('net');
var async = require('async');

var ENCODING = 'utf8';
var RE_LINE = /^(\d\d\d) (.*)$/;

//exports.log = {info: console.info.bind(console), warn: console.warn.bind(console), debug: console.log.bind(console)};
exports.log = null;

var commands = {
	POST: new Buffer('POST\r\n'),
	AUTH_USER: new Buffer('AUTHINFO USER '),
	AUTH_PASS: new Buffer('AUTHINFO PASS '),
	CRLF: new Buffer('\r\n')
};

var checkExpect = function(expected, name, code, info) {
	if(code != expected)
		return new Error('Unexpected response to '+name+' (code: ' + code + '): ' + info);
};

function NNTP(opts) {
	this.opts = opts;
	this.readQueue = [];
	this.dataQueue = [];
	this._connectRetries = opts.connectRetries;
}

NNTP.prototype = {
	state: 'inactive',
	socket: null,
	_timer: null,
	_finished: false,
	_requesting: false,
	
	connect: function(cb) {
		this.state = 'connecting';
		
		this._setTimer(function() {
			this.destroy(true);
			if(this._connectRetries--) {
				this.warn('NNTP connection timed out, reconnecting after ' +(this.reconnectDelay/1000)+ ' second(s)...');
				this._setTimer(this.connect.bind(this, cb), this.reconnectDelay);
			} else {
				cb(new Error('NNTP connection timeout'));
			}
		}.bind(this), this.opts.connTimeout);
		
		var self = this;
		// TODO: investigate options
		async.waterfall([
			function(cb) {
				var factory = (self.opts.secure ? tls : net);
				self.socket = factory.connect(self.opts.connect, cb);
				self.socket.setTimeout(0); // ???
				
				self.socket.once('end', self._onError.bind(self));
				self.socket.once('error', self._onError.bind(self));
				self.socket.on('data', self._onData.bind(self));
			},
			function(cb) {
				self._clearTimer();
				self._request(null, cb);
			},
			function(code, info, cb) {
				var err = checkExpect(200, 'connect', code, info);
				if(err) return cb(err);
				self.debug('NNTP connection established');
				if(self.opts.user) {
					self.state = 'auth';
					
					self.socket.write(commands.AUTH_USER);
					self.socket.write(self.opts.user, ENCODING);
					self._request(commands.CRLF, cb);
				} else cb(null, null, null);
			},
			function(code, info, cb) {
				if(self.opts.user) {
					var err = checkExpect(381, 'auth user', code, info);
					if(err) return cb(err);
					self.socket.write(commands.AUTH_PASS);
					self.socket.write(self.opts.password, ENCODING);
					self._request(commands.CRLF, cb);
				} else cb(null, null, null);
			},
			function(code, info, cb) {
				if(self.opts.user) {
					var err = checkExpect(281, 'auth pass', code, info);
					if(err) return cb(err);
					
					self.debug('NNTP connection authenticated');
					cb();
				} else cb();
			}
		], function(err) {
			if(err) {
				self.state = 'disconnected';
				return cb(err);
				// TODO: retry connection?
			}
			self.state = 'connected';
			cb();
		});
	},
	_onError: function(err) {
		if(!this._finished) {
			if(err) {
				this.warn('NNTP connection error occurred: ' + err);
			} else {
				this.warn('NNTP connection unexpectedly lost, reconnecting...');
			}
			this.destroy(true);
			this.connect();
		}
		// TODO: need to fix error handling and reconnecting issues
	},
	_onData: function(chunk) {
		// grab incomming lines
		var data = chunk.toString(ENCODING); // TODO: perhaps should be ASCII encoding always?
		var p;
		while((p = data.indexOf('\r\n')) >= 0) {
			var line = this.dataQueue.join('') + data.substr(0, p);
			data = data.substr(p+2);
			this.dataQueue = [];
			
			var m = line.match(RE_LINE);
			if(m && (m[1] == '400' || m[1] == '205'))
				// ignore '400 idle for too long' and '205 Connection closing' messages
				continue;
			var f = this.readQueue.shift();
			if(f) {
				if(m)
					f(null, m[1]|0, m[2].trim());
				else
					f(new Error('Unexpected line format: ' + line));
			} else {
				this.warn('Unexpected response received: ' + line);
			}
		}
		if(data.length) this.dataQueue.push(data);
	},
	end: function() {
		this._finished = true;
		if(this.socket) {
			this.socket.end('QUIT\r\n');
		}
		this.socket = null;
	},
	destroy: function(internalCall) {
		if(!internalCall)
			this._finished = true;
		if(this._timer) 
			this._clearTimer();
		// TODO: flush any wait queues
		
		if(this.socket) {
			this.socket.destroy();
			this.socket = null;
		}
		this.state = 'disconnected';
	},
	date: function(cb) {
		this._request('DATE\r\n', function(err, code, info) {
			var err = checkExpect(111, 'DATE', code, info);
			if(err) return cb(err);
			var m = info.match(/^(\d\d\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/);
			var date;
			if(m) date = new Date(m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + ':' + m[6]);
			if(!date || isNaN(date)) return cb(new Error('Invalid date returned: ' + info));
			cb(null, date);
		});
	},
	stat: function(id, cb) {
		// TODO: how to do this with message-id?
		this._request('STAT ' + id + '\r\n', function(err, code, info) {
			if(code == 423) return cb(null, null); // no such article
			
			var err = checkExpect(223, 'STAT', code, info);
			if(err) return cb(err);
			
			var m = info.match(/^(\d+) <(.*)>$/);
			if(!m) cb(new Error()); // TODO:
			else cb(null, [m[1]|0, m[2]]);
		});
	},
	post: function(msg, cb) {
		this._request(commands.POST, function(err, code, info) {
			var err = checkExpect(340, 'POST', code, info);
			if(err) return cb(err);
			
			this._request(msg, function(err, code, info) {
				var err = checkExpect(240, 'posted article', code, info);
				if(err) return cb(err);
				
				var m = info.match(/^<(.*)> Article received ok$/i);
				if(m)
					cb(null, m[1]);
				else
					cb(new Error('Unexpected response for posted article: ' + info));
			});
			
		}.bind(this));
	},
	_request: function(msg, cb) {
		if(this._requesting)
			throw new Error('Request made whilst another request is in progress');
		// TODO: debug output
		this._requesting = true;
		var self = this;
		if(msg) this.socket.write(msg);
		this._setTimer(function() {
			self._requesting = false;
			// TODO: need to remove the pending callback from the readQueue
			cb(new Error('Response timed out'));
		}, this.opts.timeout);
		this.readQueue.push(function() {
			self._requesting = false;
			self._clearTimer();
			cb.apply(null, arguments);
		});
	},
	
	_setTimer: function(func, time) {
		this._timer = setTimeout(function() {
			this._timer = null;
			func();
		}, time);
	},
	_clearTimer: function() {
		clearTimeout(this._timer);
		this._timer = null;
	},
	warn: function(msg) {
		if(exports.log) exports.log.warn(msg);
	},
	info: function(msg) {
		if(exports.log) exports.log.info(msg);
	},
	debug: function(msg) {
		if(exports.log) exports.log.debug(msg);
	}
};

module.exports = NNTP;
