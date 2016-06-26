"use strict";

var async = require('async');
var path = require('path');
var fs = require('fs');
var Uploader = require('./uploader');
var Article = require('./article');
var EventEmitter = require('events').EventEmitter;
var BufferPool;

exports.log = null;
exports.setLogger = function(log) {
	exports.log = log;
	Uploader.setLogger(log);
};

exports.upload = function(_files, opts, cb) {
	var files = {}, maxSize = 0;
	var ee = new EventEmitter();
	
	async.eachSeries(_files, function(file, cb) {
		if(typeof file == 'string') {
			fs.stat(file, function(err, stats) {
				if(err) return cb(err);
				
				if(stats.isDirectory()) {
					// TODO: handle directory?
				}
				else if(stats.isFile()) {
					if(stats.size) {
						files[file] = {name: path.basename(file), size: stats.size, stat: stats};
						maxSize = Math.max(maxSize, stats.size);
					} else
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
		
		var pool, readFn;
		if(opts.useBufferPool !== false) {
			// TODO: set max pool size etc
			var maxPoolSize = 100;
			pool = new (BufferPool || (BufferPool = require('./bufferpool')))(maxSize, maxPoolSize);
			readFn = function(filename, cb) {
				fs.open(filename, 'r', function(err, fd) {
					if(err) return cb(err);
					
					var buf = pool.get();
					fs.read(fd, buf, 0, buf.length, 0, function(err, sz) {
						if(err) return cb(err);
						fs.close(fd, function(err) {
							cb(err, buf, sz);
						});
					});
				});
			};
		} else {
			readFn = fs.readFile.bind(fs);
		}
		
		var up = this.uploader = new Uploader(opts, cb);
		ee.emit('start', files, this);
		async.eachSeries(Object.keys(files), function(filename, cb) {
			readFn(filename, function(err, data, sz) {
				if(err || !data.length) {
					return cb(err || new Error('Data could not be read from ' + filename));
				}
				
				var post;
				try {
					if(pool)
						post = Article.fromBuffer(data.slice(0, sz));
					else
						post = Article.fromBuffer(data);
				} catch(x) {
					return cb(x);
				}
				// TODO: allow messageId to be randomized?
				
				// override post.inputLen because our 'total size' measurement works differently
				if(pool) {
					post.inputLen = sz;
					// tie pool to post
					post.buf = data;
					post.pool = pool;
				} else {
					post.inputLen = data.length;
				}
				up.addPost(post, cb, post.release.bind(post));
			});
			
		}, function(err) {
			if(err) {
				up.cancel(function() {
					cb(err); // TODO: is this line required?
				});
			} else {
				if(pool) pool.drain();
				up.finished();
				ee.emit('read_complete');
			}
		});
		
	});
	return ee;
};
