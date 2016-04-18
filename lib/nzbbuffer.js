"use strict";

// wrapper around NZBGenerator which allows out of order NZB generation
// TODO: consider an 'active' file mode, so that, in most circumstances, creation is streamed?
var NZBGenerator = require('./nzb');

function NZBBuffered(meta, writeFunc, packed, encoding) {
	this.nzb = new NZBGenerator(meta, writeFunc, packed, encoding);
}
NZBBuffered.prototype = {
	unfinished: 0, // number of unfinished files - only used for verification purposes
	file: function(subject, poster, groups, numSegments, date) {
		this.unfinished++;
		return new NZBFile(this, subject, poster, groups, numSegments, date);
	},
	end: function() {
		if(this.unfinished > 0)
			throw new Error('Unfinished files exist');
		this.nzb.end();
	}
};

function NZBFile(parent, subject, poster, groups, numSegments, date) {
	this.parent = parent;
	this.subject = subject;
	this.poster = poster;
	this.groups = groups;
	this.date = date;
	
	this.segments = Array(numSegments);
	this.segCount = 0;
}
NZBFile.prototype = {
	// if messageId is invalid, will skip writing the segment
	set: function(idx, size, messageId) {
		if(!this.segments) throw new Error('Already finished');
		
		var numSeg = this.segments.length;
		if(idx >= numSeg || idx < 0) throw new Error('Invalid segment index supplied');
		
		if(!this.segments[idx]) this.segCount++;
		this.segments[idx] = messageId ? [size, messageId] : null;
		
		if(this.segCount == numSeg) {
			// have all segments, write it out
			var nzb = this.parent.nzb;
			nzb.file(this.subject, this.poster, this.groups, numSeg, this.date);
			this.segments.forEach(function(seg) {
				if(seg)
					nzb.addSegment.apply(nzb, seg);
			});
			this.segments = null;
			this.parent.unfinished--;
		}
	},
	// skip writing a segment
	skip: function(idx) {
		this.set(idx, 0, null);
	}
};

module.exports = NZBBuffered;
