"use strict";

var y = require('yencode');
var ENCODING = 'utf8';

// TODO: should we switch to single encoding mode if only 1 part?
function MultiEncoder(filename, size, parts, line_size) {
	if(!line_size) line_size = 128;
	
	this.size = size;
	this.parts = parts;
	this.line_size = line_size;
	
	this.part = 0;
	this.pos = 0;
	this.crc = new Buffer([0,0,0,0]);
	
	filename = filename.replace(/[\r\n\0]/g, '').substr(0, 256);
	this.filename = filename;
	// TODO: long filenames may exceed the line limit?
	this.yInfo = new Buffer(' total='+parts+' line='+line_size+' size='+size+' name='+filename+'\r\n', ENCODING);
}
MultiEncoder.prototype = {
	generate: function(headers, data, target) {
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
		
		var headerData = [];
		var _headers = {};
		for(var h in headers) {
			var v = headers[h], hl = h.toLowerCase();
			if(typeof v == 'function')
				v = v(this.filename, this.size, this.part, this.parts, data.length);
			
			_headers[h.toLowerCase()] = v;
			var header = h + ': ' + v.replace(/[\r\n]/g, '');
			/* if(header.length > this.line_size) {
				// TODO: try to break the header up over multiple lines ?
			} */
			headerData.push(header);
		}
		
		var ret;
		if(target) {
			var bufPos = target.write('=ybegin part='+this.part, 0, ENCODING);
			this.yInfo.copy(target, bufPos);
			bufPos += this.yInfo.length;
			bufPos += target.write('=ypart begin='+( this.pos+1 )+' end='+end+'\r\n', bufPos, ENCODING);
			bufPos += y.encodeTo(data, target.slice(bufPos), this.line_size);
			bufPos += target.write('\r\n=yend size='+data.length+' part='+this.part+' pcrc32='+crc.toString('hex')+fullCrc+'\r\n.\r\n', bufPos, ENCODING);
			ret = target.slice(0, bufPos);
		} else {
			ret = Buffer.concat([
				new Buffer('=ybegin part='+this.part, ENCODING),
				this.yInfo,
				new Buffer('=ypart begin='+( this.pos+1 )+' end='+end+'\r\n', ENCODING),
				y.encode(data, this.line_size),
				new Buffer('\r\n=yend size='+data.length+' part='+this.part+' pcrc32='+crc.toString('hex')+fullCrc+'\r\n.\r\n', ENCODING)
			]);
		}
		
		this.pos = end;
		return {
			data: ret,
			headers: _headers,
			headerStr: headerData.join('\r\n'), // pre-encode this to save us doing so again later
			part: this.part
		};
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

module.exports = MultiEncoder;
