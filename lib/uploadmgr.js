"use strict";

var ArticleEncoder = require('./article');
var util = require('./util');
var NZB = require('./nzbbuffer');
var BufferPool = require('./bufferpool.js');
var Uploader = require('./uploader');

// TODO: make this configurable
var subject_func = function(comment, comment2, filenum, filenumtotal, filename, filesize, part, parts, size) {
	var ret = '';
	if(comment) ret = comment + ' ';
	if(filenumtotal > 1) ret += '[' + filenum + '/' + filenumtotal + '] - ';
	// TODO: should we revert to single part titles if only 1 part?
	return ret + '"' + filename.replace(/"/g, '') + '" yEnc (' + part + '/' + parts + ') ' + filesize + (comment2 ? ' ' + comment2 : '');
};

var trim = function(s) {
	return s.trim();
};

function UploadManager(opts, cb) {
	this.opts = opts;
	this.articleSize = opts.articleSize || 768000;
	if(opts.useBufferPool !== false)
		this.bufferPool = new BufferPool(ArticleEncoder.maxSize(this.articleSize, opts.bytesPerLine));
	
	if(opts.nzb && opts.nzb.writeTo) {
		var outStream;
		if(typeof opts.nzb.writeTo == 'string')
			outStream = require('fs').createWriteStream(opts.nzb.writeTo, opts.nzb.writeOpts);
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
			opts.nzb.metaData,
			this.nzbStream.write.bind(this.nzbStream),
			opts.nzb.minify,
			opts.nzb.writeOpts ? opts.nzb.writeOpts.encoding : ''
		);
	}
	
	this.uploader = new Uploader(opts, function(err) {
		if(this.nzb) {
			if(!err) this.nzb.end();
			try {
				this.nzbStream.end();
			} catch(x) {
				if(UploadManager.log) UploadManager.log.warn('Exception raised when trying to close NZB stream: ' + x);
			}
		}
		// TODO: add ability to upload NZBs
		//  for this, the uploading section can't close the connections
		cb(err);
	}.bind(this));
}
UploadManager.prototype = {
	nzb: null,
	bufferPool: null,
	
	addFile: function(fileName, fileSize, fileNum, fileNumTotal, postHeaders, stream, fileDone) {
		var enc = new ArticleEncoder(fileName, fileSize, Math.ceil(fileSize / this.articleSize), this.opts.bytesPerLine);
		var sizes = [];
		var self = this;
		var nzbFile;
		
		if(typeof postHeaders == 'function')
			postHeaders = postHeaders(fileName, fileSize, fileNum, fileNumTotal);
		var headers = util.clone(postHeaders);
		var subject_key = util.getNCaseKeyIndex(headers, 'Subject');
		var subj = headers[subject_key];
		if(subj) {
			if(typeof subj == 'function')
				headers[subject_key] = subj.bind(null, fileNum, fileNumTotal);
		} else {
			headers.Subject = subject_func.bind(null, this.opts.comment, this.opts.comment2, fileNum, fileNumTotal);
		}
		
		(function readLoop() {
			stream.read(self.articleSize, function(err, buffer) {
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
					if(!nzbFile) {
						nzbFile = self.nzb.file(
							post.subject,
							util.getNCaseKey(headers, 'From'),
							util.getNCaseKey(headers, 'Newsgroups').split(',').map(trim),
							Math.ceil(fileSize / self.articleSize)
						);
					}
					post.nzbSeg = nzbFile.set.bind(nzbFile, post.part-1, post.data.length);
				}
				post.buffer = buf;
				post.inputLen = buffer.length;
				self.uploader.addPost(post, setImmediate.bind(null, readLoop), self.onPosted.bind(self, post));
			});
		})();
	},
	onPosted: function(post) {
		if(post.nzbSeg) {
			// the following will skip writing a segment if the Message-ID is invalid
			post.nzbSeg(post.messageId);
		}
		if(post.buffer) this.bufferPool.put(post.buffer);
	},
	cancel: function(cb) {
		// TODO: cancel upload
		this.uploader.cancel(cb);
	},
	finished: function() {
		if(this.bufferPool) this.bufferPool.drain();
		this.uploader.finished();
	}
};

UploadManager.log = null;
module.exports = UploadManager;
UploadManager.setLogger = function(log) {
	UploadManager.log = log;
	Uploader.setLogger(log);
};
