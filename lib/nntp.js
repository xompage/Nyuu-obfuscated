"use strict";

var tls, net;
var async = require('async');
var util = require('./util');

var ENCODING = null; // 'utf8'
var RE_LINE = /^(\d\d\d) (.*)\r\n$/;
var RE_DATE = /^(\d\d\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/;
var RE_GROUP = /^(\d+) (\d+) (\d+) (.*)$/;
var RE_STAT = /^(\d+) <(.*?)>/;
var RE_POST = /^<(.*)>/i;
var MAX_RECV_SIZE = 16384; // 16KB should be *plenty* of space for a response

var CMD_POST, CMD_DATE, CMD_QUIT;
if(Buffer.alloc) {
	CMD_POST = Buffer.from('POST\r\n', ENCODING);
	CMD_DATE = Buffer.from('DATE\r\n', ENCODING);
	CMD_QUIT = Buffer.from('QUIT\r\n', ENCODING);
} else {
	CMD_POST = new Buffer('POST\r\n', ENCODING);
	CMD_DATE = new Buffer('DATE\r\n', ENCODING);
	CMD_QUIT = new Buffer('QUIT\r\n', ENCODING);
}

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

function NNTPReq(func, msg, type, validResp, cb) {
	this.func = func;
	this.cbParent = cb;
	this.msg = msg;
	this.type = type;
	this.validResp = validResp;
}
NNTPReq.prototype = {
	tries: 0,
	postTimeouts: 0,
	postRetries: 0,
	post: null,
	ts: 0,
	size: null,
	cb: null, // direct callback that the data handler calls
	cbParent: null, // parent callback that this request resolves
	errVal: null,
	err: function(err) {
		this.cbParent(err, this.errVal);
	}
};

function NNTP(opts) {
	this.opts = opts;
	this.connectOpts = opts.connect;
	this.dataQueue = [];
	this.dataLength = 0;
	this._connectRetries = opts.connectRetries;
	
	if(!opts.connect.port)
		this.connectOpts = util.extend({}, opts.connect, {port: opts.secure ? 563 : 119});
	
	if(this.opts.secure) {
		this.connectFactory = tls || (tls = require('tls'));
	} else {
		this.connectFactory = net || (net = require('net'));
	}
	this._onCloseCb = [];
	this._requests = [];
}

NNTP.prototype = {
	state: 'inactive',
	socket: null,
	_timer: null,
	_finished: false,
	_onCloseCb: null,
	_requests: null,
	_isPosting: false,
	_respFunc: null,
	_lastError: null,
	_warnedIdDiff: false,
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
	// for tracking raw upload speed
	reqWaitTime: 0,
	reqBytesSent: 0,
	_lastReqTime: 0,
	
	connect: function(cb) {
		if(this.socket || this.state == 'connecting') throw new Error('Cannot call connect twice');
		this._setState('connecting');
		this._lastError = null;
		this._finished = false;
		this._isPosting = false;
		
		// clear the data queue just in case (shouldn't be necessary as it's cleared on close)
		this.dataQueue = [];
		this.dataLength = 0;
		
		this.numConnects++;
		this._connectCb = (cb || function(err) {
			if(!err) return;
			if(NNTP.log)
				NNTP.log.error(err.message);
		});
		
		if(this._timer) this._clearTimer(); // if request timer is active, clear it
		
		this._setTimer(this._onConnectFail.bind(this, new NNTPError('connect_timeout', 'Connect timed out')), this.opts.connTimeout);
		
		var self = this;
		var onConnectFail = this._onConnectFail.bind(this);
		async.waterfall([
			function(cb) {
				self._respFunc = cb;
				self.socket = self.connectFactory.connect(self.connectOpts, function(err) {
					if(!err) return;
					self._clearTimer(); // clear connection timeout timer
					cb(err);
				});
				if(self.socket.setNoDelay) // tls.setNoDelay not documented, but seems to be available
					self.socket.setNoDelay(true);
				if(self.opts.tcpKeepAlive !== false && self.socket.setKeepAlive)
					self.socket.setKeepAlive(true, self.opts.tcpKeepAlive);
				self.debug('Connecting to nntp' + (self.opts.secure ? 's':'') + '://' + self.connectOpts.host + ':' + self.connectOpts.port + '...');
				
				self.socket.once('error', onConnectFail);
				self.socket.once('end', onConnectFail);
				self.socket.once('close', self._onClose.bind(self));
				self.socket.on('data', self._onData.bind(self));
			},
			function(code, info, cb) {
				self._respFunc = null;
				if(self._lastError) return;
				if(self._finished) return cb(null, null, null);
				
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
					self._respFunc = cb;
					self._request('AUTHINFO USER ' + self.opts.user + '\r\n', 'auth-user');
				} else cb(null, null, null);
			},
			function(code, info, cb) {
				if(self.opts.user && !self._finished) {
					if(self._lastError) return;
					
					var err = checkExpect(381, 'auth user', code, info);
					if(err) return cb(err);
					self._respFunc = cb;
					self._request('AUTHINFO PASS ' + self.opts.password + '\r\n', 'auth-pass');
				} else cb(null, null, null);
			},
			function(code, info, cb) {
				if(self.opts.user && !self._finished) {
					if(self._lastError) return;
					
					var err = checkExpect(281, 'auth pass', code, info);
					if(err) return cb(err);
					
					self.debug('NNTP connection authenticated');
					cb();
				} else cb();
			},
			function(cb) {
				// group previously selected - re-select it
				if(self.currentGroup && !self._finished) {
					if(self._lastError) return;
					
					self._respFunc = function(err, code, info) {
						if(!err && (code != 411 && code != 211))
							return cb(new NNTPError('bad_response', 'Unexpected response to GROUP (code: ' + code + '): ' + info));
						self._groupResponse(cb, err, code, info);
					};
					self._request('GROUP ' + self.currentGroup + '\r\n', 'group');
				} else cb();
			}
		], function(err) {
			if(err)
				return self._onConnectFail(err);
			if(self._finished)
				return self._onConnectFail(new NNTPError('cancelled', 'Connection cancelled'));
			if(self._lastError) return; // this is possible if an error occurs after all processing has succeeded, but an error pops up during the async nature of all this
			
			var cb = self._connectCb;
			self._connectCb = null;
			self._respFunc = null;
			self._lastError = null;
			self._setState('connected');
			self.socket.removeListener('error', onConnectFail);
			self.socket.removeListener('end', onConnectFail);
			self.socket.once('error', self._onError.bind(self));
			self.socket.once('end', self._onError.bind(self));
			self.debug('NNTP connection ready');
			self._connectRetries = self.opts.connectRetries; // reset connect retry counter
			if(self._requests.length) {
				var reqs = self._requests;
				// rescheduled request
				self.debug('Retrying last request(s)');
				self._requests = [];
				reqs.forEach(function(req) {
					self[req.func](req);
				});
			}
			cb();
		});
	},
	// we'll probably want max reconnect tries + delays for _onError
	_onConnectFail: function(err) {
		if(this._lastError) return; // this case is possible if .destroy is called (below) in response to max retries being hit, and a response is being waited on
		this._lastError = err || true;
		var cb = this._connectCb;
		this._connectCb = null;
		if(this._finished) return cb(err); // if already finished, this was called due to being destroyed
		this.numErrors++;
		if(this._timer) this._clearTimer(); // clear connection timeout timer
		var errMsg = err ? err.message : 'connection lost';
		if(this._connectRetries--) {
			this._close(function() {
				this._setState('waiting');
				this.warn('NNTP connection failed: ' + errMsg + ', reconnecting after ' +(this.opts.reconnectDelay/1000)+ ' second(s)... (attempt ' + (this.opts.connectRetries - this._connectRetries) + '/' + this.opts.connectRetries + ')');
				
				this._connectCb = cb; // set this back for .destroy() calls to work properly (.connect() will reset this anyway)
				this._respFunc = cb;
				this._setTimer(this.connect.bind(this, cb), this.opts.reconnectDelay);
			}.bind(this));
		} else {
			this._finished = true;
			this._close(function() {
				this._setState('inactive');
				var e = new NNTPError('connect_fail', 'NNTP connection failed: ' + errMsg);
				cb(e);
				this._runCloseCbs();
				if(this._requests.length) {
					this._requests.forEach(function(req) {
						req.err(e);
					});
					this._requests = [];
				}
				
			}.bind(this));
		}
	},
	_onClose: function(had_error) {
		this._setState('disconnected');
		this.dataQueue = [];
		this.dataLength = 0;
		this.debug('NNTP connection closed');
	},
	_onError: function(err) {
		if(this._finished || this._lastError) return;
		this._lastError = err || true;
		
		var self = this;
		var reqsForEach = function(cb) {
			for(var i=0; i<self._requests.length; i++) {
				var req = self._requests[i];
				var postTimeoutHack = (self.opts.onPostTimeout && req.post && err && err.code == 'timeout' && req.cb);
				if(cb(req, i, postTimeoutHack))
					i--; // handle item removals
				
				break; // switch is here if we ever decide to go through all requests in the pipeline, instead of just the first
			}
		};
		var postTimeoutActions = Array(this._requests.length);
		if(this._requests.length) {
			reqsForEach(function(req, i, postTimeoutHack) {
				req.tries++;
				var postTimeoutAction;
				if(postTimeoutHack) {
					postTimeoutAction = self.opts.onPostTimeout[req.postTimeouts++];
					if(postTimeoutAction && postTimeoutAction.substr(0, 10) == 'strip-hdr=') {
						if(req.post.stripHeader(postTimeoutAction.substr(10))) {
							self.warn('NNTP response timed out during posting; removing article header "' + postTimeoutAction.substr(10) + '" and retrying...');
							postTimeoutAction = 'strip-hdr';
						} else
							postTimeoutAction = 'retry';
					}
					if(postTimeoutAction == 'ignore') {
						self.warn('NNTP response timed out during posting; assuming successful post');
					}
				}
				if((postTimeoutHack || req.tries <= self.opts.requestRetries) && (!postTimeoutHack || postTimeoutAction)) {
					if(err)
						self.warn('NNTP connection error occurred: ' + err.message + '; will retry ' + req.type + ' request (attempt ' + req.tries + '/' + self.opts.requestRetries + ')');
					else
						self.warn('NNTP connection unexpectedly lost, reconnecting and retrying ' + req.type + ' request... (attempt ' + req.tries + '/' + self.opts.requestRetries + ')');
				}
				postTimeoutActions[i] = postTimeoutAction;
			});
		} else {
			if(err)
				this.warn('NNTP connection error occurred: ' + err.message);
			else
				this.info('NNTP connection lost');
		}
		
		this.numErrors++;
		this._close(function() {
			reqsForEach(function(req, i, postTimeoutHack) {
				var postTimeoutAction = postTimeoutActions[i];
				if(postTimeoutHack && postTimeoutAction == 'ignore') {
					// hack for dealing with servers that give post timeouts despite success
					self._takeRequest(i).cb(null, 240, '');
				} else if(postTimeoutHack && postTimeoutAction == 'strip-hdr') {
					// is a retry action, nothing needs to be done
				} else if((!postTimeoutHack && req.tries > self.opts.requestRetries) || (postTimeoutHack && !postTimeoutAction)) {
					// request attempt limit reached
					self._endRequest(req);
					self._takeRequest(i);
					postTimeoutActions.splice(i, 1);
					req.err(err || new NNTPError('connection_lost', 'Disconnected during request'));
					return true; // indicate that item was removed, to decrement loop counter
				}
			});
			
			if(self._requests.length || self.opts.keepAlive) {
				setImmediate(self.connect.bind(self));
			} else {
				self._setState('inactive');
			}
		});
	},
	_onData: function(chunk) {
		this.bytesRecv += chunk.length;
		// grab incomming lines
		var data;
		if(ENCODING)
			data = chunk.toString(ENCODING);
		else
			data = chunk.toString();
		
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
			if(this._requests.length || this._respFunc) {
				/* the following doesn't work well if TLS is enabled
				if(this.socket.bufferSize)
					// TODO: may be a good idea to tear down the connection?
					this.warn('NNTP connection de-sync detected (received message whilst send data not sent)');
				*/
				
				this._clearTimer();
				var rf = this._respFunc;
				var req;
				if(!rf) {
					req = this._requests[0];
					rf = req.cb;
				}
				
				var err;
				if(!m)
					err = new NNTPError('invalid_response', 'Unexpected line format: ' + line);
				else {
					var code = m[1]|0;
					if(req && req.validResp && req.validResp.indexOf(code) == -1)
						err = new NNTPError('bad_response', 'Unexpected response to '+req.type+' (code: ' + code + '): ' + m[2].trim());
				}
				if(err) {
					if(req && this.opts.retryBadResp)
						this._onError(err);
					else {
						if(req) this._takeRequest();
						rf(err);
					}
				} else {
					if(req) this._takeRequest();
					rf(null, m[1]|0, m[2].trim());
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
				self._triggerError('invalid_response', 'Received NNTP message larger than 4KB, connection will be reset');
				return;
			}
			this.dataQueue.push(data);
		}
	},
	_runCloseCbs: function() {
		this._callMulti(this._onCloseCb);
		this._onCloseCb = [];
	},
	_addCloseCb: function(cb) {
		if(!cb) return;
		if(this.state == 'closing')
			this._onCloseCb.push(cb);
		else
			cb();
	},
	_getNotifyCbs: function() {
		var cbs = this._requests.map(function(req) {
			return req.cb;
		}).filter(function(x) {return x;});
		if(this._respFunc)
			cbs.push(this._respFunc);
		this._requests = [];
		this._respFunc = null;
		return cbs;
	},
	_callMulti: function(cbs, err) {
		cbs.forEach(function(cb) {
			cb(err);
		});
	},
	// TODO: does this have issues with state, eg, if a request is still processing, will it overwrite the 'closing' state?
	end: function(cb) {
		if(this._finished) return this._addCloseCb(cb);
		this._finished = true;
		var state = this.state;
		var self = this;
		(function(cb) {
			if(!self.socket) return cb();
			self.socket.removeAllListeners('end'); // suppress potential call to _onConnectFail
			if(self._requests.length && self._requests[0].post && self.state == 'connected')
				// if posting, can't pipeline on a QUIT message
				self._end(cb);
			else
				self._end(cb, CMD_QUIT);
		})(function() {
			self._setState('inactive');
			self._runCloseCbs();
			if(cb) cb();
			if(state == 'waiting' || state == 'connecting' || state == 'authenticating') {
				if(self._timer) self._clearTimer();
				self._callMulti(self._getNotifyCbs(), new NNTPError('cancelled', 'Request cancelled'));
			}
		});
	},
	// like .end(), but cancells any request in progress
	close: function(cb) {
		if(this._finished) return this._addCloseCb(cb);
		this._finished = true;
		var cbs = this._getNotifyCbs();
		var self = this;
		(function(cb) {
			if(self.socket)
				self._close(cb);
			else {
				if(self.state == 'waiting' && self._timer)
					self._clearTimer();
				cb();
			}
		})(function() {
			self._setState('inactive');
			self._callMulti(cbs, new NNTPError('cancelled', 'Request cancelled'));
			self._runCloseCbs();
			if(cb) cb();
		});
	},
	destroy: function() {
		if(this._finished) return;
		this._finished = true;
		var cbs = this._getNotifyCbs();
		this._destroy();
		this._setState('inactive');
		this._callMulti(cbs, new NNTPError('cancelled', 'Request cancelled'));
	},
	_destroy: function() {
		if(this._timer)
			this._clearTimer();
		this._respFunc = null;
		
		if(this.socket) {
			this.socket.removeAllListeners();
			this.socket.destroy();
			this.socket = null;
		}
		this._setState('disconnected');
		this.dataQueue = [];
		this.dataLength = 0;
	},
	_end: function(cb, msg) {
		var self = this;
		var forceEnd = function() {
			if(self.socket) {
				self.socket.removeAllListeners();
				self.socket.destroy();
				self.socket = null;
			}
			self._setState('disconnected');
			self.dataQueue = [];
			self.dataLength = 0;
			cb();
		};
		var timer = setTimeout(function() {
			self.warn('Disconnect timed out, forcefully dropping connection...');
			forceEnd();
		}, this.opts.closeTimeout);
		this.socket.once('close', function() {
			clearTimeout(timer);
			if(self.socket) {
				self.socket.removeAllListeners();
				self.socket = null;
			}
			cb();
		});
		this.socket.once('error', function(err) {
			clearTimeout(timer);
			forceEnd();
		});
		this.debug('Closing connection...');
		if(msg !== undefined) {
			if(this.state == 'closing')
				this.warn('InternalError: attempting to send closing message after close');
			this.socket.end(msg);
		} else
			this.socket.end();
		this._setState('closing');
	},
	_close: function(cb) {
		if(this.opts.errorTeardown || !this.socket) {
			this._destroy();
			cb();
		} else {
			if(this._timer)
				this._clearTimer();
			this._respFunc = null;
			this.dataQueue = [];
			this.dataLength = 0;
			// remove all listeners except 'close' (as well as internally added listeners for other events)
			this.socket.removeAllListeners('end');
			this.socket.removeAllListeners('error');
			this.socket.removeAllListeners('data');
			this.socket.removeAllListeners('drain');
			this.socket.once('error', function(err) {
				this.warn('NNTP connection error occurred during close: ' + err.message);
			}.bind(this));
			this.socket.resume(); // shouldn't be necessary, but in case node decides to pause the stream due to it having no data listeners or something...
			this._end(cb);
		}
	},
	_triggerError: function(code, desc) {
		if(this._finished) {
			// should only be possible to reach here if .end was called with a pending request
			this.numErrors++;
			this.warn('NNTP connection error occurred: ' + desc);
			if(this._requests.length) { // is it even possible for this to be false?
				var err = new NNTPError(code, desc);
				this._requests.forEach(function(req) {
					req.err(err);
				});
				this._requests = [];
			}
		} else {
			this[this.state == 'connected' ? '_onError':'_onConnectFail'](new NNTPError(code, desc));
		}
	},
	date: function(cb) {
		this._doRequest(CMD_DATE, 'date', [111], function(err, code, info) {
			if(err) return cb(err);
			var m = info.match(RE_DATE);
			var date;
			if(m) date = new Date(m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + ':' + m[6]);
			if(!date || isNaN(date)) return cb(new NNTPError('invalid_response', 'Invalid date returned: ' + info));
			cb(null, date);
		});
	},
	// group cannot contain newlines
	group: function(group, cb) {
		this._doRequest('GROUP ' + group + '\r\n', 'group', [411, 211], this._groupResponse.bind(this, cb));
	},
	_groupResponse: function(cb, err, code, info) {
		if(err) return cb(err);
		if(code == 411) return cb(new NNTPError('invalid_group', 'Selected group does not exist'));
		
		// format: 211 num_articles_estimate first_num last_num group_name
		var m = info.match(RE_GROUP);
		if(!m) return cb(new NNTPError('invalid_response', 'Unexpected response format to GROUP request: ' + info));
		this.currentGroup = m[4];
		cb(null);
	},
	// id cannot contain newlines
	stat: function(id, cb) {
		if(typeof id != 'number')
			id = '<' + id + '>'; // handle message ID
		this._doRequest('STAT ' + id + '\r\n', 'stat', [423, 430, 223], function(err, code, info) {
			if(err) return cb(err);
			// TODO: error 412 no newsgroup has been selected
			if(code == 423 || code == 430) return cb(null, null); // no such article
			
			var m = info.match(RE_STAT);
			if(!m) cb(new NNTPError('invalid_response', 'Unexpected response for stat request: ' + info));
			else cb(null, [m[1]|0, m[2]]);
		});
	},
	// post must be a Post object
	post: function(post, cb) {
		var req = new NNTPReq('__post', CMD_POST, 'post', [this.opts.useIHave ? 335 : 340], cb);
		req.post = post;
		this.__post(req);
	},
	__post: function(req) {
		var post = req.post, cb = req.cbParent;
		if(!this.canPost) return cb(new NNTPError('posting_denied', 'Server has indicated that posting is not allowed'));
		var self = this;
		(function doPost() {
			self.numPosts++;
			req.func = '__doRequest';
			req.errVal = null;
			req.type = 'post';
			req.validResp = [self.opts.useIHave ? 335 : 340];
			
			// we hard-code a message-id, since it's best to make it unique for retries
			if(!post.keepMessageId) post.randomizeMessageID()
			if(self.opts.useIHave)
				req.msg = 'IHAVE <' + post.messageId + '>\r\n';
			
			req.cbParent = function(err, code, info) {
				if(err) {
					// TODO: is it reliable to keep the connection as is, or should it be pulled down?
					self._isPosting = false;
					return cb(err);
				}
				
				var msgId = post.messageId;
				
				// mark this request to be retried if disconnected
				req.func = '__post';
				req.cbParent = cb;
				req.errVal = msgId;
				req.type = 'post-upload';
				req.validResp = self.opts.useIHave ? [436, 235] : [441, 240];
				req.cb = function(err, code, info) {
					self._endRequest(req);
					self._isPosting = false;
					if(err) return cb(err, msgId);
					//if(self.socket) self.socket.removeAllListeners('drain');
					if(code == (self.opts.useIHave ? 436 : 441) || (self.opts.useIHave && code == 437)) {
						if(req.postRetries++ < self.opts.postRetries) {
							self.warn('Got "' + (code + ' ' + info).trim() + '" response when posting article ' + msgId + '; will retry (attempt ' + req.postRetries + '/' + self.opts.postRetries + ')');
							self.numErrors++;
							return doPost();
						}
						return cb(new NNTPError('post_denied', 'Server could not accept post, returned: ' + code + ' ' + info), msgId);
					}
					
					// if server provides a message-id, return to calling function, otherwise don't mention a thing
					var m = info.match(RE_POST);
					if(m) {
						if(msgId && msgId != m[1]) {
							if(!self._warnedIdDiff) {
								self.warn('Server returned a different Message-ID (' + m[1] + ') to the one we sent it (' + msgId + '); replacing our ID with received ID. This warning won\'t be shown again for this connection');
								self._warnedIdDiff = true;
							}
							post.messageId = m[1];
						}
						msgId = m[1];
					}
					self.debug('Posted article ' + msgId);
					cb(null, msgId);
				};
				self._startRequest(req);
				req.size = self._uploadPost(post.data, req);
			};
			self.__doRequest(req);
		})();
	},
	_doRequest: function(msg, type, validResp, cb) {
		this.__doRequest(new NNTPReq('__doRequest', msg, type, validResp, cb));
	},
	__doRequest: function(req) {
		if(this._isPosting)
			throw new Error('Cannot make request whilst posting');
		else if(req.post)
			this._isPosting = true;
		
		if(this.state == 'inactive') {
			this.connect();
		}
		this._startRequest(req);
		if(this.state == 'connected') {
			this.numRequests++;
			req.cb = function() {
				this._endRequest(req);
				req.cbParent.apply(null, arguments);
			}.bind(this);
			req.size = this._request(req.msg, req.type);
		}
		// otherwise, request is scheduled on connect
	},
	_request: function(msg, type) {
		if(this.state == 'inactive')
			throw new NNTPError('not_connected', 'Not connected to an NNTP server');
		var self = this;
		// TODO: debug output
		if(!this._timer) this._requestSetTimer(type);
		return this._write(msg, true);
	},
	_uploadPost: function(msg, req) {
		if(this.state == 'inactive')
			throw new NNTPError('not_connected', 'Not connected to an NNTP server');
		if(this._timer)
			throw new Error('Timer already set when trying to upload post');
		var self = this;
		
		// set first timer
		this._requestSetTimer('post-upload', this.opts.postTimeout);
		
		var retLen = msg.length;
		if(this.opts.uploadChunkSize && this.opts.uploadChunkSize < msg.length) {
			var pos = 0, lastTransfer;
			var _doWrite = function() {
				lastTransfer = pos;
				var ret;
				do {
					if(!(ret = self._write(msg.slice(pos, pos += self.opts.uploadChunkSize))))
						break;
				} while(pos < msg.length);
				lastTransfer = Math.min(pos, msg.length) - lastTransfer;
				return ret;
			};
			if(_doWrite()) {
				this._clearTimer();
				this._requestSetTimer('post-data');
			} else {
				var onDrain = function() {
					// for updating raw post speed
					self._updateReqWaitTime(Date.now(), req.ts);
					self.reqBytesSent += lastTransfer;
					
					if(pos >= msg.length) {
						self._clearTimer();
						self.socket.removeListener('drain', onDrain);
						self._requestSetTimer('post-data');
					} else {
						setImmediate(function() { // workaround for bug in node 0.10.x causing excessive process.nextTick calls; bug not present in node 4.7.x
							if(_doWrite())
								onDrain();
						});
					}
				};
				this.socket.on('drain', onDrain);
				retLen = 0; // hack to disable raw speed update on request completion
			}
		} else {
			if(this._write(msg)) {
				this._clearTimer();
				this._requestSetTimer('post-data');
			} else {
				this.socket.once('drain', function() {
					self._clearTimer();
					self._requestSetTimer('post-data');
				});
			}
		}
		return retLen;
	},
	_requestSetTimer: function(type, time) {
		this._setTimer(function() {
			// timed out - retry
			// we destroy the connection because this one probably isn't reliable
			// since NNTP doesn't have request/response identifiers, this is the safest approach
			this._triggerError('timeout', 'Response timed out (' + type + ')');
		}.bind(this), Math.max(0, time || this.opts.timeout));
	},
	_takeRequest: function(idx) {
		if(idx)
			return this._requests.splice(idx, 1)[0];
		
		var req = this._requests.shift();
		if(this._requests.length) {
			var nr = this._requests[0];
			this._requestSetTimer(nr.type, nr.ts + this.opts.timeout - Date.now());
		}
		return req;
	},
	_write: function(data, rtnLen) {
		if(this.state == 'closing') {
			var sData = data.toString();
			if(sData.length < 100)
				this.warn('InternalError: attempting to write "' + sData + '" after close');
			else
				this.warn('InternalError: attempting to write after close');
		}
		var len, writ;
		if(typeof data == 'string') {
			this.bytesSent += (len = Buffer.byteLength(data, ENCODING));
			writ = this.socket.write(data, ENCODING);
		} else {
			this.bytesSent += (len = data.length);
			writ = this.socket.write(data);
		}
		return rtnLen ? len : writ;
	},
	_setTimer: function(func, time) {
		if(this._timer) throw new Error('Timer already set');
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
		if(!this._requests.length)
			return 'idle';
		if(this._requests[0].type == 'post-upload')
			return 'posting';
		return 'requesting (' + this._requests[0].type + ')';
	},
	_setState: function(state) {
		this.state = state;
		this.lastActivity = Date.now();
	},
	_startRequest: function(req) {
		this._requests.push(req);
		this.lastActivity = (req.ts = Date.now());
	},
	_updateReqWaitTime: function(now, ts) {
		this.reqWaitTime += now - Math.max(this._lastReqTime, ts);
		this._lastReqTime = now;
	},
	_endRequest: function(req) {
		var now = Date.now();
		if(this.state == 'connected') {
			// note: for cases when server is unresponsive, the slowdown there isn't considered
			this._updateReqWaitTime(now, req.ts);
			this.reqBytesSent += req.size;
		}
		this.lastActivity = now;
	}
};

module.exports = NNTP;
//NNTP.log = {info: console.info.bind(console), warn: console.warn.bind(console), debug: console.log.bind(console)};
NNTP.log = null;
