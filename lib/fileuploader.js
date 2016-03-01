"use strict";

var async = require('async');
var path = require('path');
var fs = require('fs');
var Uploader = require('./uploader');
var Reader = require('./reader');

exports.log = null;
exports.setLogger = function(log) {
	exports.log = log;
	Uploader.setLogger(log);
};

var recurseDir = function(dir, itemCb, cb) {
	fs.readdir(dir, function(err, files) {
		if(err) return cb(err);
		async.eachSeries(files, function(filename, cb) {
			var file = dir + path.sep + filename;
			fs.stat(file, function(err, stats) {
				if(err) return cb(err);
				
				if(stats.isDirectory()) {
					recurseDir(file, itemCb, cb);
				} else if(stats.isFile()) {
					itemCb(file, stats, cb);
				} else {
					cb(new Error('Unknown file type for file: ' + file));
				}
			});
		}, cb);
	});
};

exports.upload = function(files, opts, cb) {
	var up = new Uploader(opts);
	up.once('error', function(err) {
		throw err; // TODO: something better
	});
	up.start();
	var upFile = function(file, filename, size, cb) {
		var r = new Reader(fs.createReadStream(file, {autoClose: false, highWaterMark: opts.diskReqSize}), opts.diskBufferSize);
		if(exports.log) exports.log.info('Processing file ' + filename + '...');
		
		up.addFile(filename, size, r, function(err, info) {
			r.close();
			cb(err);
		});
	};
	// TODO: consider merging the following with recurseDir ?
	async.eachSeries(files, function(file, cb) {
		fs.stat(file, function(err, stats) {
			if(err) return cb(err);
			
			if(stats.isDirectory()) {
				switch(opts.subdirs) {
					case 'keep':
						// recurse thru subdirs
						recurseDir(file, function(file, stats, cb) {
							var fn = opts.subdirNameTransform(path.basename(file), path.dirname(file), file);
							upFile(file, fn, stats.size, cb);
						}, cb);
					break;
					case 'archive':
						// TODO:
					break;
					case 'skip':
						// skipped, do nothing...
				}
			}
			else if(stats.isFile()) {
				upFile(file, path.basename(file), stats.size, cb);
			} else {
				cb(new Error('Unknown file type for file: ' + file));
			}
		});
	}, function(err) {
		if(err) {
			// TODO: close input file streams
			up.cancel(function() {
				cb(err);
			});
		} else {
			up.finished(cb);
			if(exports.log) exports.log.info('All file(s) processed...');
		}
	});
};
