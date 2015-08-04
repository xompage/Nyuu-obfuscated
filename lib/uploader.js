"use strict";

var async = require('async');
var EventEmitter = require('events').EventEmitter;
var Queue = require('./queue');
var NNTP = require('./fakenntp');
var ArticleEncoder = require('./article');

// TODO: make this configurable
var subject_func = function(comment, comment2, filename, part, parts, size) {
	var ret = '';
	if(comment) ret = comment + ' ';
	// TODO: should we revert to single part titles if only 1 part?
	return ret + '"' + filename.replace(/"/g, '') + '" yEnc (' + part + '/' + parts + ') ' + size + (comment2 ? ' ' + comment2 : '');
};

function Uploader(_opts) {
	var defaultOpts = require('../config');
	var opts = {};
	for(var i in defaultOpts)
		if(i in _opts)
			opts[i] = _opts[i];
		else
			opts[i] = defaultOpts[i];
	
	// TODO: need to do a clone + somehow set subject even though case can be bad
	if(!opts.postHeaders.Subject)
		opts.postHeaders.Subject = subject_func.bind(null, opts.comment, opts.comment2);
	
	this.opts = opts;
	this.queue = new Queue(opts.articleQueueBuffer);
	
	this._ee = new EventEmitter();
	['on','once','removeListener','emit'].forEach(function(f) {
		this[f] = this._ee[f].bind(this._ee);
	}.bind(this));
}
Uploader.prototype = {
	addFile: function(fileName, fileSize, stream, fileDone) {
		var enc = new ArticleEncoder(fileName, fileSize, Math.ceil(fileSize / this.opts.articleSize), this.opts.bytesPerLine);
		var sizes = [];
		var self = this;
		async.until(function(){return stream.EOF;}, function(cb) {
			stream.read(self.opts.articleSize, function(size, buffer) {
				if(!size) return cb(); // EOF
				var article = enc.generate(self.opts.postHeaders, buffer);
				sizes.push(article.data.length);
				self.queue.add(article, cb);
			});
		}, function(err) {
			fileDone(err, {
				sizes: sizes,
				crc32: enc.crc32
			});
		});
	},
	start: function() {
		var self = this;
		async.times(this.opts.connections, function(i, cb) {
			var c = new NNTP(self.opts.server);
			c.connect(function doPost(err) {
				if(err) {
					// TODO: retries?
					// TODO: need to handle conditions like max connections reached etc
					c.end();
					return cb(err);
				}
				self.queue.take(function(post) {
					if(!post) {
						// TODO: no more data, close down
						c.end();
						return cb();
					}
					c.post(post.data, function(err, messageId) {
						if(!err) {
							// TODO: add message-id
						}
						doPost(err);
					});
				});
			});
		}, this._uploadDone.bind(this));
		
		// TODO: header checking connection
	},
	finished: function(cb) {
		this._done = cb;
		this.queue.finished();
	},
	
	_uploadDone: function(err) {
		// TODO: need to check whether header checks have completed
		
		this._done();
	},
	_done: function() { /*do nothing?*/ }
};

module.exports = Uploader;
