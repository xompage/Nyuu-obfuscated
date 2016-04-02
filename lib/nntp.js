"use strict";

var tls = require('tls'), net = require('net');
var async = require('async');
var crypto = require('crypto');

var ENCODING = 'utf8';
var RE_LINE = /^(\d\d\d) (.*)\r\n$/;
var MAX_RECV_SIZE = 16384; // 16KB should be *plenty* of space for a response

var commands = {
	POST: new Buffer('POST\r\n'),
	AUTH_USER: new Buffer('AUTHINFO USER '),
	AUTH_PASS: new Buffer('AUTHINFO PASS '),
	CRLF: new Buffer('\r\n')
};

var checkExpect = function(expected, name, code, info) {
	if(code != expected)
		return new NNTPError('bad_response', 'Unexpected response to '+name+' (code: ' + code + '): ' + info);
};

function NNTPError(code, message) {
	var r = Error.call(this, message);
	r.name = 'NNTPError';
	r.code = code;
	r.message = message;
	return r;
}
NNTPError.prototype = Object.create(Error.prototype, {
	constructor: NNTPError
});

function NNTP(opts) {
	this.opts = opts;
	this.dataQueue = [];
	this.dataLength = 0;
	this._connectRetries = opts.connectRetries;
	
	if(!this.opts.connect.port)
		this.opts.connect.port = this.opts.secure ? 563 : 119;
}

// we only make this function externally accessible for testing purposes
NNTP._makeMsgId = function() {
	return Date.now() + '.' + crypto.pseudoRandomBytes(16).toString('hex') + '@nyuu';
};

var emptyFn = function(){};

NNTP.prototype = {
	state: 'inactive',
	active: false,
	socket: null,
	_timer: null,
	_finished: false,
	_requesting: false,
	_requestingFunc: null,
	_respFunc: null,
	_lastError: null,
	_postRetries: null,
	_connectCb: null,
	canPost: null,
	currentGroup: null,
	
	connect: function(cb) {
		this.state = 'connecting';
		this.active = true;
		this._lastError = null;
		this._finished = false;
		
		// clear the data queue just in case (shouldn't be necessary as it's cleared on close)
		this.dataQueue = [];
		this.dataLength = 0;
		
		this._connectCb = cb;
		cb = cb || emptyFn;
		
		if(this._timer) this._clearTimer(); // if request timer is active, clear it
		
		this._setTimer(this._onConnectFail.bind(this, new NNTPError('connect_timeout', 'Connect timed out')), this.opts.connTimeout);
		
		var self = this;
		var onConnectFail = this._onConnectFail.bind(this);
		async.waterfall([
			function(cb) {
				var factory = (self.opts.secure ? tls : net);
				self.socket = factory.connect(self.opts.connect, cb);
				self.debug('Connecting to nntp' + (self.opts.secure ? 's':'') + '://' + self.opts.connect.host + ':' + self.opts.connect.port + '...');
				
				self.socket.once('error', onConnectFail);
				self.socket.once('end', onConnectFail);
				self.socket.once('close', self._onClose.bind(self));
				self.socket.on('data', self._onData.bind(self));
			},
			function(cb) {
				if(self._lastError) return;
				self._clearTimer(); // clear connection timeout timer
				self._request(null, cb);
			},
			function(code, info, cb) {
				if(self._lastError) return;
				
				self.debug('NNTP connection established');
				if(code == 201) {
					self.canPost = false;
					self.debug('NNTP server won\'t accept posts');
				} else {
					var err = checkExpect(200, 'connect', code, info);
					if(err) return cb(err);
					self.canPost = true;
				}
				if(self.opts.user) {
					self.state = 'auth';
					
					self.socket.write(commands.AUTH_USER);
					self.socket.write(self.opts.user, ENCODING);
					self._request(commands.CRLF, cb);
				} else cb(null, null, null);
			},
			function(code, info, cb) {
				if(self.opts.user) {
					if(self._lastError) return;
					
					var err = checkExpect(381, 'auth user', code, info);
					if(err) return cb(err);
					self.socket.write(commands.AUTH_PASS);
					self.socket.write(self.opts.password, ENCODING);
					self._request(commands.CRLF, cb);
				} else cb(null, null, null);
			},
			function(code, info, cb) {
				if(self.opts.user) {
					if(self._lastError) return;
					
					var err = checkExpect(281, 'auth pass', code, info);
					if(err) return cb(err);
					
					self.debug('NNTP connection authenticated');
					cb();
				} else cb();
			},
			function(cb) {
				// group previously selected - re-select it
				if(self.currentGroup) {
					self._request('GROUP ' + self.currentGroup + '\r\n', self._groupResponse.bind(self, cb));
				} else cb();
			}
		], function(err) {
			if(err)
				return self._onConnectFail(err);
			self._connectCb = null;
			self._lastError = null;
			self.state = 'connected';
			self.socket.removeListener('error', onConnectFail);
			self.socket.removeListener('end', onConnectFail);
			self.socket.once('error', self._onError.bind(self));
			self.socket.once('end', self._onError.bind(self));
			self.debug('NNTP connection ready');
			self._connectRetries = self.opts.connectRetries; // reset connect retry counter
			if(self._requesting) {
				// rescheduled request
				self.debug('Retrying last request');
				var reschedReq = self._requesting;
				self._requesting = false;
				self[self._requestingFunc].apply(self, reschedReq);
			}
			cb();
		});
	},
	// TODO: consider merging this stuff with _onError so that this function is only used for dealing with connect timeouts
	// we'll probably want max reconnect tries + delays for _onError
	_onConnectFail: function(err) {
		this._lastError = err;
		var cb = this._connectCb || emptyFn;
		this._connectCb = null;
		if(this._timer) this._clearTimer(); // clear connection timeout timer
		err = err || 'connection lost';
		if(this._connectRetries--) {
			this._destroy();
			this.warn('NNTP connection failed: ' + err + ', reconnecting after ' +(this.opts.reconnectDelay/1000)+ ' second(s)...');
			this._setTimer(this.connect.bind(this, cb), this.opts.reconnectDelay);
		} else {
			this.destroy();
			this.active = false;
			cb(new NNTPError('connect_fail', 'NNTP connection failed: ' + err));
		}
	},
	_onClose: function(had_error) {
		this.state = 'disconnected';
		this.dataQueue = [];
		this.dataLength = 0;
		this.debug('NNTP connection closed');
	},
	_onError: function(err) {
		if(!this._finished) {
			if(err) {
				this.warn('NNTP connection error occurred: ' + err);
			} else {
				this.warn('NNTP connection unexpectedly lost, reconnecting...');
			}
			this._destroy();
			this.connect(function(err) {
				if(!err) return;
				this.active = false;
				if(this._requesting) {
					// last param is always the callback; not a really nice assumption, but works
					(this._requesting.slice(-1)[0])(err);
				} else {
					this.warn('NNTP connection now inactive due to reconnect failure: ' + err);
				}
			}.bind(this));
		}
	},
	_onData: function(chunk) {
		// grab incomming lines
		var data = chunk.toString(ENCODING); // TODO: perhaps should be ASCII encoding always?
		var p;
		var whileFunc = function() {
			if((p = data.indexOf('\r\n')) >= 0) return true;
			// check annoying case of a \r and \n in separate chunks
			if(!this.dataQueue.length) return false;
			if(data[0] == '\n' && this.dataQueue[this.dataQueue.length-1].substr(-1) == '\r') {
				p = -1;
				return true;
			}
			return false;
		}.bind(this);
		while(whileFunc()) {
			var line = this.dataQueue.join('') + data.substr(0, p+2);
			data = data.substr(p+2);
			this.dataQueue = [];
			this.dataLength = 0;
			
			var m = line.match(RE_LINE);
			if(m) {
				switch(m[1]) {
					// ignore '400 idle for too long' and '205 Connection closing' messages
					case '400':
						this.info('Server sent message "' + m[0] + '"');
					case '205':
						continue;
					case '200':
					case '201':
						if(this.state != 'connecting') {
							// this seems to usually indicate a connection reset
							// we'll deal with this by tearing down our connection and starting fresh
							this._triggerError('unexpected_connect', 'Received unexpected connect message from server');
							return;
						}
				}
			}
			if(this._respFunc) {
				var rf = this._respFunc;
				this._respFunc = null;
				if(m)
					rf(null, m[1]|0, m[2].trim());
				else
					rf(new NNTPError('invalid_response', 'Unexpected line format: ' + line));
			} else if(m) {
				this.warn('Unexpected response received: ' + line.trim());
			} else {
				this.warn('Unexpected invalid data received: ' + line);
			}
		}
		if(data.length) {
			this.dataLength += data.length;
			// as we never request lists and the like, there should be no reason that server responses exceed 4K
			if(this.dataLength > 4096) {
				self._triggerError('invalid_response', 'Received NNTP message larger than 4KB, force disconnecting from server');
				return;
			}
			this.dataQueue.push(data);
		}
	},
	end: function() {
		if(this._finished) return;
		this._finished = true;
		if(this.socket) {
			this.socket.end('QUIT\r\n');
		}
		this.socket = null;
		if(!this._requesting && this._timer) {
			this._clearTimer();
		}
		this.state = 'closing';
	},
	destroy: function() {
		this._finished = true;
		if(this._respFunc)
			this._respFunc(new NNTPError('closed', 'Connection closed'));
		this._destroy();
	},
	_destroy: function() {
		if(this._timer) 
			this._clearTimer();
		this._respFunc = null;
		
		if(this.socket) {
			this.socket.destroy();
			this.socket.removeAllListeners();
			this.socket = null;
		}
		this.state = 'disconnected';
		this.dataQueue = [];
		this.dataLength = 0;
	},
	_triggerError: function(code, desc) {
		this[this.state == 'connected' ? '_onError':'_onConnectFail'](new NNTPError(code, desc));
	},
	date: function(cb) {
		this._doRequest('DATE\r\n', function(err, code, info) {
			if(!err) err = checkExpect(111, 'DATE', code, info);
			if(err) return cb(err);
			var m = info.match(/^(\d\d\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/);
			var date;
			if(m) date = new Date(m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + ':' + m[6]);
			if(!date || isNaN(date)) return cb(new NNTPError('invalid_response', 'Invalid date returned: ' + info));
			cb(null, date);
		});
	},
	// group cannot contain newlines
	group: function(group, cb) {
		this._doRequest('GROUP ' + group + '\r\n', this._groupResponse.bind(this, cb));
	},
	_groupResponse: function(cb, err, code, info) {
		if(code == 411) return cb(new NNTPError('invalid_group', 'Selected group does not exist'));
		if(!err) err = checkExpect(211, 'GROUP', code, info);
		if(err) return cb(err);
		
		// format: 211 num_articles_estimate first_num last_num group_name
		var m = info.match(/^(\d+) (\d+) (\d+) (.*)$/);
		if(!m) return cb(new NNTPError('invalid_response', 'Unexpected response format to GROUP request: ' + info));
		this.currentGroup = m[4];
		cb(null);
	},
	// id cannot contain newlines
	stat: function(id, cb) {
		if(typeof id != 'number')
			id = '<' + id + '>'; // handle message ID
		this._doRequest('STAT ' + id + '\r\n', function(err, code, info) {
			if(err) return cb(err);
			// TODO: error 412 no newsgroup has been selected
			if(code == 423 || code == 430) return cb(null, null); // no such article
			
			var err = checkExpect(223, 'STAT', code, info);
			if(err) return cb(err);
			
			var m = info.match(/^(\d+) <(.*?)>/);
			if(!m) cb(new NNTPError('invalid_response', 'Unexpected response for stat request: ' + info));
			else cb(null, [m[1]|0, m[2]]);
		});
	},
	// NOTE: msg MUST end with \r\n.\r\n
	post: function(headers, msg, cb) {
		if(!this.canPost) return cb(new NNTPError('posting_denied', 'Server has indicated that posting is not allowed'));
		this._postRetries = this.opts.postRetries;
		var self = this;
		(function doPost() {
			self._doRequest(commands.POST, function(err, code, info) {
				if(!err) err = checkExpect(340, 'POST', code, info);
				if(err) return cb(err);
				
				// we hard-code a message-id, since it's best to make it unique for retries
				var msgId = NNTP._makeMsgId();
				var postData = Buffer.concat([
					new Buffer(headers.join('\r\n') + '\r\nMessage-ID: <' + msgId + '>\r\n\r\n'),
					msg
				]);
				
				// mark this request to be retried if disconnected
				self._requesting = [headers, msg, cb];
				self._requestingFunc = 'post';
				self._request(postData, function(err, code, info) {
					self._requesting = false;
					if(err) return cb(err);
					if(code == 441) {
						if(self._postRetries > 0) {
							self.warn('Got "' + ('441 ' + info).trim() + '" response when posting article ' + msgId + '; will retry');
							self._postRetries--;
							return doPost();
						}
						return cb(new NNTPError('post_denied', 'Server could not accept post, returned: ' + code + ' ' + info));
					}
					var err = checkExpect(240, 'posted article', code, info);
					if(err) return cb(err);
					
					// if server provides a message-id, return to calling function, otherwise don't mention a thing
					var m = info.match(/^<(.*)>/i);
					if(m) {
						if(msgId != m[1])
							self.warn('Server returned a different Message-ID (' + m[1] + ') to the one we sent it (' + msgId + '); replacing our ID with received ID');
						msgId = m[1];
					}
					self.debug('Posted article ' + msgId);
					cb(null, msgId);
				});
				
			});
		})();
	},
	_doRequest: function(msg, cb) {
		if(this._requesting)
			throw new Error('Request made whilst another request is in progress');
		this._requesting = [msg, cb]; // this marks that the request should be retried if a disconnect occurs
		this._requestingFunc = '_doRequest';
		if(this.state == 'connected') {
			this._request(msg, function() {
				this._requesting = false;
				cb.apply(null, arguments);
			}.bind(this));
		} else if(!this.active)
			return cb(new NNTPError('not_connected', 'Not connected to an NNTP server'));
		// otherwise, request is scheduled on connect
	},
	_request: function(msg, cb) {
		if(!this.active)
			return cb(new NNTPError('not_connected', 'Not connected to an NNTP server'));
		var self = this;
		// TODO: debug output
		this._setTimer(function() {
			// timed out - retry
			// we destroy the connection because this one probably isn't reliable
			// since NNTP doesn't have request/response identifiers, this is the safest approach
			self._triggerError('timeout', 'Response timed out');
			// TODO: have a max retry limit for this request?
		}, this.opts.timeout);
		this._respFunc = function() {
			self._clearTimer();
			cb.apply(null, arguments);
		};
		if(msg) this.socket.write(msg);
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
		if(NNTP.log) NNTP.log.warn(msg);
	},
	info: function(msg) {
		if(NNTP.log) NNTP.log.info(msg);
	},
	debug: function(msg) {
		if(NNTP.log) NNTP.log.debug(msg);
	}
};

module.exports = NNTP;
//NNTP.log = {info: console.info.bind(console), warn: console.warn.bind(console), debug: console.log.bind(console)};
NNTP.log = null;
