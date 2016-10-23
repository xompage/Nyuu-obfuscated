"use strict";

var assert = require("assert");
var tl = require('./_testlib');
var FileUploader = require('../lib/fileuploader');
var NNTPServer = require('./_nntpsrv');

var lastServerPort = 0;
var clientOpts = function(opts) {
	var deepMerge = require('../lib/util').deepMerge;
	var o = {};
	deepMerge(o, require('../config'));
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
			postConnections: 1,
			checkConnections: 0
		},
		check: {
			delay: 10,
			recheckDelay: 10,
			tries: 0,
			ulConnReuse: false,
			postRetries: 1,
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
				flags: 'w',
				encoding: 'utf8',
			},
			minify: false,
			compression: '', // TODO: gzip etc
			metaData: {
				client: 'Nyuu',
			},
		},
	});
	
	// TODO: ability to test multi-server
	deepMerge(o, opts);
	o.servers = [o.server];
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
	doTest(['help.txt'], {
		server: {
			postConnections: 1
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
	doTest(['lib/', 'help.txt'], {
		server: {
			postConnections: 3,
			checkConnections: 1
		},
		check: {
			delay: 10,
			recheckDelay: 10,
			tries: 1,
		},
		useLazyConnect: true,
		articleSize: 4096,
		diskReqSize: 8192,
		diskBufSize: 8192
	}, function(err, server) {
		if(err) return done(err);
		// TODO: better checks
		var numFiles = require('fs').readdirSync('lib/').length +1;
		assert(Object.keys(server.posts.rifles).length >= numFiles);
		assert(Object.keys(server.postIdMap).length >= numFiles);
		done(err);
	});
});

it('should close connections on complete, even on hanging connection', function(done) {
	var files = ['help.txt'];
	var opts = {
		server: {
			postConnections: 2,
			
			timeout: 1000,
			connTimeout: 1000,
			reconnectDelay: 500,
			connectRetries: 10,
			requestRetries: 10,
			postRetries: 10
		},
	};
	
	var s = Date.now();
	(function(cb) {
		var server = testSkel(files, opts, function(err) {
			if(err) return cb(err);
			var t = Date.now() - s;
			assert(t < 500); // shouldn't wait for other connections to get through
			server.close(function() {
				cb(null, server);
			});
		});
		var connCnt = 0;
		server.onConnect(function(conn) {
			// only let the 2nd connection do anything
			if(++connCnt == 2) return;
			conn._respond = function() {};
		});
	})(function(err, server) {
		done(err);
	});
});


it('should retry check if first attempt doesn\'t find it', function(done) {
	var files = ['help.txt'];
	var opts = {
		server: {
			postConnections: 1,
			checkConnections: 1
		},
		check: {
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
	var files = ['help.txt'];
	var opts = {
		server: {
			postConnections: 1,
			checkConnections: 1
		},
		check: {
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

it('should skip check-missing error if requested to do so', function(done) {
	var files = ['help.txt'];
	var opts = {
		server: {
			postConnections: 1,
			checkConnections: 1
		},
		check: {
			delay: 10,
			recheckDelay: 10,
			tries: 1,
			postRetries: 0
		},
		skipErrors: ['check-missing']
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
		assert(!server.posts.rifles);
		assert.equal(Object.keys(server.postIdMap).length, 0);
		done(err);
	});
});
it('should skip post-reject error if requested to do so', function(done) {
	var files = ['help.txt'];
	var opts = {
		server: {
			postConnections: 1,
			postRetries: 0
		},
		skipErrors: ['post-reject']
	};
	
	(function(cb) {
		var server = testSkel(files, opts, function(err) {
			if(err) return cb(err);
			server.close(function() {
				cb(null, server);
			});
		});
		server.onPostHook = function(post){ post.messageId = false; }; // reject the first post
	})(function(err, server) {
		if(err) return done(err);
		assert(!server.posts.rifles);
		assert.equal(Object.keys(server.postIdMap).length, 0);
		done(err);
	});
});
it('should skip check-timeout error if requested to do so', function(done) {
	var files = ['help.txt'];
	var opts = {
		server: {
			postConnections: 1,
			checkConnections: 1
		},
		check: {
			delay: 10,
			tries: 1
		},
		skipErrors: ['check-timeout']
	};
	
	(function(cb) {
		var server = testSkel(files, opts, function(err) {
			if(err) return cb(err);
			server.close(function() {
				cb(null, server);
			});
		});
		var post;
		server.onRequest(function(req, data) {
			if(req == 'STAT') return true; // drop all STAT responses
		});
	})(function(err, server) {
		if(err) return done(err);
		assert.equal(Object.keys(server.posts.rifles).length, 1);
		assert.equal(Object.keys(server.postIdMap).length, 1);
		done(err);
	});
});

});
