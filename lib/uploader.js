"use strict";

var async = require('async');
var Queue = require('./queue');
var NNTP = require('./nntp');
var util = require('./util');
var TimerQueue = require('./timerqueue');
var config = require('../config');

function UploaderError(message) {
	var r = Error.call(this, message);
	r.name = 'UploaderError';
	r.message = message;
	return r;
}
UploaderError.prototype = Object.create(Error.prototype, {
	constructor: UploaderError
});

function Uploader(_opts, cb) {
	var defaultOpts = util.clone(config);
	var opts = util.clone(_opts);
	// TODO: deep merge these?
	if(!('server' in opts))
		opts.server = defaultOpts.server;
	if(!('check' in opts))
		opts.check = defaultOpts.check;
	
	this.opts = opts;
	this.queue = new Queue(opts.articleQueueBuffer || opts.server.connections, opts.useLazyConnect);
	this.checkQueue = new TimerQueue(opts.check.queueBuffer || Math.min(opts.server.connections*8, 100), opts.useLazyConnect);
	
	this.hasFinished = false;
	this.postConnections = [];
	this.checkConnections = [];
	
	this.skipErrs = {};
	if(opts.skipErrors) {
		var valid = {
			'post-timeout': 1,
			'post-reject': 1,
			'post-fail': 1,
			'check-timeout': 1,
			'check-missing': 1,
			'check-fail': 1,
		};
		if(opts.skipErrors === true) {
			this.skipErrs = valid;
		} else {
			opts.skipErrors.forEach(function(se) {
				if(!valid[se]) throw new Error('Invalid error to skip: ' + se);
				this.skipErrs[se] = 1;
			}.bind(this));
		}
	}
	
	this.doneCb = cb;
	this._start();
}
Uploader.prototype = {
	articlesRead: 0,
	articlesPosted: 0,
	bytesPosted: 0,
	articlesChecked: 0,
	articleErrors: 0,
	totalPostSpeed: 0,
	cancelled: false,
	
	addPost: function(post, continueCb, completeCb) {
		this.articlesRead++;
		post.postTries = 0;
		post.errorCount = 0;
		post.doneCb = completeCb;
		this.queue.add(post, continueCb);
	},
	
	_start: function() {
		var self = this;
		var chkOpts = util.clone(this.opts.check);
		if(chkOpts.tries) {
			if(chkOpts.server) {
				chkOpts.server = util.clone(chkOpts.server);
				for(var k in this.opts.server) {
					if(!(k in chkOpts.server))
						chkOpts.server[k] = this.opts.server[k];
				}
				for(var k in this.opts.server.connect) {
					if(!(k in chkOpts.server.connect))
						chkOpts.server.connect[k] = this.opts.server.connect[k];
				}
			} else
				chkOpts.server = util.clone(this.opts.server);
		} else {
			chkOpts.server = {connections: 0};
			chkOpts.ulConnReuse = false;
		}
		if(!chkOpts.ulConnReuse && !chkOpts.server.connections)
			// not re-using ul connections, and not creating check connections
			// -> cannot possibly perform checks, so disable them
			chkOpts.tries = 0;
		
		// warning flags
		var inputQueueEmptyWarned = false, checkQueueFillWarned = false;
		
		async.parallel([
			async.times.bind(async, this.opts.server.connections, function(i, cb) {
				var c = new NNTP(self.opts.server);
				c.connNum = self.postConnections.length;
				self.postConnections[c.connNum] = c;
				if(chkOpts.ulConnReuse && chkOpts.group)
					c.currentGroup = chkOpts.group; // setting this before .connect causes the group to be auto-selected
				
				if(self.opts.useLazyConnect)
					doPost();
				else
					c.connect(doPost);
				
				function doPost(err) {
					if(err) {
						// TODO: retries? (need to distinguish between connect/post error)
						// TODO: need to handle conditions like max connections reached etc
						self._closeConnection('post', c.connNum);
						return cb(err);
					}
					// clear check queue first
					// TODO: in reality, we need to alternate between the two queues, because this will stall if the post action depends the check queue being processed
					var chkPost;
					if(chkOpts.ulConnReuse && (chkPost = self.checkQueue.takeSync())) {
						self._checkPost(c, chkPost, doPost);
					} else {
						var got = self.queue.take(function(post) {
							if(!post) {
								// no more data, close down?
								if(chkOpts.ulConnReuse) {
									// we still may need to reuse this connection for checking
									// TODO: can't just dedicate the connection for checking if post retrying is enabled
									self._checkLoop(c, cb)();
								} else {
									// no checking needed on this connection, close it down
									self._closeConnection('post', c.connNum);
									cb();
								}
								return;
							}
							if(self.cancelled) return;
							c.post(post, function(err, messageId) {
								if(err) {
									if(self.cancelled && err.code == 'cancelled') return;
									if(self.opts.dumpPostLoc && post.messageId) {
										// since this is just a debugging function, don't bother doing this properly
										require('fs').writeFileSync(self.opts.dumpPostLoc + post.messageId, post.data);
									}
									
									// handle error skipping
									if(messageId) {
										if(err.code == 'timeout' && self.skipErrs['post-timeout']) {
											self._markPostError(post, 'Posting timed out');
											err = null;
										} else if((err.code == 'post_denied' || err.code == 'bad_response') && self.skipErrs['post-reject']) {
											self._markPostError(post, 'Post rejected (' + err.message + ')');
											err = null;
										} else if(self.skipErrs['post-fail']) {
											self._markPostError(post, 'Posting failed (' + err.message + ')');
											err = null;
										}
									} else if(self.skipErrs['post-fail']) {
										post.messageId = null; // skipping post where Message-ID is completely invalid
										self._markPostError(post, 'Posting failed (' + err.message + ')');
										err = null;
									}
								}
								if(!err) {
									self.articlesPosted++;
									self.bytesPosted += post.inputLen;
									if(chkOpts.tries && messageId) {
										post.chkFailures = 0;
										post.postTries++;
										// TODO: careful with holding up the post queue if reusing post connections for checking
										if(!self.checkQueue.add(chkOpts.delay, post, doPost)) {
											if(!checkQueueFillWarned && NNTP.log) NNTP.log.info('Check queue is now full - upload speed will be throttled to compensate');
											checkQueueFillWarned = true;
										}
										return;
									} else {
										self._postComplete(post);
									}
								}
								doPost(err);
							});
						});
						if(!got && !self.hasFinished && self.articlesRead > Math.max(self.opts.server.connections, self.queue.queue.length)) {
							if(!inputQueueEmptyWarned && NNTP.log) NNTP.log.info('Post queue is now empty - upload speed will be throttled to compensate');
							inputQueueEmptyWarned = true;
						}
					}
				}
			}),
			async.times.bind(async, chkOpts.server.connections, function(i, cb) {
				var c = new NNTP(chkOpts.server);
				c.connNum = self.checkConnections.length;
				self.checkConnections[c.connNum] = c;
				if(chkOpts.group)
					c.currentGroup = chkOpts.group; // setting this before .connect causes the group to be auto-selected
				
				if(self.opts.useLazyConnect)
					self._checkLoop(c, cb)();
				else
					c.connect(self._checkLoop(c, cb));
			})
		], this._invokeEnd.bind(this));
	},
	_checkLoop: function(c, cb) {
		var self = this;
		var doCheck = function(err) {
			if(err) return cb(err);
			self.checkQueue.take(function(post) {
				if(!post) { // done, close down
					self._closeConnection('check', c.connNum);
					// TODO: assumes that this is a checking connection and not a posting one
					return cb();
				}
				self._checkPost(c, post, doCheck);
			});
		};
		return doCheck;
	},
	_checkPost: function(conn, post, cb) {
		var self = this;
		if(this.cancelled) return;
		conn.stat(post.messageId, function(err, info) {
			if(err) {
				if(self.cancelled && err.code == 'cancelled') return;
				if(self.opts.dumpPostLoc) {
					require('fs').writeFileSync(self.opts.dumpPostLoc + post.messageId, post.data);
				}
				
				if(err.code == 'timeout' && self.skipErrs['check-timeout']) {
					self._markPostError(post, 'Post check timed out');
					info = true;
				} else if(self.skipErrs['check-fail']) {
					// ignore protocol violations etc
					self._markPostError(post, 'Post check request returned error (' + err.message + ')');
					info = true;
				} else
					return cb(err);
			}
			if(!info) {
				// missing!
				if(++post.chkFailures >= self.opts.check.tries) {
					if(post.postTries <= self.opts.check.postRetries) {
						// repost article
						if(NNTP.log) NNTP.log.warn('Post check failed to find posted article ' + post.messageId + '; re-posting...');
						self.articlesPosted--;
						self.bytesPosted -= post.inputLen;
						// check queue should never wait for the post queue to clear, as it's rather pointless (doesn't save memory); also avoids deadlocking situations if both queues are full
						self.queue.add(post);
						return cb();
					} else {
						if(self.opts.dumpPostLoc) {
							require('fs').writeFileSync(self.opts.dumpPostLoc + post.messageId, post.data);
						}
						
						if(self.skipErrs['check-missing'] || self.skipErrs['check-fail']) {
							self._markPostError(post, 'Post check failed to find post');
							// assume success and continue
						} else {
							return cb(new UploaderError('Posted article ' + post.messageId + ' could not be found'));
						}
					}
				} else {
					// reschedule check
					if(NNTP.log) NNTP.log.debug('Post check failed to find posted article ' + post.messageId + '; will check again later');
					// note that we do a force add (i.e. don't wait for callback), this is because we don't want to stall the check queue in the event that it grows too big (we do want to stall the post queue though). Also, this is really just putting an item back onto the queue, so it never really increases the overall size (by much)
					self.checkQueue.add(self.opts.check.recheckDelay, post);
					return cb();
				}
			}
			// successfully checked, send to next stage
			self._postComplete(post);
			// if main posting routine has finished, need to check whether we're done posting/checking
			if(self.hasFinished && self.articlesRead <= self.articlesChecked) {
				if(!self.checkQueue.isEmpty()) throw new Error('Checking done, but check queue not empty');
				if(self.opts.check.postRetries) {
					// if both check and post queues are empty, then we're done
					if(self.queue.queue.length) throw new Error('Checking done, but post queue not empty');
					self.queue.finished();
				}
				if(!self.queue.hasFinished) throw new Error('Checking done, but post queue not finished');
				self.checkQueue.finished();
			}
			cb();
		});
	},
	_postComplete: function(post) {
		this.articlesChecked++;
		if(post.doneCb) post.doneCb();
	},
	_markPostError: function(post, msg) {
		if(NNTP.log) {
			if(post.messageId)
				NNTP.log.error(msg + ' for article ' + post.messageId + '; continuing regardless');
			else
				NNTP.log.error(msg + '; article skipped');
		}
		if(!post.errorCount) {
			this.articleErrors++;
			if(this.opts.maxPostErrors && this.articleErrors > this.opts.maxPostErrors)
				this._invokeEnd(new UploaderError('Maximum error count reached, upload process aborted'));
		}
		post.errorCount++;
	},
	_invokeEnd: function(err) {
		if(err) {
			this.cancel();
		}
		if(!this.doneCb) return;
		this.doneCb(err);
		this.doneCb = null;
	},
	_closeConnection: function(type, id) {
		var ar = this[type + 'Connections'];
		ar[id].end();
		if(type == 'post') {
			this.totalPostSpeed += ar[id].reqBytesSent / Math.max(ar[id].reqWaitTime, 1);
		}
		ar[id] = null;
	},
	cancel: function(cb) {
		// TODO: mark unchecked articles as complete so that it's written to the NZB
		this.cancelled = true;
		
		var destroyConn = function(conn) {
			if(conn) conn.destroy();
		};
		this.postConnections.forEach(destroyConn);
		this.checkConnections.forEach(destroyConn);
		
		if(cb) cb();
		
	},
	finished: function() {
		this.hasFinished = true;
		var chkOpts = this.opts.check;
		// if we're doing post retries on check failures, we can't end the post queue yet, as retries may occur
		if(!chkOpts.postRetries || !chkOpts.tries || !(chkOpts.ulConnReuse || chkOpts.server.connections))
			this.queue.finished();
	},
	
	currentPostSpeed: function() {
		var speed = this.totalPostSpeed;
		this.postConnections.forEach(function(c) {
			if(c) speed += c.reqBytesSent / Math.max(c.reqWaitTime, 1);
		});
		return speed;
	}
};

module.exports = Uploader;
Uploader.setLogger = function(log) {
	NNTP.log = log;
};
