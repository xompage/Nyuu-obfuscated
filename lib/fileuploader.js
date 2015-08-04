"use strict";

var async = require('async');
var path = require('path');
var fs = require('fs');
var Uploader = require('./uploader');
var Reader = require('./reader');

exports.log = null; // TO OVERRIDE

exports.upload = function(files, opts, cb) {
	var nzbFiles = [];
	var up = new Uploader(opts);
	up.start();
	// TODO: up.on('error', ... 
	async.eachSeries(files, function procFile(file, cb) {
		fs.stat(file, function(err, stats) {
			if(err) return cb(err);
			
			var fnBase = path.basename(file);
			
			if(stats.isDirectory()) {
				// TODO: handle directories
			}
			else if(stats.isFile()) {
				var r = new Reader(fs.createReadStream(file, {autoClose: false, highWaterMark: opts.diskReqSize}), opts.diskBufferSize);
				exports.log.info('Processing file %s...', file);
				
				up.addFile(fnBase, stats.size, r, function(err, info) {
					r.close();
					nzbFiles.push({
						filename: fnBase,
						size: stats.size,
						articles: info.sizes,
						crc32: info.crc32
					});
					cb(err);
				});
			} else {
				cb(new Error('Unknown file type for file: ' + file));
			}
		});
	}, function(err) {
		if(err) {
			// TODO: cancel upload and all that
			cb(err);
		} else {
			up.finished(cb);
		}
	});
};
