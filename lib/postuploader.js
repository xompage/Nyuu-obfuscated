"use strict";

var async = require('async');
var path = require('path');
var fs = require('fs');
var Uploader = require('./uploader');
var Article = require('./article');
var EventEmitter = require('events').EventEmitter;

exports.log = null;
exports.setLogger = function(log) {
	exports.log = log;
	Uploader.setLogger(log);
};

// TODO: buffer pool arrangement
// TODO: consider cancel/finished functions?

exports.upload = function(_files, opts, cb) {
	var files = {};
	var ee = new EventEmitter();
	
	async.eachSeries(_files, function(file, cb) {
		if(typeof file == 'string') {
			fs.stat(file, function(err, stats) {
				if(err) return cb(err);
				
				if(stats.isDirectory()) {
					// TODO: handle directory?
				}
				else if(stats.isFile()) {
					if(stats.size)
						files[file] = {name: path.basename(file), size: stats.size, stat: stats};
					else
						exports.log.warn('Skipping empty file: ' + file);
				}
				else {
					return cb(new Error('Unknown file type for file: ' + file));
				}
				cb();
			});
		}
		// TODO: add support for streams etc?
		else
			cb(new Error('Invalid file specification ' + file));
	}, function(err) {
		if(err) return cb(err);
		
		var up = this.uploader = new Uploader(opts, cb);
		ee.emit('start', files, this);
		async.eachSeries(Object.keys(files), function(filename, cb) {
			fs.readFile(filename, function(err, data) {
				if(err || !data.length) {
					return cb(err || new Error('Data could not be read from ' + filename));
				}
				
				var post;
				try {
					post = Article.fromBuffer(data);
				} catch(x) {
					return cb(x);
				}
				// TODO: allow messageId to be randomized?
				
				post.inputLen = data.length; // override this because our 'total size' measurement works differently
				up.addPost(post, cb, post.release.bind(post));
			});
			
		}, function(err) {
			if(err) {
				up.cancel(function() {
					cb(err); // TODO: is this line required?
				});
			} else {
				// TODO: drain buffer pool, if we have one
				up.finished();
				ee.emit('read_complete');
			}
		});
		
	});
	return ee;
};
