"use strict";

var y = require('yencode');
var ENCODING = 'utf8';

var RE_BADCHAR = /[\r\n\0]/g;
var AR_CRC = [0,0,0,0];

var BUFFER_ENLARGE_SPACE = 4096; // minimum amount of extra padding to give when enlarging buffers

var resizeBuffer = function(size, src, srcLen) {
	var buf = new Buffer(size);
	src.copy(buf, 0, 0, srcLen);
	return buf;
};

// TODO: should we switch to single encoding mode if only 1 part?
function MultiEncoder(filename, size, articleSize, line_size) {
	if(!line_size) line_size = 128;
	
	this.size = size;
	this.parts = Math.ceil(size / articleSize);
	this.line_size = line_size;
	
	this.part = 0;
	this.pos = 0;
	this.crc = new Buffer(AR_CRC);
	
	filename = filename.replace(RE_BADCHAR, '').substr(0, 256);
	this.filename = filename;
	// TODO: long filenames may exceed the line limit?
	this.yInfo = new Buffer(' total='+this.parts+' line='+line_size+' size='+size+' name='+filename+'\r\n', ENCODING);
	
	this.maxPostSize = y.maxSize(articleSize, line_size)
		+ 88 /* size of fixed strings (incl final CRC) assuming ASCII or similar encoding */
		+ this.yInfo.length
		+ ((this.parts+'').length *2)
		+ ((size+'').length *3);
}
MultiEncoder.prototype = {
	generate: function(headers, data, pool) {
		this.part++;
		if(this.part > this.parts)
			throw new Error('Exceeded number of specified yEnc parts');
		var end = this.pos + data.length;
		if(end > this.size)
			throw new Error('Exceeded total file size');
		
		var crc = y.crc32(data), fullCrc = '';
		this.crc = y.crc32_combine(this.crc, crc, data.length);
		if(this.part == this.parts) {
			// final part treated slightly differently
			if(end != this.size)
				throw new Error('File size doesn\'t match total data length');
			fullCrc = ' crc32='+this.crc.toString('hex');
		}
		
		var _headers = {};
		for(var h in headers) {
			var v = headers[h];
			if(typeof v == 'function')
				v = v(this.filename, this.size, this.part, this.parts, data.length);
			
			_headers[h] = v;
		}
		
		var post = new Post(_headers, pool);
		post.part = this.part;
		
		if(pool) {
			var bufPos = post.postPos;
			var minSpace = bufPos + this.maxPostSize;
			// ensure we have enough space
			if(post.buf.length < minSpace)
				post.buf = resizeBuffer(minSpace, post.buf, bufPos);
			// newly created buffers should be at least this size
			if(pool.size < minSpace)
				pool.size = minSpace + BUFFER_ENLARGE_SPACE;
			
			bufPos += post.buf.write('=ybegin part='+this.part, bufPos, ENCODING);
			this.yInfo.copy(post.buf, bufPos);
			bufPos += this.yInfo.length;
			bufPos += post.buf.write('=ypart begin='+( this.pos+1 )+' end='+end+'\r\n', bufPos, ENCODING);
			bufPos += y.encodeTo(data, post.buf.slice(bufPos), this.line_size);
			bufPos += post.buf.write('\r\n=yend size='+data.length+' part='+this.part+' pcrc32='+crc.toString('hex')+fullCrc+'\r\n.\r\n', bufPos, ENCODING);
			
			post.data = post.buf.slice(0, bufPos);
			post.postLen = bufPos - post.postPos;
		} else {
			post.bufs.push(
				new Buffer('=ybegin part='+this.part, ENCODING),
				this.yInfo,
				new Buffer('=ypart begin='+( this.pos+1 )+' end='+end+'\r\n', ENCODING),
				y.encode(data, this.line_size),
				new Buffer('\r\n=yend size='+data.length+' part='+this.part+' pcrc32='+crc.toString('hex')+fullCrc+'\r\n.\r\n', ENCODING)
			);
			post.data = Buffer.concat(post.bufs);
			post.bufs = null;
			post.postLen = post.data.length - post.postPos;
		}
		
		this.pos = end;
		return post;
	}
};

// pessimistic maximum size of an encoded article
// does not consider the effect of ENCODING, but assumes that it's sane
MultiEncoder.maxSize = function(size, line_size) {
	return 1237 + y.maxSize(size, line_size);
	/* the above is derived from:
	return
		  13 // '=ybegin part='
		+ 10 // len(2^32)
		+  7 // ' total='
		+ 10 // len(2^32)
		+  6 // ' line='
		+  4 // thousands of chars/line
		+  6 // ' size='
		+ 16 // len(2^53)
		+  6 // ' name='
		+1024// a fairly long filename: 256 4-byte characters
		+  2 // '\r\n'
		+ 13 // '=ypart begin='
		+ 16 // len(2^53)
		+  5 // ' end='
		+ 16 // len(2^53)
		+  2 // '\r\n'
		+ y.maxSize(size, line_size)
		+ 13 // '\r\n=yend size='
		+ 16 // len(2^53)
		+  6 // ' part='
		+ 10 // len(2^32)
		+  8 // ' pcrc32='
		+  8 // len(hex(crc32))
		+  7 // ' crc32='
		+  8 // len(hex(crc32))
		+  5 // '\r\n.\r\n'
	;
	*/
};


var crypto = require('crypto');
var _makeMsgId = function() {
	return crypto.pseudoRandomBytes(16).toString('hex') + '-' + Date.now() + '@nyuu';
};

function Post(headers, pool) {
	this.headers = {};
	this.postPos = 0;
	this.pool = pool;
	
	this.messageId = _makeMsgId();
	if(pool) {
		this.buf = pool.get();
		while(1) {
			for(var h in headers) {
				var v = headers[h];
				
				this.headers[h.toLowerCase()] = v;
				this.postPos += this.buf.write(h + ': ' + v.replace(RE_BADCHAR, '') + '\r\n', this.postPos, ENCODING);
			}
			if(this.postPos >= this.buf.length) {
				// likely overflowed, try again
				this.buf = new Buffer(this.buf.length + Math.max(this.buf.length, BUFFER_ENLARGE_SPACE));
				this.postPos = 0;
				continue;
			}
			break;
		}
		
		// write in Message-ID
		this.mIdPos = this.postPos + 13 /* 'Message-ID: <'.length */;
		this.postPos += this.buf.write('Message-ID: <' + this.messageId + '>\r\n\r\n', this.postPos, ENCODING);
	} else {
		this.bufs = [];
		var d;
		for(var h in headers) {
			var v = headers[h];
			
			this.headers[h.toLowerCase()] = v;
			d = new Buffer(h + ': ' + v.replace(RE_BADCHAR, '') + '\r\n', ENCODING);
			this.postPos += d.length;
			this.bufs.push(d);
		}
		// write in Message-ID
		this.mIdPos = this.postPos + 13 /* 'Message-ID: <'.length */;
		d = new Buffer('Message-ID: <' + this.messageId + '>\r\n\r\n', ENCODING);
		this.postPos += d.length;
		this.bufs.push(d);
	}
}
Post.prototype = {
	part: null,
	data: null,
	postLen: null,
	
	buf: null,
	bufs: null,
	
	randomizeMessageID: function() {
		var rnd = crypto.pseudoRandomBytes(16).toString('hex');
		this.data.write(rnd, this.mIdPos, ENCODING);
		return this.messageId = rnd + this.messageId.substr(32);
	},
	
	release: function() {
		if(this.pool) this.pool.put(this.buf);
	}
	
};


module.exports = MultiEncoder;
