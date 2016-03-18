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

function Uploader(numFiles, _opts) {
	var defaultOpts = require('../config');
	var opts = {};
	for(var i in defaultOpts)
		if(i in _opts)
			opts[i] = _opts[i];
		else
			opts[i] = defaultOpts[i];
	
	this.numFiles = numFiles;
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
	this.checkQueue = new TimerQueue();
	
	if(opts.nzb.writeTo) {
		var outStream;
		if(typeof opts.nzb.writeTo == 'string')
			outStream = fs.createWriteStream(opts.nzb.writeTo, opts.nzb.writeOpts);
		else if(typeof opts.nzb.writeTo == 'object' && opts.nzb.writeTo.writable) // assume writable stream
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
	
	this._ee = new EventEmitter();
	['on','once','removeListener','emit'].forEach(function(f) {
		this[f] = this._ee[f].bind(this._ee);
	}.bind(this));
}
Uploader.prototype = {
	fileCount: 0,
	nzb: null,
	addFile: function(fileName, fileSize, stream, fileDone) {
		var enc = new ArticleEncoder(fileName, fileSize, Math.ceil(fileSize / this.opts.articleSize), this.opts.bytesPerLine);
		var sizes = [];
		var self = this;
		var nzbFile;
		
		this.fileCount++;
		if(this.fileCount > this.numFiles) throw new Error('Added more files than specified');
		var headers = util.clone(this.postHeaders);
		headers[this.subject_key] = this.subject_func.bind(null, this.fileCount, this.numFiles);
		
		async.until(function(){return stream.EOF;}, function(cb) {
			stream.read(self.opts.articleSize, function(err, buffer) {
				if(!buffer.length || err) return cb(err); // EOF / error
				var article = enc.generate(headers, buffer);
				sizes.push(article.data.length);
				if(self.nzb) {
					// the subject that the NZB takes is actually the subject of the first post (where counter is (1/xx))
					if(!nzbFile)
						nzbFile = self.nzb.file(article.subject, Math.ceil(fileSize / self.opts.articleSize));
					article.nzbSeg = nzbFile.set.bind(nzbFile, article.part-1, article.data.length);
				}
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
		var chkOpts = util.clone(this.opts.headerCheck);
		if(chkOpts.tries) {
			if(chkOpts.server) {
				chkOpts.server = util.clone(chkOpts.server);
				for(var k in this.opts.server) {
					if(!(k in chkOpts.server))
						chkOpts.server[k] = this.opts.server[k];
				}
			} else
				chkOpts.server = this.opts.server;
			if(!chkOpts.group) {
				// determine group from post headers - we just pick the first one
				chkOpts.group = util.getNCaseKey(this.opts.postHeaders, 'Newsgroups').replace(/,.*$/, '').trim();
			}
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
				if(chkOpts.ulConnReuse)
					c.currentGroup = chkOpts.group; // setting this before .connect causes the group to be auto-selected
				c.connect(function doPost(err) {
					if(err) {
						// TODO: retries? (need to distinguish between connect/post error)
						// TODO: need to handle conditions like max connections reached etc
						c.end();
						return cb(err);
					}
					// clear check queue first
					var chkPost;
					if(chkOpts.ulConnReuse && (chkPost = self.checkQueue.takeSync())) {
						self._checkPost(c, chkPost, doPost);
					} else {
						self.queue.take(function(post) {
							if(!post) {
								// no more data, close down?
								if(chkOpts.ulConnReuse) {
									// we still may need to reuse this connection for checking
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
									if(chkOpts.tries) {
										post.chkFailures = 0;
										self.checkQueue.add(chkOpts.checkDelay, post);
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
			// TODO: retry or fail? we'll do the latter for now
			if(err) return cb(err);
			if(!info) {
				// missing!
				if(++post.chkFailures >= self.opts.headerCheck.tries) {
					switch(self.opts.headerCheck.failAction) {
						case 'error':
							return cb(new Error('Posted article ' + post.messageId + ' could not be found'));
						case 'warn':
							// TODO: print warning and assume successful anyway
							break;
						case 'repost':
							// TODO: repost article
							// be careful of the case that the posting queue has actually finished
							// (probably need to defer the finish action if this option is set)
					}
				} else {
					// reschedule check
					self.checkQueue.add(self.opts.headerCheck.recheckDelay, post);
					return cb();
				}
			}
			// successfully checked, write to NZB
			if(post.nzbSeg) post.nzbSeg(post.messageId);
			// if posting has completed, and the check queue is now empty, we're done checking
			if(self.queue.hasFinished && !self.checkQueue.totalQueueSize())
				self.checkQueue.finished();
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
			// TODO: cleanup (close connections, cancel queues etc?)
			if(this.nzb) {
				try {
					this.nzbStream.end();
				} catch(x) {}
			}
			this._ee.emit('error', err);
			return;
		}
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
