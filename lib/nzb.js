"use strict";

var ENCODING = 'utf8';

var xmlEscape = function(v) {
	// TODO: handle unicode chars?
	return v.replace(/[<>&"]/g, function(m) {
		switch(m[0]) {
			case '<': return '&lt;';
			case '>': return '&gt;';
			case '&': return '&amp;';
			case '"': return '&quot;';
		}
	});
};

var objIsEmpty = function(o) {
	for(var k in o) return false;
	return true;
};

function NZBGenerator(poster, groups, meta, writeFunc, packed) {
	var newline = '\r\n', indent = '\t';
	if(packed)
		newline = indent = '';
	
	this._write = writeFunc;
	
	this.write('<?xml version="1.0" encoding="' + ENCODING + '"?>\r\n'
		+ '<!DOCTYPE nzb PUBLIC "-//newzBin//DTD NZB 1.1//EN" "http://www.newzbin.com/DTD/nzb/nzb-1.1.dtd">\r\n'
		+ '<nzb xmlns="http://www.newzbin.com/DTD/2003/nzb">' + newline);
	
	if(!objIsEmpty(meta)) {
		this.write(indent + '<head>' + newline);
		for(var k in meta) {
			this.write(indent + indent + '<meta type="' + xmlEscape(k) + '">' + xmlEscape(meta[k]) + '</meta>' + newline);
		}
		this.write(indent + '</head>' + newline);
	}
	
	// pre-generate groups, since we don't differentiate across files
	this.groups = indent + indent + '<groups>' + newline
		+ groups.map(function(g) {
			return indent+indent+indent + '<group>' + xmlEscape(g) + '</group>' + newline;
		}).join('')
		+ indent + indent + '</groups>' + newline;
	
	this.poster = xmlEscape(poster);
	
	this.indent = indent;
	this.newline = newline;
	this.segNum = null;
}
NZBGenerator.prototype = {
	_closeFile: function() {
		if(this.segNum !== null) {
			this.write(this.indent + this.indent + '</segments>' + this.newline
				+ this.indent + '</file>' + this.newline);
		}
	},
	file: function(subject, numSegments, date) {
		this._closeFile();
		date = date ? date.getTime() : Date.now();
		this.write(this.indent + '<file poster="' + this.poster + '" date="' + ((date/1000)|0) + '" subject="' + xmlEscape(subject) + ' (1/' + numSegments + ')">' + this.newline + this.groups
			+ this.indent + this.indent + '<segments>' + this.newline);
		this.segNum = 0;
	},
	addSegment: function(messageId, size) {
		this.segNum++;
		this.write(this.indent+this.indent+this.indent + '<segment bytes="'+size+'" number="'+this.segNum+'">' + xmlEscape(messageId) + '</segment>' + this.newline);
	},
	end: function() {
		this._closeFile();
		this.write('</nzb>');
	},
	write: function(str) {
		this._write(new Buffer(str, ENCODING));
	}
};

module.exports = NZBGenerator;
