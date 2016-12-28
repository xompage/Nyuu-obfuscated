"use strict";

// for handling object keys case-insensitively
exports.getNCaseKey = function(obj, key) {
	key = exports.getNCaseKeyIndex(obj, key);
	if(key) return obj[key];
};
exports.getNCaseKeyIndex = function(obj, key) {
	key = key.toLowerCase();
	for(var k in obj) {
		if(k.toLowerCase() === key)
			return k;
	}
};
exports.setNCaseKey = function(obj, key, val) {
	key = key.toLowerCase();
	for(var k in obj) {
		if(k.toLowerCase() === key)
			obj[k] = val;
	}
};

// shallow clone
exports.clone = function(obj) {
	var cloned = {};
	for(var k in obj)
		cloned[k] = obj[k];
	return cloned;
};

exports.deepMerge = function(dest, src) {
	for(var k in src) {
		if((k in dest) && typeof dest[k] == 'object' && !Array.isArray(dest[k]) && dest[k] !== null) {
			exports.deepMerge(dest[k], src[k]);
		} else {
			dest[k] = src[k];
		}
	}
};

exports.optSel = function(a, b) {
	return (a !== undefined && a !== null) ? a : b;
};

var fs, async, path;
exports.recurseDir = function(dir, itemCb, cb) {
	fs = fs || require('fs');
	async = async || require('async');
	path = path || require('path');
	
	fs.readdir(dir, function(err, files) {
		if(err) return cb(err);
		async.eachSeries(files, function(filename, cb) {
			var file = dir + path.sep + filename;
			fs.stat(file, function(err, stats) {
				if(err) return cb(err);
				
				if(stats.isDirectory()) {
					exports.recurseDir(file, itemCb, cb);
				} else if(stats.isFile()) {
					itemCb(file, stats, cb);
				} else {
					cb(new Error('Unknown file type for file: ' + file));
				}
			});
		}, cb);
	});
};

