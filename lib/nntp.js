"use strict";

var tls = require('tls'), net = require('net');
var async = require('async');
var crypto = require('crypto');

var ENCODING = 'utf8';
var RE_LINE = /^(\d\d\d) (.*)\r\n$/;
var MAX_RECV_SIZE = 16384; // 16KB should be *plenty* of space for a response

var commands = {
	POST: new Buffer('POST\r\n', ENCODING),
	DATE: new Buffer('DATE\r\n', ENCODING)
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
	socket: null,
	_timer: null,
	_finished: false,
	_requesting: false,
	_requestingFunc: null,
	_requestingEVal: null,
	_requestTries: 0,
	_respFunc: null,
	_lastError: null,
	_postRetries: null,
	_connectCb: null,
	canPost: true, // assume true by default (needed if posting before connected)
	currentGroup: null,
	// stats
	bytesRecv: 0,
	bytesSent: 0,
	numConnects: 0,
	numErrors: 0,
	numRequests: 0,
	numPosts: 0,
	lastActivity: 0,
	
	connect: function(cb) {
		this._setState('connecting');
		this._lastError = null;
		this._finished = false;
		
		// clear the data queue just in case (shouldn't be necessary as it's cleared on close)
		this.dataQueue = [];
		this.dataLength = 0;
		
		this.numConnects++;
		this._connectCb = cb;
		cb = cb || emptyFn;
		
		if(this._timer) this._clearTimer(); // if request timer is active, clear it
		
		this._setTimer(this._onConnectFail.bind(this, new NNTPError('connect_timeout', 'Connect timed out')), this.opts.connTimeout);
		
		var self = this;
		var onConnectFail = this._onConnectFail.bind(this);
		async.waterfall([
			function(cb) {
				self._respFunc = function() {
					self._clearTimer();
					cb.apply(null, arguments);
				};
				var factory = (self.opts.secure ? tls : net);
				self.socket = factory.connect(self.opts.connect, function(err) {
					if(!err) return;
					self._clearTimer(); // clear connection timeout timer
					cb(err);
				});
				if(self.socket.setNoDelay) // tls.setNoDelay not documented, but seems to be available
					self.socket.setNoDelay(true);
				if(self.opts.tcpKeepAlive !== false && self.socket.setKeepAlive)
					self.socket.setKeepAlive(true, self.opts.tcpKeepAlive);
				self.debug('Connecting to nntp' + (self.opts.secure ? 's':'') + '://' + self.opts.connect.host + ':' + self.opts.connect.port + '...');
				
				self.socket.once('error', onConnectFail);
				self.socket.once('end', onConnectFail);
				self.socket.once('close', self._onClose.bind(self));
				self.socket.on('data', self._onData.bind(self));
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
					self._setState('authenticating');
					self._request('AUTHINFO USER ' + self.opts.user + '\r\n', cb);
				} else cb(null, null, null);
			},
			function(code, info, cb) {
				if(self.opts.user) {
					if(self._lastError) return;
					
					var err = checkExpect(381, 'auth user', code, info);
					if(err) return cb(err);
					self._request('AUTHINFO PASS ' + self.opts.password + '\r\n', cb);
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
			self._setState('connected');
			self.socket.removeListener('error', onConnectFail);
			self.socket.removeListener('end', onConnectFail);
			self.socket.once('error', self._onError.bind(self));
			self.socket.once('end', self._onError.bind(self));
			self.debug('NNTP connection ready');
			self._connectRetries = self.opts.connectRetries; // reset connect retry counter
			if(self._requesting) {
				var reschedReq = self._requesting;
				// rescheduled request
				self.debug('Retrying last request');
				self._requesting = false;
				self[self._requestingFunc].apply(self, reschedReq);
			}
			cb();
		});
	},
	// we'll probably want max reconnect tries + delays for _onError
	_onConnectFail: function(err) {
		this._lastError = err;
		var cb = this._connectCb || emptyFn;
		this._connectCb = null;
		this.numErrors++;
		if(this._timer) this._clearTimer(); // clear connection timeout timer
		err = err || new Error('connection lost');
		if(this._connectRetries--) {
			this._destroy();
			this.warn('NNTP connection failed: ' + err.message + ', reconnecting after ' +(this.opts.reconnectDelay/1000)+ ' second(s)...');
			this._setTimer(this.connect.bind(this, cb), this.opts.reconnectDelay);
		} else {
			this.destroy();
			cb(new NNTPError('connect_fail', 'NNTP connection failed: ' + err.message));
		}
	},
	_onClose: function(had_error) {
		this._setState('disconnected');
		this.dataQueue = [];
		this.dataLength = 0;
		this.debug('NNTP connection closed');
	},
	_onError: function(err) {
		if(this._finished) return;
		
		var rf;
		var postTimeoutHack = (this._requesting && this.opts.ignorePostTimeout && this._requestingFunc == 'post' && err && err.code == 'timeout' && this._respFunc);
		
		if(err) {
			if(postTimeoutHack) {
				rf = this._respFunc;
				this.warn('NNTP response timed out during posting; assuming successful post');
			} else {
				this.warn('NNTP connection error occurred: ' + err.message);
			}
		} else {
			if(this._requesting)
				this.warn('NNTP connection unexpectedly lost, reconnecting...');
			else
				this.info('NNTP connection lost');
		}
		this._destroy();
		this.numErrors++;
		
		if(this._requesting) {
			if(postTimeoutHack) {
				// hack for dealing with servers that give post timeouts despite success
				rf(null, 240, '');
			} else if(this._requestTries > this.opts.requestRetries) {
				// request retry limit reached?
				var reschedReq = this._requesting;
				// request attempt limit reached
				this._setRequesting(false);
				// last param is always the callback; not a really nice assumption, but works
				(reschedReq.slice(-1)[0])(err || new NNTPError('connection_lost', 'Disconnected during request'), this._requestingEVal);
			}
		}
		
		if(this._requesting || this.opts.keepAlive) {
			this.connect(function(err) {
				if(!err) return;
				this._setState('inactive');
				if(this._requesting) {
					// last param is always the callback; not a really nice assumption, but works
					(this._requesting.slice(-1)[0])(err, this._requestingEVal);
				} else {
					this.warn('NNTP connection now inactive due to reconnect failure: ' + err.message);
				}
			}.bind(this));
		} else {
			this._setState('inactive');
		}
	},
	_onData: function(chunk) {
		this.bytesRecv += chunk.length;
		// grab incomming lines
		var data = chunk.toString(ENCODING); // TODO: perhaps should be ASCII encoding always?
		
		var p = data.indexOf('\r\n');
		if(p < 0) {
			p = false;
			// check annoying case of a \r and \n in separate chunks
			if(this.dataQueue.length && data[0] == '\n' && this.dataQueue[this.dataQueue.length-1].substr(-1) == '\r')
				p = -1;
		}
		
		if(p !== false) do {
			var line = this.dataQueue.join('') + data.substr(0, p+2);
			data = data.substr(p+2);
			this.dataQueue = [];
			this.dataLength = 0;
			
			var m = line.match(RE_LINE);
			if(m) {
				switch(m[1]) {
					// ignore '400 idle for too long' and '205 Connection closing' messages
					case '400':
						this.info('Server sent message "' + line.trim() + '"');
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
				/* the following doesn't work well if TLS is enabled
				if(this.socket.bufferSize)
					// TODO: may be a good idea to tear down the connection?
					this.warn('NNTP connection de-sync detected (received message whilst send data not sent)');
				*/
				var rf = this._respFunc;
				this._respFunc = null;
				if(m) {
					rf(null, m[1]|0, m[2].trim());
				} else {
					// should we tear down the connection at this point?
					rf(new NNTPError('invalid_response', 'Unexpected line format: ' + line));
				}
			} else if(m) {
				this.warn('Unexpected response received: ' + line.trim());
				this.numErrors++;
			} else {
				this.warn('Unexpected invalid data received: ' + line);
				this.numErrors++;
			}
		} while((p = data.indexOf('\r\n')) >= 0);
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
		if(this.state != 'inactive')
			this._setState('closing');
	},
	destroy: function() {
		this._finished = true;
		if(this._respFunc)
			this._respFunc(new NNTPError('closed', 'Connection closed'));
		this._destroy();
		this._setState('inactive');
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
		this._setState('disconnected');
		this.dataQueue = [];
		this.dataLength = 0;
	},
	_triggerError: function(code, desc) {
		this[this.state == 'connected' ? '_onError':'_onConnectFail'](new NNTPError(code, desc));
	},
	date: function(cb) {
		this._doRequest(commands.DATE, function(err, code, info) {
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
			self.numPosts++;
			var reqRetries = self._requestTries; // hack to save the counter across the two requests
			self._doRequest(commands.POST, function(err, code, info) {
				if(!err) err = checkExpect(340, 'POST', code, info);
				if(err) return cb(err);
				
				// we hard-code a message-id, since it's best to make it unique for retries
				var msgId = NNTP._makeMsgId();
				
				// mark this request to be retried if disconnected
				self._requestTries = reqRetries;
				self._setRequesting('post', [headers, msg, cb], msgId);
				self._request([
					// TODO: does this send two packets if noDelay is enabled?
					headers + '\r\nMessage-ID: <' + msgId + '>\r\n\r\n',
					msg
				], function(err, code, info) {
					self._setRequesting(false);
					if(err) return cb(err, msgId);
					if(code == 441) {
						if(self._postRetries > 0) {
							self.warn('Got "' + ('441 ' + info).trim() + '" response when posting article ' + msgId + '; will retry');
							self._postRetries--;
							self.numErrors++;
							return doPost();
						}
						return cb(new NNTPError('post_denied', 'Server could not accept post, returned: ' + code + ' ' + info), msgId);
					}
					var err = checkExpect(240, 'posted article', code, info);
					if(err) return cb(err, msgId);
					
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
		if(this.state == 'inactive') {
			this.connect(function(err) {
				if(err) cb(err);
				else this._doRequest(msg, cb);
			}.bind(this));
			return;
		}
		this._setRequesting('_doRequest', [msg, cb]);
		this.numRequests++;
		if(this.state == 'connected') {
			this._request(msg, function() {
				this._setRequesting(false);
				cb.apply(null, arguments);
			}.bind(this));
		}
		// otherwise, request is scheduled on connect
	},
	_request: function(msg, cb) {
		if(this.state == 'inactive')
			return cb(new NNTPError('not_connected', 'Not connected to an NNTP server'));
		var self = this;
		// TODO: debug output
		this._setTimer(function() {
			// timed out - retry
			// we destroy the connection because this one probably isn't reliable
			// since NNTP doesn't have request/response identifiers, this is the safest approach
			self._triggerError('timeout', 'Response timed out');
		}, this.opts.timeout);
		this._respFunc = function() {
			self._clearTimer();
			cb.apply(null, arguments);
		};
		if(Array.isArray(msg))
			msg.forEach(this._write.bind(this));
		else
			this._write(msg);
	},
	_write: function(data) {
		if(typeof data == 'string') {
			this.bytesSent += Buffer.byteLength(data, ENCODING);
			this.socket.write(data, ENCODING);
		} else {
			this.bytesSent += data.length;
			this.socket.write(data);
		}
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
	},
	
	getCurrentActivity: function() {
		if(this.state != 'connected')
			return this.state;
		if(!this._requesting)
			return 'idle';
		if(this._requestingFunc == 'post')
			return 'posting';
		return 'requesting';
	},
	_setState: function(state) {
		this.state = state;
		this.lastActivity = Date.now();
	},
	_setRequesting: function(func, args, errVal) {
		if(func) {
			this._requesting = args;
			this._requestingFunc = func;
			this._requestingEVal = errVal;
			this._requestTries++;
		} else {
			this._requesting = false;
			this._requestTries = 0;
		}
		this.lastActivity = Date.now();
	}
};

module.exports = NNTP;
//NNTP.log = {info: console.info.bind(console), warn: console.warn.bind(console), debug: console.log.bind(console)};
NNTP.log = null;
