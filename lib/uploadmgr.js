"use strict";

var ArticleEncoder = require('./article');
var util = require('./util');
var Uploader = require('./uploader');

// optional includes
var NZB, BufferPool, fs, zlib;

var RE_QUOTE = /"/g;
var AR_NZB_OVR = ['subject', 'poster', 'groups', 'date'];

var trim = function(s) {
	return s.trim();
};

var reloadPost = function(post, stream, size, pool, cb) {
	if(post.data) throw new Error('Attempt to reload post that already has been loaded');
	var buf = pool ? pool.get() : (Buffer.allocUnsafe || Buffer)(size);
	stream.readRange((post.part-1) * size, buf, function(err, data) {
		if(!err) post.reloadData(data);
		if(pool) pool.put(buf);
		cb(err);
	});
};

var createNzb = function(opts) {
	var outStream;
	if(typeof opts.writeTo == 'string')
		outStream = (fs || (fs = require('fs'))).createWriteStream(opts.writeTo, opts.writeOpts);
	else if(typeof opts.writeTo == 'function') {
		outStream = opts.writeTo();
		if(typeof outStream != 'object' || !outStream.writable) // assume writable stream
			throw new Error('Invalid value for nzb.writeTo');
	} else if(typeof opts.writeTo == 'object' && opts.writeTo.writable) // assume writable stream
		outStream = opts.writeTo;
	else
		throw new Error('Invalid value for nzb.writeTo');
	
	if(opts.corkOutput && outStream.cork)
		outStream.cork();
	
	var nzbStream = outStream;
	switch(opts.compression) {
		case 'gzip':
			nzbStream = (zlib || (zlib = require('zlib'))).createGzip(opts.compressOpts);
			nzbStream.pipe(outStream);
		break;
		case 'deflate':
			nzbStream = (zlib || (zlib = require('zlib'))).createDeflateRaw(opts.compressOpts);
			nzbStream.pipe(outStream);
		break;
		case 'zlib':
			nzbStream = (zlib || (zlib = require('zlib'))).createDeflate(opts.compressOpts);
			nzbStream.pipe(outStream);
		break;
		case 'brotli':
			if(!zlib) zlib = require('zlib');
			var cOpts = util.extend({}, opts.compressOpts || {});
			if(cOpts.level !== undefined && cOpts[zlib.constants.BROTLI_PARAM_QUALITY] === undefined) {
				cOpts[zlib.constants.BROTLI_PARAM_QUALITY] = cOpts.level;
				delete cOpts.level;
			}
			if(cOpts[zlib.constants.BROTLI_PARAM_MODE] === undefined) // default to signalling text
				cOpts[zlib.constants.BROTLI_PARAM_MODE] = zlib.constants.BROTLI_MODE_TEXT;
			nzbStream = zlib.createBrotliCompress({params: cOpts});
			nzbStream.pipe(outStream);
		break;
	}
	var nzb = new (NZB || (NZB = require('./nzbbuffer')))(
		opts.metaData,
		nzbStream.write.bind(nzbStream),
		opts.minify,
		opts.writeOpts ? opts.writeOpts.encoding : ''
	);
	nzb.stream = nzbStream;
	nzb.overrides = opts.overrides || {};
	return nzb;
};
var closeNzb = function(nzb, err) {
	nzb.end(!!err);
	if(nzb.stream !== process.stdout && nzb.stream !== process.stderr) { // stdio cannot be closed
		nzb.stream.on('error', function(err) {
			if(UploadManager.log) UploadManager.log.warn('Exception raised when trying to close NZB stream: ' + err);
		});
		try {
			nzb.stream.end();
		} catch(x) {
			if(UploadManager.log) UploadManager.log.warn('Exception raised when trying to close NZB stream: ' + x);
		}
	}
};

function UploadManager(opts, cb) {
	this.opts = opts;
	this.articleSize = opts.articleSize || 768000;
	
	this.nzbs = {};
	this.uploader = new Uploader(opts, function(err) {
		for(var k in this.nzbs)
			closeNzb(this.nzbs[k], err);
		// TODO: cancel reading if error
		// TODO: add ability to upload NZBs
		//  for this, the uploading section can't close the connections
		cb(err);
	}.bind(this));
	
	if(opts.useBufferPool !== false) {
		if(!BufferPool)
			BufferPool = require('./bufferpool');
		this.bufferPool = new BufferPool(ArticleEncoder.maxSize(this.articleSize, opts.bytesPerLine) + opts.headerAllocSize, BufferPool.calcSizeForUpload(this.uploader, opts.servers), opts.useSharedBuffers);
		this.reloadBufPool = new BufferPool(this.articleSize, null, opts.useSharedBuffers);
	}
	
	this.dateOverride = opts.postDate;
	if(this.dateOverride && !(this.dateOverride instanceof Date))
		this.dateOverride = new Date(this.dateOverride);
}
UploadManager.prototype = {
	nzbs: null,
	bufferPool: null,
	reloadBufPool: null,
	dateOverride: null,
	
	getNzb: function(fileNum, fileNumTotal, fileName, fileSize) {
		if(!this.opts.nzb) return;
		
		if(typeof this.opts.nzb == 'function') {
			var nzb = this.opts.nzb(fileNum, fileNumTotal, fileName, fileSize, 1, Math.ceil(fileSize / this.articleSize));
			if(nzb) {
				if(!Array.isArray(nzb))
					throw new Error('Invalid NZB specification supplied for file: ' + fileName);
				if(!this.nzbs[nzb[0]]) {
					if(nzb.length != 2 || typeof nzb[1] != 'object')
						throw new Error('Invalid NZB specification supplied for file: ' + fileName);
					if(nzb[1].writeTo === null || nzb[1].writeTo === undefined)
						return; // assume user intended to not write any output (consistent with default setup)
					this.nzbs[nzb[0]] = createNzb(nzb[1]);
				}
				return this.nzbs[nzb[0]];
			}
		} else if(this.opts.nzb.writeTo !== null && this.opts.nzb.writeTo !== undefined) {
			// single NZB output -> map to '_'
			if(!this.nzbs._)
				this.nzbs._ = createNzb(this.opts.nzb);
			return this.nzbs._;
		}
	},
	
	addFile: function(fileNum, fileNumTotal, fileName, fileSize, postHeaders, stream, fileDone) {
		var enc = new ArticleEncoder(fileName, fileSize, this.articleSize, this.opts.bytesPerLine, this.dateOverride);
		var sizes = [];
		var self = this;
		var numParts = Math.ceil(fileSize / self.articleSize);
		var nzbFile;
		var nzb = this.getNzb(fileNum, fileNumTotal, fileName, fileSize);
		
		if(typeof postHeaders == 'function')
			postHeaders = postHeaders(fileNum, fileNumTotal, fileName, fileSize, 1, numParts);
		var headers = util.extend({}, postHeaders);
		
		// default subject: pre-generate most of it - only the thing that needs customising, is the part number
		var preSubj = '';
		if(this.opts.comment) preSubj = this.opts.comment + ' ';
		if(fileNumTotal > 1)
			preSubj += '[' + '0000000000000000'.substr(0, (''+fileNumTotal).length - (''+fileNum).length) + fileNum + '/' + fileNumTotal + '] - ';
		// TODO: should we revert to single part titles if only 1 part?
		preSubj += '"' + fileName.replace(RE_QUOTE, '') + '" yEnc (';
		var postSubj = '/' + enc.parts + ') ' + fileSize + (this.opts.comment2 ? ' ' + this.opts.comment2 : '');
		
		// bind in fileNum/fileNumTotal to functions
		for(var k in headers) {
			if(typeof headers[k] == 'function') {
				headers[k] = headers[k].bind(null, fileNum, fileNumTotal);
			}
		}
		enc.setHeaders(headers, preSubj, postSubj);
		
		var sizeRead = 0;
		(function readLoop() {
			stream.read(self.articleSize, function(err, buffer) {
				if(err || !buffer.length) { // EOF / error
					if(!err && fileSize != sizeRead)
						err = new Error('Bytes read from file (' + sizeRead + ') does not match size of file (' + fileSize + ')');
					return fileDone(err, {
						sizes: sizes,
						crc32: enc.crc32
					});
				}
				sizeRead += buffer.length;
				var postHeaders;
				if(nzb && !nzbFile) postHeaders = {};
				var post = enc.generate(buffer, self.bufferPool, postHeaders);
				sizes.push(post.postLen);
				post.keepMessageId = self.opts.keepMessageId;
				if(nzb) {
					if(!nzbFile) {
						var nzbArgs = [
							// the subject that the NZB takes is actually the subject of the first post (where counter is (1/xx))
							postHeaders.subject,
							postHeaders.from,
							postHeaders.newsgroups,
							numParts,
							post.genTime
						];
						AR_NZB_OVR.forEach(function(k, i) {
							var ov = nzb.overrides[k];
							if(i == 3) i++; // ugly hack for 'date'
							if(typeof ov == 'function') {
								ov = ov(fileNum, fileNumTotal, fileName, fileSize, 1, nzbArgs[3], nzbArgs[i]);
							}
							if(ov !== null && ov !== undefined)
								nzbArgs[i] = ov;
						});
						// fix newsgroups/date lines
						if(!Array.isArray(nzbArgs[2]))
							nzbArgs[2] = nzbArgs[2].split(',').map(trim);
						if((typeof nzbArgs[4] != 'number') && !(nzbArgs[4] instanceof Date))
							nzbArgs[4] = new Date(nzbArgs[4]);
						nzbFile = nzb.file.apply(nzb, nzbArgs);
					}
					post.nzbSeg = nzbFile.set.bind(nzbFile, post.part-1, post.postLen);
				}
				if(stream.readRange) // reloadable post
					post.reload = reloadPost.bind(null, post, stream, self.articleSize, self.reloadBufPool);
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
	cancel: function(reason) {
		// TODO: cancel upload
		this.uploader.cancel(reason);
	},
	finished: function() {
		this.uploader.finished();
	}
};

UploadManager.log = null;
module.exports = UploadManager;
UploadManager.setLogger = function(log) {
	UploadManager.log = log;
	Uploader.setLogger(log);
};
