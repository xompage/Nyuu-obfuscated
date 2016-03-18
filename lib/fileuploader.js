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

exports.upload = function(_files, opts, cb) {
	var files = {};
	var archiveAll = [];
	// TODO: consider merging the following with recurseDir ?
	async.eachSeries(_files, function(file, cb) {
		fs.stat(file, function(err, stats) {
			if(err) return cb(err);
			
			if(stats.isDirectory()) {
				switch(opts.subdirs) {
					case 'keep':
						// recurse thru subdirs
						recurseDir(file, function(file, stats, cb) {
							files[file] = {size: stats.size, inDir: true};
							cb();
						}, cb);
						return;
					break;
					case 'archive':
						files[file] = null; // mark as archive dir
					break;
					case 'archiveAll':
						archiveAll.push(file);
					break;
					case 'skip':
						// skipped, do nothing...
				}
			}
			else if(stats.isFile()) {
				files[file] = {size: stats.size, inDir: false};
			} else {
				return cb(new Error('Unknown file type for file: ' + file));
			}
			cb();
		});
	}, function(err) {
		if(err) return cb(err);
		
		if(archiveAll.length) {
			files['all.7z'] = null; // TODO: need to make this much better
		}
		
		var filenames = Object.keys(files);
		var up = new Uploader(filenames.length, opts);
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
		async.eachSeries(filenames, function(filename, cb) {
			var file = files[filename];
			if(file) {
				if(file.inDir) {
					// TODO: consider making the basename relative to root specified folder
					upFile(
						filename,
						opts.subdirNameTransform(path.basename(filename), path.dirname(filename), filename),
						file.size,
						cb
					);
				} else {
					upFile(filename, path.basename(filename), file.size, cb);
				}
			} else {
				// creating an archive of directory
				if(archiveAll.length) {
					// TODO: all dirs into one archive
				} else {
					// TODO:
					
				}
			}
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
		
	});
};
