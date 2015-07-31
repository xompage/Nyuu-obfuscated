"use strict";

// simple NNTP emulation which just writes articles to disk

var fs = require('fs');

function DiskNNTP(opts) {
	this.path = opts.path + '/';
}

DiskNNTP.prototype = {
	connect: process.nextTick.bind(process),
	end: function() {},
	post: function(post, cb) {
		fs.writeFile(this.path + post.messageId, post.data, cb);
	}
};

module.exports = DiskNNTP;
