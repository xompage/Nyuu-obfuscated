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
	this.yInfo = new Buffer(' total='+parts+' line='+line_size+' size='+size+' name='+filename+'\r\n', ENCODING);
}
MultiEncoder.prototype = {
	generate: function(headers, data) {
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
		
		var subject;
		var headerData = [];
		for(var h in headers) {
			var v = headers[h], hl = h.toLowerCase();
			if(typeof v == 'function')
				v = v(this.filename, this.size, this.part, this.parts, data.length);
			
			// hack for inserting part # in subject line
			if(hl == 'subject') {
				subject = v;
			}
			
			var header = h + ': ' + v.replace(/[\r\n]/g, '');
			/* if(header.length > this.line_size) {
				// TODO: try to break the header up over multiple lines ?
			} */
			headerData.push(header);
		}
		
		var ret = Buffer.concat([
			new Buffer('=ybegin part='+this.part, ENCODING),
			this.yInfo,
			new Buffer('=ypart begin='+( this.pos+1 )+' end='+end+'\r\n', ENCODING),
			y.encode(data, this.line_size),
			new Buffer('\r\n=yend size='+data.length+' part='+this.part+' pcrc32='+crc.toString('hex')+fullCrc+'\r\n.\r\n', ENCODING)
		]);
		
		this.pos = end;
		return {
			data: ret,
			headers: headerData,
			subject: subject,
			part: this.part
		};
	}
};

module.exports = MultiEncoder;
