"use strict";

// simple NNTP emulation which just writes articles to disk

var fs = require('fs');

function DiskNNTP(opts) {
	this.path = opts.path + '/';
}

var crypto = require('crypto');

DiskNNTP.prototype = {
	connect: process.nextTick.bind(process),
	end: function() {},
	post: function(post, cb) {
		var messageId = crypto.pseudoRandomBytes(24).toString('hex') + '@nyuu';
		fs.writeFile(this.path + messageId, post, function(err) {
			cb(err, messageId);
		});
	}
};

module.exports = DiskNNTP;
