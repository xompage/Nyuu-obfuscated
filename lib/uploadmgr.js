"use strict";

var ArticleEncoder = require('./article');
var util = require('./util');
var Uploader = require('./uploader');

// optional includes
var NZB, BufferPool, fs, zlib, XzCompressor;

var RE_QUOTE = /"/g;
var AR_NZB_OVR = ['subject', 'poster', 'groups', 'date'];

// TODO: make this configurable
var subject_func = function(comment, comment2, filenum, filenumtotal, filename, filesize, part, parts, size) {
	var ret = '';
	if(comment) ret = comment + ' ';
	if(filenumtotal > 1) ret += '[' + filenum + '/' + filenumtotal + '] - ';
	// TODO: should we revert to single part titles if only 1 part?
	return ret + '"' + filename.replace(RE_QUOTE, '') + '" yEnc (' + part + '/' + parts + ') ' + filesize + (comment2 ? ' ' + comment2 : '');
};

var trim = function(s) {
	return s.trim();
};

function UploadManager(opts, cb) {
	this.opts = opts;
	this.articleSize = opts.articleSize || 768000;
	
	if(opts.nzb && opts.nzb.writeTo) {
		var outStream;
		if(typeof opts.nzb.writeTo == 'string')
			outStream = (fs || (fs = require('fs'))).createWriteStream(opts.nzb.writeTo, opts.nzb.writeOpts);
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
				this.nzbStream = (zlib || (zlib = require('zlib'))).createGzip(opts.nzb.compressOpts);
				this.nzbStream.pipe(outStream);
			break;
			case 'deflate':
				this.nzbStream = (zlib || (zlib = require('zlib'))).createDeflateRaw(opts.nzb.compressOpts);
				this.nzbStream.pipe(outStream);
			break;
			case 'zlib':
				this.nzbStream = (zlib || (zlib = require('zlib'))).createDeflate(opts.nzb.compressOpts);
				this.nzbStream.pipe(outStream);
			break;
			case 'xz':
				this.nzbStream = new (XzCompressor || (XzCompressor = require('xz').Compressor))(opts.nzb.compressOpts.level, opts.nzb.compressOpts);
				this.nzbStream.pipe(outStream);
			break;
			default:
				this.nzbStream = outStream;
		}
		this.nzb = new (NZB || (NZB = require('./nzbbuffer')))(
			opts.nzb.metaData,
			this.nzbStream.write.bind(this.nzbStream),
			opts.nzb.minify,
			opts.nzb.writeOpts ? opts.nzb.writeOpts.encoding : ''
		);
	}
	
	this.uploader = new Uploader(opts, function(err) {
		if(this.nzb) {
			this.nzb.end(!!err);
			try {
				this.nzbStream.end();
			} catch(x) {
				if(UploadManager.log) UploadManager.log.warn('Exception raised when trying to close NZB stream: ' + x);
			}
		}
		// TODO: cancel reading if error
		// TODO: add ability to upload NZBs
		//  for this, the uploading section can't close the connections
		cb(err);
	}.bind(this));
	
	if(opts.useBufferPool !== false) {
		if(!BufferPool)
			BufferPool = require('./bufferpool');
		this.bufferPool = new BufferPool(ArticleEncoder.maxSize(this.articleSize, opts.bytesPerLine) + opts.headerAllocSize, BufferPool.calcSizeForUpload(this.uploader, opts.servers));
	}
	
	this.defaultSubject = subject_func.bind(null, opts.comment, opts.comment2);
	this.dateOverride = opts.postDate;
	if(this.dateOverride && !(this.dateOverride instanceof Date))
		this.dateOverride = new Date(this.dateOverride);
}
UploadManager.prototype = {
	nzb: null,
	bufferPool: null,
	dateOverride: null,
	
	addFile: function(fileName, fileSize, fileNum, fileNumTotal, postHeaders, stream, fileDone) {
		var enc = new ArticleEncoder(fileName, fileSize, this.articleSize, this.opts.bytesPerLine, this.dateOverride);
		var sizes = [];
		var self = this;
		var nzbFile;
		
		if(typeof postHeaders == 'function')
			postHeaders = postHeaders(fileName, fileSize, fileNum, fileNumTotal);
		var headers = util.clone(postHeaders);
		// default subject if null
		var subject_key = util.getNCaseKeyIndex(headers, 'Subject');
		if(headers[subject_key] === null)
			headers[subject_key] = this.defaultSubject;
		
		// bind in fileNum/fileNumTotal to functions
		for(var k in headers) {
			if(typeof headers[k] == 'function') {
				headers[k] = headers[k].bind(null, fileNum, fileNumTotal);
			}
		}
		
		(function readLoop() {
			stream.read(self.articleSize, function(err, buffer) {
				if(err || !buffer.length) { // EOF / error
					return fileDone(err, {
						sizes: sizes,
						crc32: enc.crc32
					});
				}
				var post = enc.generate(headers, buffer, self.bufferPool);
				sizes.push(post.postLen);
				post.keepMessageId = self.opts.keepMessageId;
				if(self.nzb) {
					if(!nzbFile) {
						var nzbArgs = [
							// the subject that the NZB takes is actually the subject of the first post (where counter is (1/xx))
							post.headers.subject,
							post.headers.from,
							post.headers.newsgroups,
							Math.ceil(fileSize / self.articleSize),
							post.genTime
						];
						AR_NZB_OVR.forEach(function(k, i) {
							var ov = self.opts.nzb.overrides[k];
							if(i == 3) i++; // ugly hack for 'date'
							if(typeof ov == 'function') {
								ov = ov(nzbArgs[i], fileNum, fileNumTotal, fileName, fileSize, nzbArgs[3]);
							}
							if(ov !== null && ov !== undefined)
								nzbArgs[i] = ov;
						});
						// fix newsgroups/date lines
						if(!Array.isArray(nzbArgs[2]))
							nzbArgs[2] = nzbArgs[2].split(',').map(trim);
						if((typeof nzbArgs[4] != 'number') && !(nzbArgs[4] instanceof Date))
							nzbArgs[4] = new Date(nzbArgs[4]);
						nzbFile = self.nzb.file.apply(self.nzb, nzbArgs);
					}
					post.nzbSeg = nzbFile.set.bind(nzbFile, post.part-1, post.postLen);
				}
				self.uploader.addPost(post, setImmediate.bind(null, readLoop), self.onPosted.bind(self, post));
			});
		})();
	},
	onPosted: function(post, err) {
		if(post.nzbSeg) {
			// the following will skip writing a segment if the Message-ID is invalid
			post.nzbSeg(post.messageId);
		}
		post.release();
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
