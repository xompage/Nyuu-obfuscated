"use strict";

var async = require('async');
var path = require('path');
var fs = require('fs');
var Uploader = require('./uploader');
var StreamReader = require('./streamreader');
var FileReader = require('./filereader');
var EventEmitter = require('events').EventEmitter;

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
					if(stats.size)
						itemCb(file, stats, cb);
					else if(exports.log) {
						exports.log.warn('Skipping empty file: ' + file);
						cb();
					}
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
	var ee = new EventEmitter();
	
	// TODO: consider merging the following with recurseDir ?
	async.eachSeries(_files, function(file, cb) {
		if(typeof file == 'string') {
			fs.stat(file, function(err, stats) {
				if(err) return cb(err);
				
				if(stats.isDirectory()) {
					switch(opts.subdirs) {
						case 'keep':
							// recurse thru subdirs
							recurseDir(file, function(file, stats, cb) {
								// TODO: consider making the basename relative to root specified folder
								files[file] = {size: stats.size, name: opts.subdirNameTransform(path.basename(file), path.dirname(file), file)};
								cb();
							}, cb);
							return;
						break;
						case 'archive':
							files[file] = {archive: true, name: path.basename(file) + '.7z'}; // mark as archive dir
						break;
						case 'archiveAll':
							archiveAll.push(file);
						break;
						case 'skip':
							// skipped, do nothing...
					}
				}
				else if(stats.isFile()) {
					if(stats.size)
						files[file] = {size: stats.size, name: path.basename(file)};
					else if(exports.log)
						exports.log.warn('Skipping empty file: ' + file);
				} else {
					return cb(new Error('Unknown file type for file: ' + file));
				}
				cb();
			});
		} else if(typeof file == 'object') {
			// TODO: consider archiving from streams??
			
			var a = ['size', 'name'];
			for(var key in a) {
				if(!file[a[key]])
					return cb(new Error('File '+a[key]+' not specified for file ' + file));
			}
			if(file.stream)
				files['\0_stream_' + file.name] = file;
			else if(file.filename)
				files[file.filename] = file;
			else
				return cb(new Error('Invalid file specification ' + file));
			cb();
		} else {
			return cb(new Error('Invalid file specification ' + file));
		}
	}, function(err) {
		if(err) return cb(err);
		
		if(archiveAll.length) {
			files['\0_archive'] = {archive: true, name: 'all.7z'}; // TODO: need to make this much better
		}
		
		var filenames = Object.keys(files);
		if(!filenames.length)
			return cb(new Error('No files to process'));
		
		// sort files into collections
		var fileColCount = {};
		// TODO: consider re-ordering ability
		if(opts.groupFiles) {
			// group by base filename
			filenames.forEach(function(filename) {
				var file = files[filename];
				var col = file.name.replace(/(\.[a-z0-9]{1,10}){0,2}(\.vol\d+[\-+]\d+\.par2)?(\.\d+|\.part\d+)?$/i, '');
				file.collection = col;
				if(col in fileColCount)
					fileColCount[col]++;
				else
					fileColCount[col] = 1;
				file.num = fileColCount[col];
			});
		} else {
			// one collection
			fileColCount._ = filenames.length;
			var counter = 1;
			filenames.forEach(function(filename) {
				files[filename].collection = '_';
				files[filename].num = counter++;
			});
		}
		
		var up = new Uploader(opts);
		up.once('error', ee.emit.bind(ee, 'error'));
		ee.emit('start', files, up);
		up.start();
		async.eachSeries(filenames, function(filename, cb) {
			var file = files[filename];
			if(file.archive) {
				// creating an archive of directory
				if(archiveAll.length) {
					// TODO: all dirs into one archive
				} else {
					// TODO:
					
				}
			} else {
				var reader;
				var bufSize = opts.diskBufferSize;
				if(!bufSize && bufSize !== 0) bufSize = opts.diskReqSize || opts.articleSize;
				if(!file.stream) {
					reader = new FileReader(filename, opts.diskReqSize || opts.articleSize, bufSize);
				} else {
					var stream = file.stream;
					if(typeof stream == 'function') { // to support deferred loading
						stream = stream();
					}
					if((typeof stream != 'object') || !stream.readable)
						return cb(new Error('Cannot read from file ' + file.name));
					
					reader = new StreamReader(stream, bufSize);
				}
				ee.emit('processing_file', file);
				
				up.addFile(file.name, file.size, file.num, fileColCount[file.collection], file.headers || opts.postHeaders, reader, function(err, info) {
					if(err) return cb(err);
					reader.close();
					cb(err);
				});
			}
		}, function(err) {
			if(err) {
				// TODO: close input file streams
				up.cancel(function() {
					cb(err);
				});
			} else {
				up.finished(cb);
				ee.emit('read_complete');
			}
		});
		
	});
	return ee;
};
