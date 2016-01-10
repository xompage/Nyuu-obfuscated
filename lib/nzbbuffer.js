"use strict";

// wrapper around NZBGenerator which allows out of order NZB generation
var NZBGenerator = require('./nzb');

function NZBBuffered(poster, groups, meta, writeFunc, packed, encoding) {
	this.nzb = new NZBGenerator(poster, groups, meta, writeFunc, packed, encoding);
}
NZBBuffered.prototype = {
	unfinished: 0, // number of unfinished files - only used for verification purposes
	file: function(subject, numSegments, date) {
		this.unfinished++;
		return new NZBFile(this, subject, numSegments, date);
	},
	end: function() {
		if(this.unfinished > 0)
			throw new Error('Unfinished files exist');
		this.nzb.end();
	}
};

function NZBFile(parent, subject, numSegments, date) {
	this.parent = parent;
	this.subject = subject;
	this.date = date;
	
	this.segments = Array(numSegments);
	this.segCount = 0;
}
NZBFile.prototype = {
	set: function(idx, size, messageId) {
		if(!this.segments) return; // TODO: should we throw an error?
		
		var numSeg = this.segments.length;
		if(idx >= numSeg || idx < 0) throw new Error('Invalid segment index supplied');
		
		if(!this.segments[idx]) this.segCount++;
		this.segments[idx] = [size, messageId];
		
		if(this.segCount == numSeg) {
			// have all segments, write it out
			var nzb = this.parent.nzb;
			nzb.file(this.subject, numSeg, this.date);
			this.segments.forEach(function(seg) {
				nzb.addSegment.apply(nzb, seg);
			});
			this.segments = null;
			this.parent.unfinished--;
		}
	}
};

module.exports = NZBBuffered;
