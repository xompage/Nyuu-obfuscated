"use strict";

var async = require('async');
var Queue = require('./queue');
var NNTP = require('./nntp');
var util = require('./util');
var TimerQueue = require('./timerqueue.js');

function UploaderError(message) {
	var r = Error.call(this, message);
	r.name = 'UploaderError';
	r.message = message;
	return r;
}
UploaderError.prototype = Object.create(Error.prototype, {
	constructor: UploaderError
});

function Uploader(_opts, onPosted) {
	var defaultOpts = util.clone(require('../config'));
	var opts = util.clone(_opts);
	// TODO: deep merge these?
	if(!('server' in opts))
		opts.server = defaultOpts.server;
	if(!('check' in opts))
		opts.check = defaultOpts.check;
	
	this.opts = opts;
	this.queue = new Queue(opts.articleQueueBuffer || opts.server.connections, opts.useLazyConnect);
	this.checkQueue = new TimerQueue(opts.check.queueBuffer || (opts.server.connections*8), opts.useLazyConnect);
	
	this.hasFinished = false;
	this.postConnections = [];
	this.checkConnections = [];
	
	this.skipErrs = {};
	if(opts.skipErrors) {
		if(opts.skipErrors === true) {
			this.skipErrs = {
				'post-timeout': 1,
				'post-reject': 1,
				'post-fail': 1,
				'check-timeout': 1,
				'check-missing': 1,
				'check-fail': 1,
			};
		} else {
			opts.skipErrors.forEach(function(se) {
				this.skipErrs[se] = 1;
			}.bind(this));
		}
	}
	
	this.onPosted = onPosted;
}
Uploader.prototype = {
	articlesRead: 0,
	articlesPosted: 0,
	bytesPosted: 0,
	articlesChecked: 0,
	
	addPost: function(post, cb) {
		this.articlesRead++;
		post.postTries = 0;
		this.queue.add(post, cb);
	},
	
	start: function() {
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
						c.end();
						self.postConnections[c.connNum] = null;
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
									c.end();
									self.postConnections[c.connNum] = null;
									cb();
								}
								return;
							}
							c.post(post.headers, post.data, function(err, messageId) {
								if(err) {
									// handle error skipping
									if(messageId) {
										if(err.code == 'timeout' && self.skipErrs['post-timeout']) {
											if(NNTP.log) NNTP.log.error('Posting timed out for article ' + messageId + '; continuing regardless');
											err = null;
										} else if((err.code == 'post_denied' || err.code == 'bad_response') && self.skipErrs['post-reject']) {
											if(NNTP.log) NNTP.log.error('Post rejected (' + err.message + ') for article ' + messageId + '; continuing regardless');
											err = null;
										} else if(self.skipErrs['post-fail']) {
											if(NNTP.log) NNTP.log.error('Posting failed (' + err.message + ') for article ' + messageId + '; continuing regardless');
											err = null;
										}
									} else if(self.skipErrs['post-fail']) {
										if(NNTP.log) NNTP.log.error('Posting failed (' + err.message + '); article skipped');
										err = null;
									}
								}
								if(!err) {
									post.messageId = messageId;
									
									if(self.opts.dumpPosts && messageId) {
										// TODO: consider including path separator?
										// since this is just a debugging function, don't bother being proper about waiting for the callback
										require('fs').writeFile(self.opts.dumpPosts + post.messageId, post.headers.join('\r\n'), function(){});
									}
									
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
						if(!got && self.articlesRead > Math.max(self.opts.server.connections, self.queue.queue.length)) {
							if(!inputQueueEmptyWarned && NNTP.log) NNTP.log.info('Post queue is now empty - upload speed will be throttled to compensate');
							inputQueueEmptyWarned = true;
						}
					}
				}
			}),
			async.times.bind(async, chkOpts.server.connections, function(i, cb) {
				var c = new NNTP(chkOpts.server);
				c.connNum = self.postConnections.length;
				self.checkConnections[c.connNum] = c;
				if(chkOpts.group)
					c.currentGroup = chkOpts.group; // setting this before .connect causes the group to be auto-selected
				
				if(self.opts.useLazyConnect)
					self._checkLoop(c, cb)();
				else
					c.connect(self._checkLoop(c, cb));
			})
		], function(err) {
			if(err) {
				// TODO: cleanup (close connections, cancel queues etc?)
			}
			self._done(err);
		});
	},
	_checkLoop: function(c, cb) {
		var self = this;
		var doCheck = function(err) {
			if(err) return cb(err);
			self.checkQueue.take(function(post) {
				if(!post) { // done, close down
					c.end();
					self.checkConnections[c.connNum] = null; // TODO: assumes that this is a checking connection and not a posting one
					return cb();
				}
				self._checkPost(c, post, doCheck);
			});
		};
		return doCheck;
	},
	_checkPost: function(conn, post, cb) {
		var self = this;
		conn.stat(post.messageId, function(err, info) {
			if(err) {
				if(err.code == 'timeout' && self.skipErrs['check-timeout']) {
					if(NNTP.log) NNTP.log.error('Post check request timed out when checking article ' + post.messageId + '; continuing regardless');
					info = true;
				} else if(self.skipErrs['check-fail']) {
					// ignore protocol violations etc
					if(NNTP.log) NNTP.log.error('Post check request returned error when checking article ' + post.messageId + ': ' + err.message);
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
					} else if(self.skipErrs['check-missing'] || self.skipErrs['check-fail']) {
						if(NNTP.log) NNTP.log.error('Post check failed to find posted article ' + post.messageId + '; continuing regardless');
						// assume success and continue
					} else {
						return cb(new UploaderError('Posted article ' + post.messageId + ' could not be found'));
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
		this.onPosted(post);
	},
	cancel: function(cb) {
		// TODO: cancel upload
		cb();
		
	},
	finished: function(cb) {
		this._done = cb;
		this.hasFinished = true;
		var chkOpts = this.opts.check;
		// if we're doing post retries on check failures, we can't end the post queue yet, as retries may occur
		if(!chkOpts.postRetries || !chkOpts.tries || !(chkOpts.ulConnReuse || chkOpts.server.connections))
			this.queue.finished();
	},
	
	_done: function() {
		throw new Error('Done callback not assigned');
	}
};

module.exports = Uploader;
Uploader.setLogger = function(log) {
	NNTP.log = log;
};
