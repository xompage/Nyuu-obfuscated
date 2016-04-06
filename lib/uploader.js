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
var BufferPool = require('./bufferpool.js');

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
	this.queue = new Queue(opts.articleQueueBuffer || (opts.server.connections*2));
	this.checkQueue = new TimerQueue(opts.check.queueBuffer || (opts.server.connections*8));
	if(opts.useBufferPool)
		this.bufferPool = new BufferPool(ArticleEncoder.maxSize(opts.articleSize, opts.bytesPerLine));
	
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
	this.postConnections = [];
	this.checkConnections = [];
	
	this._ee = new EventEmitter();
	['on','once','removeListener','emit'].forEach(function(f) {
		this[f] = this._ee[f].bind(this._ee);
	}.bind(this));
}
Uploader.prototype = {
	nzb: null,
	bufferPool: null,
	articlesRead: 0,
	articlesPosted: 0,
	articlesChecked: 0,
	
	addFile: function(fileName, fileSize, fileNum, fileNumTotal, stream, fileDone) {
		var enc = new ArticleEncoder(fileName, fileSize, Math.ceil(fileSize / this.opts.articleSize), this.opts.bytesPerLine);
		var sizes = [];
		var self = this;
		var nzbFile;
		
		var headers = util.clone(this.postHeaders);
		headers[this.subject_key] = this.subject_func.bind(null, fileNum, fileNumTotal);
		
		(function readLoop() {
			stream.read(self.opts.articleSize, function(err, buffer) {
				if(err || !buffer.length) { // EOF / error
					return fileDone(err, {
						sizes: sizes,
						crc32: enc.crc32
					});
				}
				var buf = self.bufferPool ? self.bufferPool.get() : null;
				var post = enc.generate(headers, buffer, buf);
				sizes.push(post.data.length);
				if(self.nzb) {
					// the subject that the NZB takes is actually the subject of the first post (where counter is (1/xx))
					if(!nzbFile)
						nzbFile = self.nzb.file(post.subject, Math.ceil(fileSize / self.opts.articleSize));
					post.nzbSeg = nzbFile.set.bind(nzbFile, post.part-1, post.data.length);
				}
				post.postTries = 0;
				post.buffer = buf;
				self.queue.add(post, readLoop);
				self.articlesRead++;
			});
		})();
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
			
		async.parallel([
			async.times.bind(async, this.opts.server.connections, function(i, cb) {
				var c = new NNTP(self.opts.server);
				c.connNum = self.postConnections.length;
				self.postConnections[c.connNum] = c;
				if(chkOpts.ulConnReuse && chkOpts.group)
					c.currentGroup = chkOpts.group; // setting this before .connect causes the group to be auto-selected
				c.connect(function doPost(err) {
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
									self.postConnections[c.connNum] = null;
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
									
									self.articlesPosted++;
									if(chkOpts.tries) {
										post.chkFailures = 0;
										post.postTries++;
										// TODO: careful with holding up the post queue if reusing post connections for checking
										return self.checkQueue.add(chkOpts.delay, post, doPost);
									} else {
										self._postComplete(post);
									}
								}
								doPost(err);
							});
						});
					}
				});
			}),
			async.times.bind(async, chkOpts.server.connections, function(i, cb) {
				var c = new NNTP(chkOpts.server);
				c.connNum = self.postConnections.length;
				self.checkConnections[c.connNum] = c;
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
			if(err) return cb(err); // if we get an error, something isn't right (e.g. protocol violation) so don't bother retrying at this point
			if(!info) {
				// missing!
				if(++post.chkFailures >= self.opts.check.tries) {
					if(post.postTries <= self.opts.check.postRetries) {
						// repost article
						if(NNTP.log) NNTP.log.warn('Post check failed to find posted article ' + post.messageId + '; re-posting...');
						self.articlesPosted--;
						// check queue should never wait for the post queue to clear, as it's rather pointless (doesn't save memory); also avoids deadlocking situations if both queues are full
						self.queue.add(post);
						return cb();
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
		if(post.nzbSeg) post.nzbSeg(post.messageId);
		if(post.buf) this.bufferPool.put(post.buf);
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
		if(this.bufferPool) this.bufferPool.drain();
	},
	
	_closeNZB: function(hasError) {
		if(this.nzb) {
			if(!hasError) this.nzb.end();
			try {
				this.nzbStream.end();
			} catch(x) {
				if(NNTP.log) NNTP.log.warn('Exception raised when trying to close NZB stream: ' + x);
			}
		}
	},
	_uploadDone: function(err) {
		if(err) {
			// TODO: cleanup (close connections, cancel queues etc?)
			this._closeNZB(true);
			this._ee.emit('error', err);
			return;
		}
		// TODO: add ability to upload NZBs
		//  for this, the uploading section can't close the connections
		this._closeNZB();
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
