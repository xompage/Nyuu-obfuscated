"use strict";

var y = require('yencode');
var ENCODING = 'utf8'; // NOTE: will assume that this is set to 'utf8', 'ascii' or similar; NNTP explicitly assumes this

var RE_BADCHAR = /[\r\n\0]/g;
var AR_CRC = [0,0,0,0];

var BUFFER_ENLARGE_SPACE = 4096; // minimum amount of extra padding to give when enlarging buffers

var NEWLINE = new Buffer('\r\n', ENCODING);

var resizeBuffer = function(size, src, srcLen) {
	var buf = new Buffer(size);
	src.copy(buf, 0, 0, srcLen);
	return buf;
};

// TODO: should we switch to single encoding mode if only 1 part?
function MultiEncoder(filename, size, articleSize, line_size, timestamp) {
	if(!line_size) line_size = 128;
	
	this.size = size;
	this.parts = Math.ceil(size / articleSize);
	this.line_size = line_size;
	this.timestamp = timestamp;
	
	this.part = 0;
	this.pos = 0;
	this.crc = new Buffer(AR_CRC);
	
	filename = filename.replace(RE_BADCHAR, '').substr(0, 256);
	this.filename = filename;
	// TODO: long filenames may exceed the line limit?
	this.yInfo = new Buffer(' total='+this.parts+' line='+line_size+' size='+size+' name='+filename+'\r\n=ypart begin=', ENCODING);
	
	this.maxPostSize = y.maxSize(articleSize, line_size)
		+ 75 /* size of fixed strings (incl final CRC) assuming ASCII or similar encoding */
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
		
		var crc = y.crc32(data);
		var fullCrc = ' pcrc32=' + crc.toString('hex');
		this.crc = y.crc32_combine(this.crc, crc, data.length);
		if(this.part == this.parts) {
			// final part treated slightly differently
			if(end != this.size)
				throw new Error('File size doesn\'t match total data length');
			fullCrc += ' crc32='+this.crc.toString('hex');
		}
		
		var _headers = {};
		for(var h in headers) {
			var v = headers[h];
			if(typeof v == 'function')
				v = v(this.filename, this.size, this.part, this.parts, data.length);
			
			_headers[h] = v;
		}
		
		var post = pool ? new PooledPost(this, pool) : new UnpooledPost(this);
		post._setHeaders(_headers);
		post._setData(data, this.part, this.pos, fullCrc);
		
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

MultiEncoder.fromBuffer = function(buf) {
	return new RawPost(buf);
};

// something that isn't as slow as crypto.pseudoRandomBytes
var randString = function() {
	return String.fromCharCode(
		65 + Math.random()*26,
		97 + Math.random()*26,
		65 + Math.random()*26,
		97 + Math.random()*26,
		65 + Math.random()*26,
		97 + Math.random()*26,
		65 + Math.random()*26,
		97 + Math.random()*26,
		65 + Math.random()*26,
		97 + Math.random()*26,
		65 + Math.random()*26,
		97 + Math.random()*26,
		65 + Math.random()*26,
		97 + Math.random()*26,
		65 + Math.random()*26,
		97 + Math.random()*26,
		65 + Math.random()*26,
		97 + Math.random()*26,
		65 + Math.random()*26,
		97 + Math.random()*26,
		65 + Math.random()*26,
		97 + Math.random()*26,
		65 + Math.random()*26,
		97 + Math.random()*26
	);
};
var messageIdSuffix = '@nyuu';

function Post(parent) {
	this.parent = parent;
	this.genTime = parent.timestamp ? parent.timestamp.getTime() : Date.now();
	this.messageId = randString() + '-' + this.genTime + messageIdSuffix;
}
Post.prototype = {
	genTime: null,
	headers: null,
	
	pos: null,
	part: null,
	crcFrag: null,
	data: null,
	postLen: null,
	postPos: 0,
	
	buf: null,
	keepMessageId: false,
	_msgIdOffset: 13, /* 'Message-ID: <'.length */
	
	_setData: function(data, part, pos, crcFrag) {
		this.part = part;
		this.pos = pos;
		this.crcFrag = crcFrag;
		this.inputLen = data.length;
	},
	
	randomizeMessageID: function() {
		var rnd = randString();
		this.data.write(rnd, this._msgIdOffset, ENCODING);
		return this.messageId = rnd + this.messageId.substr(24);
	},
	
	// strips a header from a materialized post
	// this is only used as a workaround for some servers rejecting posts but allowing them through if a header is removed
	stripHeader: function(str) {
		str = str.toLowerCase();
		if(!(str in this.headers)) return false;
		
		delete this.headers[str];
		// convert post's headers back to a string to find indexes to chop off
		var headers = this.buf.slice(0, this.postPos).toString(ENCODING).toLowerCase();
		var from = headers.indexOf('\r\n' + str + ':');
		var to = headers.indexOf('\r\n', from+2);
		
		if(from < 0 || to < 0 || from >= to) return false; // should never occur, but just in case...
		
		// account for character encodings
		to = Buffer.byteLength(headers.substr(from, to-from), ENCODING);
		from = Buffer.byteLength(headers.substr(0, from), ENCODING);
		to += from;
		
		// move data down in buffer
		this.buf.copy(this.buf, from, to);
		this.postPos -= to-from;
		this.data = this.buf.slice(0, this.postPos + this.postLen);
		
		return true;
	},
	
	release: function() {
		this.buf = null;
	}
};


function PooledPost(parent, pool) {
	Post.call(this, parent);
	this.pool = pool;
}
PooledPost.prototype = Object.create(Post.prototype);
PooledPost.prototype.pool = null;
PooledPost.prototype._headerStr = null;
PooledPost.prototype._setHeaders = function(headers) {
	this.headers = {};
	this.buf = this.pool.get();
	while(1) {
		this.postPos = this.buf.write('Message-ID: <' + this.messageId + '>\r\n', 0, ENCODING);
		for(var h in headers) {
			var v = headers[h];
			
			if(h.toLowerCase() == 'date' && !v)
				v = (this.parent.timestamp || (new Date(this.genTime))).toUTCString();
			
			this.headers[h.toLowerCase()] = v;
			this.postPos += this.buf.write(h + ': ' + v.replace(RE_BADCHAR, '') + '\r\n', this.postPos, ENCODING);
		}
		NEWLINE.copy(this.buf, this.postPos);
		this.postPos += NEWLINE.length;
		if(this.postPos >= this.buf.length) {
			// likely overflowed, try again
			this.buf = new Buffer(this.buf.length + Math.max(this.buf.length, BUFFER_ENLARGE_SPACE));
			this.postPos = 0;
			continue;
		}
		break;
	}
};
PooledPost.prototype._writeData = function(data) {
	var bufPos = this.postPos;
	bufPos += this.buf.write('=ybegin part='+this.part, bufPos, ENCODING);
	this.parent.yInfo.copy(this.buf, bufPos);
	bufPos += this.parent.yInfo.length;
	bufPos += this.buf.write(( this.pos+1 )+' end='+(this.pos + data.length)+'\r\n', bufPos, ENCODING);
	bufPos += y.encodeTo(data, this.buf.slice(bufPos), this.parent.line_size);
	bufPos += this.buf.write('\r\n=yend size='+data.length+' part='+this.part+this.crcFrag+'\r\n.\r\n', bufPos, ENCODING);
	
	this.data = this.buf.slice(0, bufPos);
	return bufPos - this.postPos;
};
PooledPost.prototype._setData = function(data, part, pos, crcFrag) {
	Post.prototype._setData.apply(this, arguments);
	
	var bufPos = this.postPos;
	var minSpace = bufPos + this.parent.maxPostSize;
	// ensure we have enough space
	if(this.buf.length < minSpace)
		this.buf = resizeBuffer(minSpace, this.buf, bufPos);
	// newly created buffers should be at least this size
	if(this.pool.size < minSpace)
		this.pool.size = minSpace + BUFFER_ENLARGE_SPACE;
	
	this.postLen = this._writeData(data);
};
PooledPost.prototype.release = function() {
	this.pool.put(this.buf);
	Post.prototype.release.call(this);
};
PooledPost.prototype.releaseData = function() {
	this._headerStr = this.buf.slice(0, this.postPos).toString(ENCODING);
	this.release();
};
PooledPost.prototype.reloadData = function(data) {
	if(this.inputLen != data.length)
		throw new Error('Supplied buffer is of incorrect length');
	this.buf = this.pool.get();
	if(this.postPos != this.buf.write(this._headerStr, 0, ENCODING))
		throw new Error('Header length mismatch encountered');
	if(this.postLen != this._writeData(data))
		throw new Error('Article length mismatch encountered');
	
	this._headerStr = null;
};

function UnpooledPost(parent) {
	Post.call(this, parent);
}
UnpooledPost.prototype = Object.create(Post.prototype);
UnpooledPost.prototype.bufs = null;
UnpooledPost.prototype._setHeaders = function(headers) {
	this.headers = {};
	this.bufs = [];
	var pushBuf = function(data) {
		var d = new Buffer(data + '\r\n', ENCODING);
		this.postPos += d.length;
		this.bufs.push(d);
	}.bind(this);
	pushBuf('Message-ID: <' + this.messageId + '>');
	for(var h in headers) {
		var v = headers[h];
		
		if(h.toLowerCase() == 'date' && !v)
			v = (this.parent.timestamp || (new Date(this.genTime))).toUTCString();
		
		this.headers[h.toLowerCase()] = v;
		pushBuf(h + ': ' + v.replace(RE_BADCHAR, ''));
	}
	this.bufs.push(NEWLINE);
	this.postPos += NEWLINE.length;
};
UnpooledPost.prototype._writeData = function(data) {
	this.bufs.push(
		new Buffer('=ybegin part='+this.part, ENCODING),
		this.parent.yInfo,
		new Buffer(( this.pos+1 )+' end='+(this.pos + data.length)+'\r\n', ENCODING),
		y.encode(data, this.parent.line_size),
		new Buffer('\r\n=yend size='+data.length+' part='+this.part+this.crcFrag+'\r\n.\r\n', ENCODING)
	);
	this.data = Buffer.concat(this.bufs);
	this.bufs = null;
	return this.data.length - this.postPos;
};
UnpooledPost.prototype._setData = function(data, part, pos, crcFrag) {
	Post.prototype._setData.apply(this, arguments);
	
	this.postLen = this._writeData(data);
};
UnpooledPost.prototype.releaseData = function() {
	this.bufs = [new Buffer(this.buf.slice(0, this.postPos))];
	this.release();
};
UnpooledPost.prototype.reloadData = function(data) {
	if(this.postLen != this._writeData(data))
		throw new Error('Article length mismatch encountered');
};


var bufferFind;
if(Buffer.prototype.indexOf)
	bufferFind = function(buf, search) {
		return buf.indexOf(search, ENCODING);
	};
else
	bufferFind = function(buf, search) {
		if(!Buffer.isBuffer(search))
			search = new Buffer(search, ENCODING);
		if(search.length == 0) return 0;
		if(search.length > buf.length) return -1;
		
		for(var i = 0; i < buf.length - search.length + 1; i++) {
			var match = true;
			for(var j = 0; j < search.length; j++) {
				if(buf[i+j] != search[j]) {
					match = false;
					break;
				}
			}
			if(match) return i;
		}
		return -1;
	};


var crypto;

// similar to Post, but constructed from a buffer
function RawPost(data) {
	this.headers = {};
	
	this.data = this.buf = data;
	this.postPos = bufferFind(data, '\r\n\r\n');
	if(this.postPos <= 0) throw new Error('Could not parse post');
	
	var hdr = data.slice(0, this.postPos).toString(ENCODING).split('\r\n');
	this.postPos += 4; // '\r\n\r\n'.length
	
	var self = this;
	var p = 0, msgIdLen;
	hdr.forEach(function(h) {
		var m = h.match(/^(.*?)\:(.*)$/);
		if(!m || !m[1])
			throw new Error('Invalid header line: "' + h + '"');
		var k = m[1].trim().toLowerCase(),
		    v = m[2].trim();
		self.headers[k] = v;
		if(k == 'message-id') {
			self._msgIdOffset = p + k.length + 1;
			msgIdLen = h.length - k.length - 1;
			if(m[2][0] == ' ') {
				msgIdLen--;
				self._msgIdOffset++;
			}
		}
		p += Buffer.byteLength(h, ENCODING) + 2;
	});
	
	var m;
	if(!this.headers['message-id'] || !(m = this.headers['message-id'].match(/^<(.*)>$/)))
		throw new Error('Post lacks a valid Message-ID header!');
	
	msgIdLen -= 2; // strip out angle brackets from the length
	if(msgIdLen < 1)
		throw new Error('Message-ID too short');
	
	this.messageId = m[1];
	if(msgIdLen < 16 + messageIdSuffix.length) {
		// rather short... make whole thing random
		this.randomizeMessageID = function() {
			self.messageId = (crypto || (crypto = require('crypto'))).pseudoRandomBytes(msgIdLen-2).toString('base64').substr(0, msgIdLen);
			self.data.write('<' + self.messageId + '>', self._msgIdOffset, ENCODING);
			return self.messageId;
		};
	} else {
		this.randomizeMessageID = function() {
			var id = '-' + self.genTime + messageIdSuffix;
			var targetLen = msgIdLen - id.length;
			for(var i=0; i<targetLen; i+=24)
				id = randString() + id;
			id = id.substr(id.length - msgIdLen);
			self.data.write('<' + id + '>', self._msgIdOffset, ENCODING);
			return self.messageId = id;
		};
	}
	
	if(this.headers.date)
		this.genTime = (new Date(this.headers.date)).getTime();
	else
		this.genTime = Date.now();
	
	// TODO: set post.inputLen?
	
	this.data = this.buf;
	this.postLen = data.length - this.postPos;
	this.keepMessageId = true;
}
RawPost.prototype = Object.create(Post.prototype);

module.exports = MultiEncoder;
