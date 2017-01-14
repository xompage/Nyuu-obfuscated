"use strict";

var assert = require("assert");
var tl = require('./_testlib');
var FileUploader = require('../lib/fileuploader');
var PostUploader = require('../lib/postuploader');
var NNTPServer = require('./_nntpsrv');
var deepMerge = require('../lib/util').deepMerge;

if(false) { // debug toggle
	[FileUploader, PostUploader].forEach(function(u) {
		u.setLogger({
			error: function(msg) {
				console.log('[ERROR] ' + msg);
			},
			warn: function(msg) {
				console.log('[WARN] ' + msg);
			},
			info: function(msg) {
				console.log('[INFO] ' + msg);
			},
			debug: function(msg) {
				console.log('[DEBUG] ' + msg);
			}
		});
	});
}

var lastServerPort = 0;
var clientOpts = function(opts) {
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
			errorTeardown: false,
			closeTimeout: 10,
			postConnections: 1,
			checkConnections: 0
		},
		check: {
			delay: 10,
			recheckDelay: 10,
			tries: 0,
			ulConnReuse: false,
			postRetries: 1,
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

var testSkel = function(files, opts, cb, ulHooks) {
	var server = new NNTPServer({});
	server.listen(0, function() {
		lastServerPort = server.address().port;
		var e = (opts.rawInput ? PostUploader : FileUploader).upload(files, clientOpts(opts), cb);
		if(ulHooks) for(var k in ulHooks) {
			e.on(k, ulHooks[k]);
		}
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

['', ' (raw input)'].forEach(function(ulType) {
	var files = [ulType ? 'test/dummypost.txt' : 'help.txt'];
	it('basic test' +ulType, function(done) {
		doTest(files, {
			server: {
				postConnections: 1
			},
			check: {
				delay: 10,
				recheckDelay: 10,
				tries: 0,
			},
			rawInput: !!ulType
		}, function(err, server) {
			if(err) return done(err);
			assert.equal(Object.keys(server.posts.rifles).length, 1);
			assert.equal(Object.keys(server.postIdMap).length, 1);
			done(err);
		});
	});
	
	it('should close connections on complete, even on hanging connection' +ulType, function(done) {
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
			rawInput: !!ulType
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
	
	
	it('should retry check if first attempt doesn\'t find it' +ulType, function(done) {
		var opts = {
			server: {
				postConnections: 1,
				checkConnections: 1
			},
			check: {
				delay: 10,
				recheckDelay: 500,
				tries: 2,
			},
			rawInput: !!ulType
		};
		
		var s = Date.now();
		(function(cb) {
			var server = testSkel(files, opts, function(err) {
				if(err) return cb(err);
				var t = Date.now() - s;
				assert(t >= 500); // should try once
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
	
	it('test check cache eviction and reload' +ulType, function(done) {
		var opts = {
			server: {
				postConnections: 1,
				checkConnections: 1
			},
			check: {
				delay: 0,
				recheckDelay: 0,
				tries: 1,
				postRetries: 1,
				queueCache: 0,
				queueBuffer: 5
			},
			rawInput: !!ulType
		};
		
		var makePostStr = function(_headers, msg) {
			var headers = {};
			deepMerge(headers, _headers);
			delete headers['message-id'];
			return JSON.stringify(headers) + msg;
		};
		
		// TODO: actually check that the post was dropped from memory
		// TODO: perhaps test dropping posts other than the first
		(function(cb) {
			var server = testSkel(files, opts, function(err) {
				if(err) return cb(err);
				server.close(function() {
					cb(null, server);
				});
			});
			var post, firstStr;
			server.onPostHook = function(post, headers, msg) {
				firstStr = makePostStr(headers, msg);
				server.onPostHook = function(post, headers, msg) {
					assert.equal(firstStr, makePostStr(headers, msg));
				};
				return true; // drop first post
			};
		})(function(err, server) {
			if(err) return done(err);
			assert.equal(Object.keys(server.posts.rifles).length, 1);
			assert.equal(Object.keys(server.postIdMap).length, 1);
			done(err);
		});
	});
	
	it('should retry post if post check finds first attempt missing' +ulType, function(done) {
		var opts = {
			server: {
				postConnections: 1,
				checkConnections: 1
			},
			check: {
				delay: 10,
				recheckDelay: 10,
				tries: 1,
			},
			rawInput: !!ulType
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
	
	it('should skip check-missing error if requested to do so' +ulType, function(done) {
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
			skipErrors: ['check-missing'],
			rawInput: !!ulType
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
	it('should skip post-reject error if requested to do so' +ulType, function(done) {
		var opts = {
			server: {
				postConnections: 1,
				postRetries: 0
			},
			skipErrors: ['post-reject'],
			rawInput: !!ulType
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
	it('should skip check-timeout error if requested to do so' +ulType, function(done) {
		var opts = {
			server: {
				postConnections: 1,
				checkConnections: 1
			},
			check: {
				delay: 10,
				tries: 1
			},
			skipErrors: ['check-timeout'],
			rawInput: !!ulType
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


});
