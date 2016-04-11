"use strict";

var assert = require("assert");
var tl = require('./_testlib');
var FileUploader = require('../lib/fileuploader');
var NNTPServer = require('./_nntpsrv');

var lastServerPort = 0;
var clientOpts = function(opts) {
	var o = require('../config');
	var deepMerge = require('../lib/util').deepMerge;
	deepMerge(o, {
		server: {
			connect: {
				host: '127.0.0.1',
				port: lastServerPort,
			},
			secure: false, // set to 'true' to use SSL
			user: 'joe',
			password: 'blogs',
			timeout: 100,
			connTimeout: 100,
			reconnectDelay: 50,
			connectRetries: 1,
			requestRetries: 1,
			postRetries: 1,
			connections: 1
		},
		check: {
			server: {},
			delay: 10,
			recheckDelay: 10,
			tries: 0,
			ulConnReuse: false,
			postRetries: 1,
			ignoreFailure: false,
			maxBuffer: 50,
		},
		articleSize: 768000,
		subdirs: 'keep',
		subdirNameTransform: function(fileName, pathName, fullPath) { return fileName; },
		postHeaders: {
			Subject: null, // will be overwritten if set to null
			From: 'Nyuumaster <nyuu@animetosho.org>',
			Newsgroups: 'rifles', // comma seperated list
			Date: (new Date()).toISOString(),
			Path: '',
			'User-Agent': 'Nyuu',
			//'Message-ID': function() { return require('crypto').pseudoRandomBytes(24).toString('hex') + '@nyuu'; }
		},
		nzb: {
			writeTo: 'output.nzb', // TODO: filename, output stream (eg stdout) etc
			writeOpts: {
				//mode: 0666,
				encoding: 'utf8',
			},
			minify: false,
			compression: '', // TODO: gzip etc
			metaData: {
				client: 'Nyuu',
			},
		},
	});
	
	deepMerge(o.check.server, o.server);
	o.check.server.connections = 0;
	deepMerge(o, opts);
	return o;
};

var testSkel = function(files, opts, cb) {
	var server = new NNTPServer({});
	server.listen(0, function() {
		lastServerPort = server.address().port;
		FileUploader.upload(files, clientOpts(opts), cb);
	});
	return server;
};
var doTest = function(files, opts, cb) {
	var server = testSkel(files, opts, function(err) {
		if(err) return cb(err);
		server.close(function() {
			cb(null, server);
		});
	});
};

describe('Nyuu', function() {

it('basic test', function(done) {
	doTest(['index.js'], {
		server: {
			connections: 1
		},
		check: {
			delay: 10,
			recheckDelay: 10,
			tries: 0,
		}
	}, function(err, server) {
		if(err) return done(err);
		assert.equal(Object.keys(server.posts.rifles).length, 1);
		assert.equal(Object.keys(server.postIdMap).length, 1);
		done(err);
	});
});

it('complex test', function(done) {
	doTest(['lib/', 'index.js'], {
		server: {
			connections: 3
		},
		check: {
			server: {
				connections: 1
			},
			delay: 10,
			recheckDelay: 10,
			tries: 1,
		},
		articleSize: 4096
	}, function(err, server) {
		if(err) return done(err);
		// TODO: better checks
		var numFiles = require('fs').readdirSync('lib/').length +1;
		assert(Object.keys(server.posts.rifles).length >= numFiles);
		assert(Object.keys(server.postIdMap).length >= numFiles);
		done(err);
	});
});

it('should retry check if first attempt doesn\'t find it', function(done) {
	var files = ['index.js'];
	var opts = {
		server: {
			connections: 1
		},
		check: {
			server: {
				connections: 1
			},
			delay: 10,
			recheckDelay: 500,
			tries: 2,
		}
	};
	
	var s = Date.now();
	(function(cb) {
		var server = testSkel(files, opts, function(err) {
			if(err) return cb(err);
			var t = Date.now() - s;
			assert(t > 500); // should try once
			assert(t < 1000); // but not twice (won't happen since we restrict tries to 1, in which case, it shouldn't re-post)
			server.close(function() {
				cb(null, server);
			});
		});
		var post;
		server.onPostHook = function(post) {
			setTimeout(function() {
				// make this post magically appear later
				server.insertPost(post);
			}, 200);
			return true; // drop this post
		};
	})(function(err, server) {
		if(err) return done(err);
		assert.equal(Object.keys(server.posts.rifles).length, 1);
		assert.equal(Object.keys(server.postIdMap).length, 1);
		done(err);
	});
});


it('should retry post if post check finds first attempt missing', function(done) {
	var files = ['index.js'];
	var opts = {
		server: {
			connections: 1
		},
		check: {
			server: {
				connections: 1
			},
			delay: 10,
			recheckDelay: 10,
			tries: 1,
		}
	};
	
	(function(cb) {
		var server = testSkel(files, opts, function(err) {
			if(err) return cb(err);
			server.close(function() {
				cb(null, server);
			});
		});
		server.onPostHook = function(){ return true; }; // drop the first post
	})(function(err, server) {
		if(err) return done(err);
		assert.equal(Object.keys(server.posts.rifles).length, 1);
		assert.equal(Object.keys(server.postIdMap).length, 1);
		done(err);
	});
});


});
