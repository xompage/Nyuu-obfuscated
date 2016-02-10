"use strict";

var async = require('async');
var EventEmitter = require('events').EventEmitter;
var Queue = require('./queue');
var NNTP = require('./nntp');
var ArticleEncoder = require('./article');
var util = require('./util');
var NZB = require('./nzbbuffer');
var fs = require('fs');
var TimerQueue = require('./timerqueue.js');

// TODO: make this configurable
var subject_func = function(comment, comment2, filename, filesize, part, parts, size) {
	var ret = '';
	if(comment) ret = comment + ' ';
	// TODO: should we revert to single part titles if only 1 part?
	return ret + '"' + filename.replace(/"/g, '') + '" yEnc (' + part + '/' + parts + ') ' + size + (comment2 ? ' ' + comment2 : '');
};

function Uploader(_opts) {
	var defaultOpts = require('../config');
	var opts = {};
	for(var i in defaultOpts)
		if(i in _opts)
			opts[i] = _opts[i];
		else
			opts[i] = defaultOpts[i];
	
	this.postHeaders = opts.postHeaders;
	if(!util.getNCaseKey(this.postHeaders, 'Subject')) {
		this.postHeaders = util.clone(opts.postHeaders);
		this.postHeaders.Subject = subject_func.bind(null, opts.comment, opts.comment2);
	}
	
	this.opts = opts;
	this.queue = new Queue(opts.articleQueueBuffer);
	this.checkQueue = new TimerQueue();
	
	if(opts.nzb.writeTo) {
		this.nzbStream = fs.createWriteStream(opts.nzb.writeTo, opts.nzb.writeOpts);
		this.nzb = new NZB(
			util.getNCaseKey(opts.postHeaders, 'From'),
			util.getNCaseKey(opts.postHeaders, 'Newsgroups').split(',').map(function(g) {
				return g.trim();
			}),
			opts.nzb.metaData,
			this.nzbStream.write.bind(this.nzbStream),
			opts.nzb.minify,
			opts.nzb.writeOpts.encoding
		);
	}
	
	this._ee = new EventEmitter();
	['on','once','removeListener','emit'].forEach(function(f) {
		this[f] = this._ee[f].bind(this._ee);
	}.bind(this));
}
Uploader.prototype = {
	nzb: null,
	addFile: function(fileName, fileSize, stream, fileDone) {
		var enc = new ArticleEncoder(fileName, fileSize, Math.ceil(fileSize / this.opts.articleSize), this.opts.bytesPerLine);
		var sizes = [];
		var self = this;
		
		var nzbFile;
		if(this.nzb)
			// TODO: should use subject instead of of fileName here
			nzbFile = this.nzb.file(fileName, Math.ceil(fileSize / self.opts.articleSize));
		
		async.until(function(){return stream.EOF;}, function(cb) {
			stream.read(self.opts.articleSize, function(err, buffer) {
				if(!buffer.length || err) return cb(err); // EOF / error
				var article = enc.generate(self.postHeaders, buffer);
				sizes.push(article.data.length);
				if(nzbFile)
					article.nzbSeg = nzbFile.set.bind(nzbFile, article.part-1, article.data.length);
				self.queue.add(article, cb);
			});
		}, function(err) {
			fileDone(err, {
				sizes: sizes,
				crc32: enc.crc32
			});
		});
	},
	start: function() {
		var self = this;
		var chkSrvOpts = {}, chkGroup, chkReuse = false;
		if(this.opts.headerCheckTries) {
			for(var k in this.opts.server)
				chkSrvOpts[k] = this.opts.server[k];
			for(var k in this.opts.checkServers)
				chkSrvOpts[k] = this.opts.checkServers[k];
			chkGroup = this.opts.headerCheckGroup;
			if(!chkGroup) {
				// determine group from post headers - we just pick the first one
				chkGroup = util.getNCaseKey(this.opts.postHeaders, 'Newsgroups').replace(/,.*$/, '').trim();
			}
			chkReuse = this.opts.headerCheckUlConnReuse;
		}
		async.parallel([
			async.times.bind(async, this.opts.connections, function(i, cb) {
				var c = new NNTP(self.opts.server);
				if(chkReuse)
					c.currentGroup = chkGroup; // setting this before .connect causes the group to be auto-selected
				c.connect(function doPost(err) {
					if(err) {
						// TODO: retries? (need to distinguish between connect/post error)
						// TODO: need to handle conditions like max connections reached etc
						c.end();
						return cb(err);
					}
					// clear check queue first
					var chkPost;
					if(chkReuse && (chkPost = self.checkQueue.takeSync())) {
						self._checkPost(c, chkPost, doPost);
					} else {
						self.queue.take(function(post) {
							if(!post) {
								// no more data, close down?
								if(chkReuse) {
									// we still may need to reuse this connection for checking
									self._checkLoop(c, cb)();
								} else {
									// no checking needed on this connection, close it down
									c.end();
									cb();
								}
								return;
							}
							c.post(post.data, function(err, messageId) {
								if(!err) {
									post.messageId = messageId;
									if(self.opts.headerCheckTries) {
										post.chkFailures = 0;
										self.checkQueue.add(self.opts.headerCheckDelays[0], post);
									} else {
										// assume success and continue
										if(post.nzbSeg) post.nzbSeg(messageId);
									}
								}
								doPost(err);
							});
						});
					}
				});
			}),
			async.times.bind(async, this.opts.headerCheckConnections, function(i, cb) {
				var c = new NNTP(chkSrvOpts);
				c.currentGroup = chkGroup; // setting this before .connect causes the group to be auto-selected
				c.connect(self._checkLoop(c, cb));
				
			})
		], this._uploadDone.bind(this));
	},
	_checkLoop: function(c, cb) {
		var self = this;
		var doCheck = function(err) {
			if(err) return cb(err); // TODO: should we close all connections on error?
			self.checkQueue.take(function(post) {
				if(!post) { // done, close down
					c.end();
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
			// TODO: retry or fail? we'll do the latter for now
			if(err) return cb(err);
			if(!info) {
				// missing!
				if(++post.chkFailures >= self.opts.headerCheckTries) {
					// TODO: add option to ignore check failure
					// TODO: add option to retry posting
					return cb(new Error('Posted article ' + post.messageId + ' could not be found'));
				} else {
					// reschedule check
					self.checkQueue.add(self.opts.headerCheckDelays[1], post);
				}
			} else {
				// successfully checked, write to NZB
				if(post.nzbSeg) post.nzbSeg(post.messageId);
			}
			cb();
		});
	},
	cancel: function(cb) {
		// TODO: cancel upload
		cb();
		
	},
	finished: function(cb) {
		this._done = cb;
		this.queue.finished();
	},
	
	_uploadDone: function(err) {
		if(err) {
			this._ee.emit('error', err);
			return;
		}
		if(this.nzb) {
			this.nzb.end();
			this.nzbStream.end();
		}
		this._done();
	},
	_done: function() { /*do nothing?*/ }
};

module.exports = Uploader;
