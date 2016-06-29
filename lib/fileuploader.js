"use strict";

var async = require('async');
var path = require('path');
var fs = require('fs');
var Uploader = require('./uploadmgr');
var StreamReader, FileReader;
var EventEmitter = require('events').EventEmitter;
var Nyutil;

exports.log = null;
exports.setLogger = function(log) {
	exports.log = log;
	Uploader.setLogger(log);
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
							(Nyutil || (Nyutil = require('./util'))).recurseDir(file, function(file, stats, cb) {
								if(!stats.size && exports.log) {
									exports.log.warn('Skipping empty file: ' + file);
									return cb();
								}
								// TODO: consider making the basename relative to root specified folder
								var nam = opts.subdirNameTransform(path.basename(file), path.dirname(file), file);
								if(nam || nam === '')
									files[file] = {size: stats.size, name: nam, stat: stats};
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
							if(exports.log) exports.log.warn('Skipping directory: ' + file);
					}
				}
				else if(stats.isFile()) {
					if(stats.size)
						files[file] = {size: stats.size, name: path.basename(file), stat: stats};
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
			var re_group_fname = /(\.[a-z0-9]{1,10}){0,2}(\.vol\d+[\-+]\d+\.par2)?(\.\d+|\.part\d+)?$/i;
			filenames.forEach(function(filename) {
				var file = files[filename];
				var col = file.name.replace(re_group_fname, '');
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
		
		// if copying input, prepare for it
		var StreamWriter, copyBufPool, StreamTee;
		if(opts.inputCopy) {
			StreamWriter = require('./streamwriter');
			// TODO: do we wish to make the use of BufferPool optional?
			copyBufPool = new (require('./bufferpool'))(opts.diskReqSize || opts.articleSize, 0);
			StreamTee = require('./streamtee');
		}
		
		var up = new Uploader(opts, cb);
		ee.emit('start', files, up);
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
				if(!file.stream) {
					reader = new (FileReader || (FileReader = require('./filereader')))(filename, opts.diskReqSize || opts.articleSize, opts.diskBufferSize);
				} else {
					var stream = file.stream;
					if(typeof stream == 'function') { // to support deferred loading
						stream = stream();
					}
					if((typeof stream != 'object') || !stream.readable)
						return cb(new Error('Cannot read from file ' + file.name));
					
					reader = new (StreamReader || (StreamReader = require('./streamreader')))(stream, opts.diskBufferSize);
				}
				ee.emit('processing_file', file);
				
				// if input copying is enabled, tee the stream out here
				if(opts.inputCopy) {
					var copy = opts.inputCopy;
					if(typeof opts.inputCopy == 'function') {
						copy = opts.inputCopy(file.name, file.size);
					}
					
					if(copy) {
						if(!copy.writable) throw new Error('Supplied copy stream is not writable');
						reader = new StreamTee(reader, [new StreamWriter(copy, opts.copyQueueBuffer, file.stream ? null : copyBufPool)]);
					}
				}
				
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
				up.finished();
				ee.emit('read_complete');
			}
		});
		
	});
	return ee;
};
