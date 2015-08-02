"use strict";

var async = require('async');
var path = require('path');
var fs = require('fs');
var reader = require('binary-reader'), readerOpts = {highWaterMark: 1048576}; // 1MB buffer
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

exports.run = function(files, _opts, runDone) {
	var defaultOpts = require('./config');
	var opts = {};
	for(var i in defaultOpts)
		if(i in _opts)
			opts[i] = _opts[i];
		else
			opts[i] = defaultOpts[i];
	
	// TODO: need to do a clone + somehow set subject even though case can be bad
	if(!opts.postHeaders.Subject)
		opts.postHeaders.Subject = subject_func.bind(null, opts.comment, opts.comment2);
	
	var queue = new Queue(opts.articleQueueBuffer);
	var nzbFiles = [];
	
	async.parallel([
		// reading process
		async.eachSeries.bind(async, files, function procFile(file, cb) {
			fs.stat(file, function(err, stats) {
				if(err) return cb(err);
				
				var fnBase = path.basename(file);
				
				if(stats.isDirectory()) {
					// TODO: handle directories
				}
				else if(stats.isFile()) {
					var r = reader.open(file, readerOpts);
					exports.log.info('Processing file %s...', file);
					
					var enc = new ArticleEncoder(fnBase, stats.size, Math.ceil(stats.size / opts.articleSize), opts.bytesPerLine);
					var articles = [];
					async.until(r.isEOF.bind(r), function(cb) {
						r.read(opts.articleSize, function(size, buffer) {
							if(!size) return cb(); // EOF
							var article = enc.generate(opts.postHeaders, buffer);
							articles.push([article.data.length, article.messageId]);
							queue.add(article, cb);
						});
					}, function(err) {
						r.close();
						nzbFiles.push({
							filename: fnBase,
							size: stats.size,
							articles: articles,
							crc32: enc.crc32
						});
						cb(err);
					});
				} else {
					cb(new Error('Unknown file type for file: ' + file));
				}
			});
		}),
		
		// uploading connections
		async.times.bind(async, opts.connections, function(i, cb) {
			var c = new NNTP(opts.server);
			c.connect(function doPost(err) {
				if(err) {
					// TODO: retries?
					// TODO: need to handle conditions like max connections reached etc
					c.end();
					return cb(err);
				}
				queue.take(function(post) {
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
		}),
		
		function(cb) {
			// TODO: header checking connection
			cb(null);
		}
	], function(err) {
		// ul process done, TODO: generate NZB
		
		runDone(err);
	});
};
