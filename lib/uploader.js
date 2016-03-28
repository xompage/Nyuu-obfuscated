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
var subject_func = function(comment, comment2, filenum, filenumtotal, filename, filesize, part, parts, size) {
	var ret = '';
	if(comment) ret = comment + ' ';
	if(filenumtotal > 1) ret += '[' + filenum + '/' + filenumtotal + '] - ';
	// TODO: should we revert to single part titles if only 1 part?
	return ret + '"' + filename.replace(/"/g, '') + '" yEnc (' + part + '/' + parts + ') ' + filesize + (comment2 ? ' ' + comment2 : '');
};

function UploaderError(message) {
	var r = Error.call(this, message);
	r.name = 'UploaderError';
	r.message = message;
	return r;
}
UploaderError.prototype = Object.create(Error.prototype, {
	constructor: UploaderError
});

function Uploader(_opts) {
	var defaultOpts = require('../config');
	var opts = {};
	for(var i in defaultOpts)
		if(i in _opts)
			opts[i] = _opts[i];
		else
			opts[i] = defaultOpts[i];
	
	this.postHeaders = opts.postHeaders;
	this.subject_key = util.getNCaseKeyIndex(this.postHeaders, 'Subject');
	var subj;
	if(subj = this.postHeaders[this.subject_key]) {
		if(typeof subj == 'function')
			this.subject_func = subj;
		else {
			this.subject_func = function() {
				return subj;
			};
		}
	} else {
		this.subject_key = 'Subject';
		this.subject_func = subject_func.bind(null, opts.comment, opts.comment2);
	}
	
	this.opts = opts;
	this.queue = new Queue(opts.articleQueueBuffer);
	this.checkQueue = new TimerQueue(opts.check.queueBuffer);
	
	if(opts.nzb.writeTo) {
		var outStream;
		if(typeof opts.nzb.writeTo == 'string')
			outStream = fs.createWriteStream(opts.nzb.writeTo, opts.nzb.writeOpts);
		else if(typeof opts.nzb.writeTo == 'function') {
			outStream = opts.nzb.writeTo();
			if(typeof outStream != 'object' || !outStream.writable) // assume writable stream
				throw new Error('Invalid value for nzb.writeTo');
		} else if(typeof opts.nzb.writeTo == 'object' && opts.nzb.writeTo.writable) // assume writable stream
			outStream = opts.nzb.writeTo;
		else
			throw new Error('Invalid value for nzb.writeTo');
		
		switch(opts.nzb.compression) {
			case 'gzip':
				this.nzbStream = require('zlib').createGzip(opts.nzb.compressOpts);
				this.nzbStream.pipe(outStream);
			break;
			case 'deflate':
				this.nzbStream = require('zlib').createDeflateRaw(opts.nzb.compressOpts);
				this.nzbStream.pipe(outStream);
			break;
			case 'zlib':
				this.nzbStream = require('zlib').createDeflate(opts.nzb.compressOpts);
				this.nzbStream.pipe(outStream);
			break;
			case 'xz':
				this.nzbStream = new (require('xz').Compressor)(opts.nzb.compressOpts.level, opts.nzb.compressOpts);
				this.nzbStream.pipe(outStream);
			break;
			default:
				this.nzbStream = outStream;
		}
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
	
	this.hasFinished = false;
	
	this._ee = new EventEmitter();
	['on','once','removeListener','emit'].forEach(function(f) {
		this[f] = this._ee[f].bind(this._ee);
	}.bind(this));
}
Uploader.prototype = {
	nzb: null,
	addFile: function(fileName, fileSize, fileNum, fileNumTotal, stream, fileDone) {
		var enc = new ArticleEncoder(fileName, fileSize, Math.ceil(fileSize / this.opts.articleSize), this.opts.bytesPerLine);
		var sizes = [];
		var self = this;
		var nzbFile;
		
		var headers = util.clone(this.postHeaders);
		headers[this.subject_key] = this.subject_func.bind(null, fileNum, fileNumTotal);
		
		async.until(function(){return stream.EOF;}, function(cb) {
			stream.read(self.opts.articleSize, function(err, buffer) {
				if(err || !buffer.length) return cb(err); // EOF / error
				var article = enc.generate(headers, buffer);
				sizes.push(article.data.length);
				if(self.nzb) {
					// the subject that the NZB takes is actually the subject of the first post (where counter is (1/xx))
					if(!nzbFile)
						nzbFile = self.nzb.file(article.subject, Math.ceil(fileSize / self.opts.articleSize));
					article.nzbSeg = nzbFile.set.bind(nzbFile, article.part-1, article.data.length);
				}
				article.postTries = 0;
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
		var chkOpts = util.clone(this.opts.check);
		if(chkOpts.tries) {
			if(chkOpts.server) {
				chkOpts.server = util.clone(chkOpts.server);
				for(var k in this.opts.server) {
					if(!(k in chkOpts.server))
						chkOpts.server[k] = this.opts.server[k];
				}
			} else
				chkOpts.server = this.opts.server;
		} else {
			chkOpts.connections = 0;
			chkOpts.ulConnReuse = false;
		}
		if(!chkOpts.ulConnReuse && !chkOpts.connections)
			// not re-using ul connections, and not creating check connections
			// -> cannot possibly perform checks, so disable them
			chkOpts.tries = 0;
			
		async.parallel([
			async.times.bind(async, this.opts.connections, function(i, cb) {
				var c = new NNTP(self.opts.server);
				if(chkOpts.ulConnReuse && chkOpts.group)
					c.currentGroup = chkOpts.group; // setting this before .connect causes the group to be auto-selected
				c.connect(function doPost(err) {
					if(err) {
						// TODO: retries? (need to distinguish between connect/post error)
						// TODO: need to handle conditions like max connections reached etc
						c.end();
						return cb(err);
					}
					// clear check queue first
					// TODO: in reality, we need to alternate between the two queues, because this will stall if the post action depends the check queue being processed
					var chkPost;
					if(chkOpts.ulConnReuse && (chkPost = self.checkQueue.takeSync())) {
						self._checkPost(c, chkPost, doPost);
					} else {
						self.queue.take(function(post) {
							if(!post) {
								// no more data, close down?
								if(chkOpts.ulConnReuse) {
									// we still may need to reuse this connection for checking
									// TODO: can't just dedicate the connection for checking if post retrying is enabled
									self._checkLoop(c, cb)();
								} else {
									// no checking needed on this connection, close it down
									c.end();
									cb();
								}
								return;
							}
							c.post(post.headers, post.data, function(err, messageId) {
								if(!err) {
									post.messageId = messageId;
									
									if(self.opts.dumpPosts) {
										// TODO: consider including path separator?
										// since this is just a debugging function, don't bother being proper about waiting for the callback
										fs.writeFile(self.opts.dumpPosts + post.messageId, post.headers.join('\r\n'), function(){});
									}
									
									if(chkOpts.tries) {
										post.chkFailures = 0;
										post.postTries++;
										// TODO: careful with holding up the post queue if reusing post connections for checking
										return self.checkQueue.add(chkOpts.delay, post, doPost);
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
			async.times.bind(async, chkOpts.connections, function(i, cb) {
				var c = new NNTP(chkOpts.server);
				if(chkOpts.group)
					c.currentGroup = chkOpts.group; // setting this before .connect causes the group to be auto-selected
				c.connect(self._checkLoop(c, cb));
				
			})
		], this._uploadDone.bind(this));
	},
	_checkLoop: function(c, cb) {
		var self = this;
		var doCheck = function(err) {
			if(err) return cb(err);
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
			if(err) return cb(err); // if we get an error, something isn't right (e.g. protocol violation) so don't bother retrying at this point
			if(!info) {
				// missing!
				if(++post.chkFailures >= self.opts.check.tries) {
					if(post.postTries <= self.opts.check.postRetries) {
						// repost article
						if(NNTP.log) NNTP.log.warn('Post check failed to find posted article ' + post.messageId + '; re-posting...');
						return self.queue.add(post, cb);
					} else if(self.opts.check.ignoreFailure) {
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
			// successfully checked, write to NZB
			if(post.nzbSeg) post.nzbSeg(post.messageId);
			// if main posting routine has finished, need to check whether we're done posting/checking
			if(self.hasFinished) {
				var cqe = self.checkQueue.isEmpty();
				if(self.opts.check.postRetries && !self.queue.queue.length && cqe)
					// if both check and post queues are empty, then we're done
					self.queue.finished();
				if(self.queue.hasFinished && cqe)
					self.checkQueue.finished();
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
		this.hasFinished = true;
		var chkOpts = this.opts.check;
		// if we're doing post retries on check failures, we can't end the post queue yet, as retries may occur
		if(!chkOpts.postRetries || !chkOpts.tries || !(chkOpts.ulConnReuse || chkOpts.connections))
			this.queue.finished();
	},
	
	_uploadDone: function(err) {
		if(err) {
			// TODO: cleanup (close connections, cancel queues etc?)
			if(this.nzb) {
				try {
					this.nzbStream.end();
				} catch(x) {}
			}
			this._ee.emit('error', err);
			return;
		}
		// TODO: add ability to upload NZBs
		//  for this, the uploading section can't close the connections
		if(this.nzb) {
			this.nzb.end();
			try {
				this.nzbStream.end();
			} catch(x) {}
		}
		this._done();
	},
	_done: function() {
		throw new Error('Done callback not assigned');
	}
};

module.exports = Uploader;
Uploader.setLogger = function(log) {
	NNTP.log = log;
};
