"use strict";

var assert = require("assert");
var async = require('async');
var NNTP = require('../lib/nntp');
var net = require('net');

// mimick Post object as far as the NNTP module requires it
function DummyPost(data) {
	this.data = new Buffer(data);
	this.randomizeMessageID = function() {
		return 'xxxx';
	};
}

var newFakeConn = function() {
	var fakeConn = new (require('stream').Writable)();
	fakeConn.destroy = function() {};
	return fakeConn;
};

var tl = require('./_testlib');

var DEBUG = false;

var nntpLastLog = {warn: null, info: null, debug: null};
NNTP.log = {
	error: function(msg) {
		if(DEBUG) console.log('[ERROR] ' + msg);
		nntpLastLog.error = msg;
	},
	warn: function(msg) {
		if(DEBUG) console.log('[WARN] ' + msg);
		nntpLastLog.warn = msg;
	},
	info: function(msg) {
		if(DEBUG) console.log('[INFO] ' + msg);
		nntpLastLog.info = msg;
	},
	debug: function(msg) {
		if(DEBUG) console.log('[DEBUG] ' + msg);
		nntpLastLog.debug = msg;
	}
};


// emulate a simple echo/expectation server
function TestServer(onConn) {
	this.data = Buffer(0);
	this.server = net.createServer(function(c) {
		if(this._conn) throw new Error('Multiple connections received');
		this._conn = c;
		this.connectedTime = Date.now();
		c.on('data', this.onData.bind(this));
		c.on('error', function(err) {
			// we do expect errors - log them for now?
			console.log('Test-server error: ', err);
		});
		c.once('close', function() {
			this._conn = null;
		}.bind(this));
		c.setNoDelay(); // make tests a little faster
		onConn();
	}.bind(this));
}
TestServer.prototype = {
	_expect: null,
	_expectAction: null,
	_conn: null,
	_closed: false,
	
	onData: function(chunk) {
		if(!this._expect) throw new Error('Unexpected data received: ' + chunk.toString());
		
		if(DEBUG) console.log('<< ' + chunk.toString());
		
		// highly inefficient, but meh
		this.data = Buffer.concat([this.data, chunk]);
		
		if(this.data.length > this._expect.length)
			assert.equal(this.data.toString(), this._expect.toString());
		if(this.data.length == this._expect.length) {
			assert.equal(this.data.toString(), this._expect.toString());
			this._expect = null;
			this.data = Buffer(0);
			if(typeof this._expectAction == 'function')
				this._expectAction.call(this);
			else if(this._expectAction)
				this.respond(this._expectAction);
		}
	},
	expect: function(data, response) {
		this._expect = new Buffer(data);
		this._expectAction = response;
	},
	respond: function(msg) {
		this._conn.write(msg);
		this._conn.write('\r\n');
		if(DEBUG) console.log('>> ' + msg.toString());
	},
	close: function(cb) {
		if(!this._closed)
			this.server.close(cb);
		else
			process.nextTick(cb);
		this._closed = true;
	},
	drop: function() {
		this._conn.destroy();
		this._conn = null;
	},
	listen: function(port, cb) {
		this._closed = false;
		this.server.listen(port, 'localhost', function() {
			lastServerPort = this.server.address().port;
			cb();
		}.bind(this));
	}
};

var deepMerge = require('../lib/util').deepMerge;

var currentServer;
var lastServerPort = 0;
var newNNTP = function(opts) {
	var o = { // connection settings
		connect: {
			host: 'localhost',
			port: lastServerPort,
		},
		secure: false, // we won't bother testing SSL, since it's a minimal change on our side
		user: null,
		password: null,
		timeout: 75,
		connTimeout: 500, // timeout is higher than the reconnect delay - a test relies on it
		reconnectDelay: 300,
		connectRetries: 1,
		requestRetries: 5,
		postRetries: 1,
		keepAlive: false
	};
	deepMerge(o, opts);
	return new NNTP(o);
};
function killServer(cb) {
	if(!currentServer) return cb();
	try {
		currentServer.close(function() {
			currentServer = null;
			cb();
		});
		return;
	} catch(x) { cb(); } // failed to close, just continue...
}
function setupTest(o, cb) {
	nntpLastLog = {warn: null, info: null, debug: null};
	
	if(currentServer) { // previous test failed?
		killServer(setupTest.bind(null, o, cb));
		return;
	}
	
	if(!cb) {
		cb = o;
		o = null;
	}
	
	var server = new TestServer(function() {
		server.respond('200 host test server');
	});
	server.listen(0, function() {
		cb(null, server, newNNTP(o));
	});
	currentServer = server;
}

function setupAuth(client, server, cb) {
	client.opts.user = 'nyuu';
	client.opts.password = 'iamreallylucy';
	server.expect('AUTHINFO USER nyuu\r\n', function() {
		assert.equal(client.state, 'authenticating');
		this.respond('381 Give AUTHINFO PASS command');
		this.expect('AUTHINFO PASS iamreallylucy\r\n', function() {
			this.respond('281 User logged in');
			if(cb) cb();
		});
	});
}

function closeTest(client, server, cb) {
	if(client.state == 'disconnected' || client.state == 'inactive') {
		server.close(cb);
		currentServer = null;
	} else {
		server.expect('QUIT\r\n', '205 Connection closing');
		client.end();
		assert.equal(client.state, 'closing');
		tl.defer(function() {
			assert.equal(client.state, 'disconnected');
			server.close(cb);
			currentServer = null;
		});
	}
	
}

describe('NNTP Client', function() {

it('should handle basic tasks', function(done) {
	
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			client.connect(cb);
		},
		function(cb) {
			assert.equal(client.state, 'connected');
			server.expect('DATE\r\n', '111 20110204060810');
			client.date(cb);
		},
		function(date, cb) {
			assert.equal(date.toString(), (new Date('2011-02-04 06:08:10')).toString());
			
			server.expect('GROUP some-group\r\n', '211 2 1 2 some-group');
			client.group('some-group', cb);
		},
		function(cb) {
			assert.equal(client.currentGroup, 'some-group');
			
			server.expect('GROUP invalid-group\r\n', '411 No such newsgroup (Mailbox does not exist)');
			client.group('invalid-group', function(err) {
				assert.equal(err.code, 'invalid_group');
				assert.equal(client.currentGroup, 'some-group');
				cb();
			});
		},
		function(cb) {
			server.expect('STAT <valid-post>\r\n', '223 51 <valid-post> article retrieved - request text separately');
			client.stat('valid-post', cb);
		},
		function(a, cb) {
			assert.equal(a[0], 51);
			assert.equal(a[1], 'valid-post');
			
			server.expect('STAT <invalid-post>\r\n', '430 no such article found');
			client.stat('invalid-post', cb);
		},
		function(a, cb) {
			assert(!a);
			
			server.expect('STAT 3311\r\n', '223 3311 <a-random-post> article retrieved - request text separately');
			client.stat(3311, cb);
		},
		function(a, cb) {
			assert.equal(a[0], 3311);
			assert.equal(a[1], 'a-random-post');
			
			// test posting
			var msg = 'My-Secret: not telling\r\n\r\nNyuu breaks free again!\r\n.\r\n';
			server.expect('POST\r\n', function() {
				this.expect(msg, '240 <new-article> Article received ok');
				this.respond('340  Send article');
			});
			client.post(new DummyPost(msg), cb);
		},
		function(a, cb) {
			assert.equal(a, 'new-article');
			
			cb();
		},
		function(cb) {
			closeTest(client, server, cb);
		}
	], done);
});

it('should auto-connect on request', function(done) {
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			server.expect('DATE\r\n', '111 20110204060810');
			client.date(cb);
		},
		function(date, cb) {
			assert.equal(date.toString(), (new Date('2011-02-04 06:08:10')).toString());
			assert.equal(client.state, 'connected');
			
			closeTest(client, server, cb);
		}
	], done);
});

it('should honour a request made before connected', function(done) {
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			
			server.expect('DATE\r\n', '111 20110204060810');
			client.connect();
			client.date(cb);
		},
		function(date, cb) {
			assert.equal(date.toString(), (new Date('2011-02-04 06:08:10')).toString());
			assert.equal(client.state, 'connected');
			closeTest(client, server, cb);
		}
	], done);
});

it('should authenticate', function(done) {
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			setupAuth(client, server);
			client.connect(cb);
		},
		function(cb) {
			assert.equal(client.state, 'connected');
			closeTest(client, server, cb);
		}
	], done);
});

it('should end when requested'); // also test .destroy() method
// TODO: test both of the above with an active request


it('should handle half-open end request', function(done) {
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			client.connect(cb);
		},
		function(cb) {
			assert.equal(client.state, 'connected');
			
			// request something and immediately end - response should still come back
			server.expect('DATE\r\nQUIT\r\n', function() {
				setImmediate(function() {
					server.respond('111 20110204060810');
					server.respond('205 Connection closing');
				});
			});
			client.date(cb);
			client.end();
			assert.equal(client.state, 'closing');
		},
		function(date, cb) {
			assert.equal(date.toString(), (new Date('2011-02-04 06:08:10')).toString());
			
			tl.defer(function() {
				server.close(cb);
				currentServer = null;
				assert.equal(client.state, 'disconnected');
			});
		}
	], done);
});

it('should not honor half-open destroy request', function(done) {
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			client.connect(cb);
		},
		function(cb) {
			assert.equal(client.state, 'connected');
			
			server.expect('DATE\r\n', function() {
				setImmediate(function() {
					if(!server._conn) return;
					server._conn.once('error', function(){}); // suppress EPIPE error
					server.respond('111 20110204060810');
				});
			});
			client.date(function(err) {
				assert.equal(err.code, 'closed');
			});
			client.destroy();
			assert.equal(client.state, 'inactive');
			tl.defer(function() {
				server.close(cb);
				currentServer = null;
			});
		}
	], done);
});

it('should handle connection drop just before request', function(done) {
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			client.connect(cb);
		},
		function(cb) {
			assert.equal(client.state, 'connected');
			
			server.drop();
			server.expect('DATE\r\n', '111 20110204060810');
			client.date(cb);
		},
		function(date, cb) {
			assert.equal(date.toString(), (new Date('2011-02-04 06:08:10')).toString());
			closeTest(client, server, cb);
		}
	], done);
});

it('should deal with error responses');
it('should deal with invalid responses'); // including onconnect

it('should attempt to reconnect if connection is lost (keepalive=1)', function(done) {
	var server, client;
	async.waterfall([
		setupTest.bind(null, {keepAlive: true}),
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			setupAuth(client, server);
			client.connect(cb);
		},
		function(cb) {
			assert.equal(client.state, 'connected');
			
			server.drop();
			setupAuth(client, server, function() {
				tl.defer(cb);
			});
		},
		function(cb) {
			assert.equal(client.state, 'connected');
			
			closeTest(client, server, cb);
		}
	], done);
	
});
it('should attempt to rejoin a group if connection is lost (keepalive=1)', function(done) {
	var server, client;
	async.waterfall([
		setupTest.bind(null, {keepAlive: true}),
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			setupAuth(client, server);
			client.connect(cb);
		},
		function(cb) {
			assert.equal(client.state, 'connected');
			server.expect('GROUP some-group\r\n', '211 2 1 2 some-group');
			client.group('some-group', cb);
		},
		function(cb) {
			assert.equal(client.currentGroup, 'some-group');
			
			server.drop();
			setupAuth(client, server, function() {
				server.expect('GROUP some-group\r\n', function() {
					this.respond('211 2 1 2 some-group');
					tl.defer(cb);
				});
			});
		},
		function(cb) {
			assert.equal(client.state, 'connected');
			
			closeTest(client, server, cb);
		}
	], done);
});
it('should attempt to reconnect if connection is lost after new request (keepalive=0)', function(done) {
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			setupAuth(client, server);
			client.connect(cb);
		},
		function(cb) {
			assert.equal(client.state, 'connected');
			
			server.drop();
			tl.defer(function() {
				assert.equal(client.state, 'inactive');
				client.stat(1, cb);
				setupAuth(client, server, function() {
					server.expect('STAT 1\r\n', '223 1 <some-post> article retrieved');
				});
			});
		},
		function(a, cb) {
			assert.equal(client.state, 'connected');
			assert.equal(a[0], 1);
			assert.equal(a[1], 'some-post');
			
			closeTest(client, server, cb);
		}
	], done);
});
it('should attempt to rejoin a group if connection is lost after new request (keepalive=0)', function(done) {
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			setupAuth(client, server);
			client.connect(cb);
		},
		function(cb) {
			assert.equal(client.state, 'connected');
			server.expect('GROUP some-group\r\n', '211 2 1 2 some-group');
			client.group('some-group', cb);
		},
		function(cb) {
			assert.equal(client.currentGroup, 'some-group');
			
			server.drop();
			tl.defer(function() {
				assert.equal(client.state, 'inactive');
				client.stat(1, cb);
				setupAuth(client, server, function() {
					server.expect('GROUP some-group\r\n', function() {
						server.expect('STAT 1\r\n', '223 1 <some-post> article retrieved');
						this.respond('211 2 1 2 some-group');
					});
				});
			});
		},
		function(a, cb) {
			assert.equal(client.state, 'connected');
			assert.equal(a[0], 1);
			assert.equal(a[1], 'some-post');
			
			closeTest(client, server, cb);
		}
	], done);
});


it('should clear receive buffer on connection dropout');
it('should disconnect if response received exceeds 4KB in size');

it('should resend request if connection lost before response received', function(done) {
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			client.connect(cb);
		},
		function(cb) {
			assert.equal(client.state, 'connected');
			server.expect('GROUP some-group\r\n', '211 2 1 2 some-group');
			client.group('some-group', cb);
		},
		function(cb) {
			assert.equal(client.currentGroup, 'some-group');
			
			// send req
			server.expect('DATE\r\n', function() {
				this.expect('GROUP some-group\r\n', function() {
					this.expect('DATE\r\n', '111 20110204060810');
					this.respond('211 2 1 2 some-group');
				});
				this.drop();
			});
			client.date(cb);
		},
		function(date, cb) {
			assert.equal(date.toString(), (new Date('2011-02-04 06:08:10')).toString());
			
			closeTest(client, server, cb);
		}
	], done);
});
it('should reattempt to post if connection drops out', function(done) {
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			client.connect(cb);
		},
		function(cb) {
			assert.equal(client.state, 'connected');
			
			var msg = 'My-Secret: not telling\r\n\r\nNyuu breaks free again!\r\n.\r\n';
			server.expect('POST\r\n', function() {
				this.expect(msg, function() {
					this.expect('POST\r\n', function() {
						this.expect(msg, '240 <new-article> Article received ok');
						this.respond('340  Send article');
					});
					// we'll hijack this test case to check that the input buffer gets cleared on reconnect, by sending some junk data
					this._conn.write('blah'); // should be ignored by client
					setTimeout(function() {
						server.drop();
					}, 30);
				});
				this.respond('340  Send article');
			});
			client.post(new DummyPost(msg), cb);
		},
		function(a, cb) {
			assert.equal(a, 'new-article');
			
			closeTest(client, server, cb);
		}
	], done);
});

it('should reattempt to post if first time fails', function(done) {
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			client.connect(cb);
		},
		function(cb) {
			assert.equal(client.state, 'connected');
			
			var msg = 'My-Secret: not telling\r\n\r\nNyuu breaks free again!\r\n.\r\n';
			server.expect('POST\r\n', function() {
				this.expect(msg, function() {
					this.expect('POST\r\n', function() {
						this.expect(msg, '240 <new-article> Article received ok');
						this.respond('340 Send article');
					});
					this.respond('441 posting failed');
				});
				this.respond('340 Send article');
			});
			client.post(new DummyPost(msg), cb);
		},
		function(a, cb) {
			assert.equal(a, 'new-article');
			
			closeTest(client, server, cb);
		}
	], done);
	
});

it('should resend request if connection lost and reconnect fails once', function(done) {
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			client.currentGroup = 'some-group';
			server.expect('GROUP some-group\r\n', '211 2 1 2 some-group');
			client.connect(cb);
		},
		function(cb) {
			// send req
			server.expect('DATE\r\n', function() {
				this.expect('GROUP some-group\r\n', function() {
					this.expect('GROUP some-group\r\n', function() {
						this.expect('DATE\r\n', '111 20110204060810');
						this.respond('211 2 1 2 some-group');
					});
					this.drop(); // drop a second time (this will be in the connect init sequence)
				});
				this.drop(); // drop first time
			});
			client.date(cb);
		},
		function(date, cb) {
			assert.equal(date.toString(), (new Date('2011-02-04 06:08:10')).toString());
			
			closeTest(client, server, cb);
		}
	], done);
});


it('should retry on request timeout', function(done) {
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			client.connect(cb);
		},
		function(cb) {
			assert.equal(client.state, 'connected');
			
			server.expect('DATE\r\n', function() {
				// never give a response...
				// give one on second try
				server.expect('DATE\r\n', '111 20110204060810');
			});
			client.date(cb);
		},
		function(date, cb) {
			assert.equal(date.toString(), (new Date('2011-02-04 06:08:10')).toString());
			closeTest(client, server, cb);
		}
	], done);
	
});
it('should retry on posting timeout', function(done) {
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			client.connect(cb);
		},
		function(cb) {
			assert.equal(client.state, 'connected');
			
			var msg = 'My-Secret: not telling\r\n\r\nNyuu breaks free again!\r\n.\r\n';
			server.expect('POST\r\n', function() {
				this.expect(msg, function() {
					// never give a response...
					// give one on second try
					this.expect('POST\r\n', function() {
						this.expect(msg, '240 <new-article> Article received ok');
						this.respond('340  Send article');
					});
				});
				this.respond('340  Send article');
			});
			client.post(new DummyPost(msg), cb);
		},
		function(a, cb) {
			assert.equal(a, 'new-article');
			closeTest(client, server, cb);
		}
	], done);
});

it('should ignore posting timeout if requested', function(done) {
	var server, client;
	async.waterfall([
		setupTest.bind(null, {ignorePostTimeout: true}),
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			client.connect(cb);
		},
		function(cb) {
			assert.equal(client.state, 'connected');
			
			var msg = 'My-Secret: not telling\r\n\r\nNyuu breaks free again!\r\n.\r\n';
			server.expect('POST\r\n', function() {
				this.expect(msg, function() {
					// never give a response...
				});
				this.respond('340  Send article');
			});
			client.post(new DummyPost(msg), cb);
		},
		function(a, cb) {
			assert.equal(a, 'xxxx');
			closeTest(client, server, cb);
		}
	], done);
});

it('should return error if reconnect completely fails during a request', function(done) {
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			client.connect(cb);
		},
		function(cb) {
			server.close(); // reject all future connect attempts
			currentServer = null;
			// send req
			server.expect('DATE\r\n', function() {
				this.expect('DATE\r\n', '111 20110204060810');
				this.drop();
			});
			client.date(function(err, date) {
				assert(!date);
				assert.equal(err.code, 'connect_fail');
				assert.equal(client.state, 'inactive');
				cb();
			});
		}
	], done);
});

it('should work if requesting whilst disconnected without pending connect', function(done) {
	var server, client;
	async.waterfall([
		setupTest.bind(null, {connTimeout: 20, connectRetries: 1, reconnectDelay: 10}),
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			client.connect(cb);
		},
		function(cb) {
			server.close(); // reject all future connect attempts
			server.drop();
			currentServer = null;
			
			// wait after all reconnect attempts have been tried
			setTimeout(function() {
				assert.equal(client.state, 'inactive');
				server.listen(lastServerPort, function() {
					server.expect('DATE\r\n', '111 20110204060810');
					client.date(function(err, date) {
						assert.equal(date.toString(), (new Date('2011-02-04 06:08:10')).toString());
						assert.equal(client.state, 'connected');
						closeTest(client, server, cb);
					});
				});
			}, 100);
		}
	], done);
});

it('should deal with connection timeouts', function(done) {
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			// simulate a connection timeout by hijacking the connect method, so that it does nothing on the first call
			var net = require('net');
			var realConnect = net.connect;
			net.connect = function() {
				net.connect = realConnect;
				return newFakeConn();
			};
			
			client.connect(cb);
		},
		function(cb) {
			assert.equal(client.state, 'connected');
			closeTest(client, server, cb);
		}
	], done);
});
it('should do nothing on an idle too long message');

it('should not allow concurrent requests');

it('should retry reconnecting if it only fails once', function(done) {
	var server, client;
	async.waterfall([
		killServer,
		function(cb) {
			// we don't start a server so that the connect fails, but start it up a while after so that the retry should succeed
			lastServerPort = 53151;
			var server, client = newNNTP();
			var emitted = false;
			var s = Date.now();
			client.connect(function(err) {
				var timeTaken = Date.now() - s;
				assert(timeTaken >= 300); // reconnect delay should be 300ms
				assert(timeTaken <= 800); // ...but less than 800ms (delay + timeout)
				assert(server);
				cb(err, server, client);
			});
			setTimeout(function() {
				server = new TestServer(function() {
					server.respond('200 host test server');
				});
				server.listen(lastServerPort, function() {});
				currentServer = server;
				
				if(!client.numErrors)
					client.socket.emit('error', 1); // workaround for systems that take a while to emit the connect fail error
			}, 150);
		},
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			
			server.expect('DATE\r\n', '111 20110204060810');
			client.date(cb);
		},
		function(date, cb) {
			assert.equal(date.toString(), (new Date('2011-02-04 06:08:10')).toString());
			assert.equal(client.state, 'connected');
			closeTest(client, server, cb);
		}
	], done);
});
it('should retry reconnecting if init sequence fails', function(done) {
	var server, client;
	async.waterfall([
		killServer,
		function(cb) {
			var dropped = false;
			var s = Date.now();
			var server = new TestServer(function() {
				// first connection = drop, otherwise continue
				if(dropped) {
					var timeTaken = Date.now() - s;
					assert(timeTaken >= 300); // reconnect delay should be 300ms
					assert(timeTaken <= 800); // ...but less than 800ms (delay + timeout)
					server.respond('200 host test server');
				} else {
					server.drop();
					dropped = true;
				}
			});
			server.listen(0, function() {
				cb(null, server, newNNTP());
			});
			currentServer = server;
		},
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			
			client.connect(cb);
		},
		function(cb) {
			assert.equal(client.state, 'connected');
			closeTest(client, server, cb);
		}
	], done);
});
it('should retry on timeout during init sequence', function(done) {
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			
			client.opts.user = 'nyuu';
			client.opts.password = 'iamreallylucy';
			server.expect('AUTHINFO USER nyuu\r\n', function() {
				assert.equal(client.state, 'authenticating');
				this.expect('AUTHINFO PASS iamreallylucy\r\n', function() {
					// do nothing to timeout
					this.expect('AUTHINFO USER nyuu\r\n', function() {
						this.expect('AUTHINFO PASS iamreallylucy\r\n', '281 User logged in');
						this.respond('381 Give AUTHINFO PASS command');
					});
				});
				this.respond('381 Give AUTHINFO PASS command');
			});
			client.connect(cb);
		},
		function(cb) {
			assert.equal(client.state, 'connected');
			closeTest(client, server, cb);
		}
	], done);
});
it('should throw error on auth failure');
it('should throw error if selected group fails on connect');

it('should retry on a single auth failure');

it('should warn on unexpected spurious data received');
it('should deal with unexpected 200 messages by reconnecting (keepalive=1)', function(done) {
	var server, client, ct;
	async.waterfall([
		setupTest.bind(null, {keepAlive: true}),
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			client.connect(cb);
		},
		function(cb) {
			ct = server.connectedTime;
			server.expect('STAT 1\r\n', '223 1 <some-post> article retrieved');
			tl.defer(function() {
				client.stat(1, cb);
			});
		},
		function(a, cb) {
			server.respond('200 Welcome');
			// client should now reconnect
			tl.defer(cb);
		}, function(cb) {
			assert.notEqual(server.connectedTime, ct);
			
			closeTest(client, server, cb);
		}
	], done);
});
it('should deal with 200 responses by reconnecting', function(done) {
	var server, client, ct;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			client.connect(cb);
		},
		function(cb) {
			ct = server.connectedTime;
			server.expect('STAT 1\r\n', function() {
				this.expect('STAT 1\r\n', '223 1 <some-post> article retrieved');
				this.respond('200 Welcome'); // client should drop now
			});
			tl.defer(function() {
				client.stat(1, cb);
			});
		},
		function(a, cb) {
			assert.equal(client.state, 'connected');
			assert.equal(a[0], 1);
			assert.notEqual(server.connectedTime, ct);
			
			closeTest(client, server, cb);
		}
	], done);
});
it('should deal with unexpected 200 messages by disconnecting (keepalive=0)', function(done) {
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			client.connect(cb);
		},
		function(cb) {
			server.expect('STAT 1\r\n', '223 1 <some-post> article retrieved');
			tl.defer(function() {
				client.stat(1, cb);
			});
		},
		function(a, cb) {
			server.respond('200 Welcome');
			// client should now disconnect
			tl.defer(cb);
		}, function(cb) {
			assert.equal(client.state, 'inactive');
			
			closeTest(client, server, cb);
		}
	], done);
});

it('should give up after max reconnect retries hit'); // also test that this counter is reset after a successful connect
it('should give up after max request retries hit', function(done) {
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			client.connect(cb);
		},
		function(cb) {
			var allDone = false;
			server.expect('STAT 1\r\n', function() {
				async.timesSeries(5, function(n, cb) {
					server.expect('STAT 1\r\n', cb);
					server.drop();
				}, function(err) {
					if(err) throw err;
					allDone = true;
				});
			});
			client.stat(1, function(err) {
				assert(allDone);
				assert.equal(err.code, 'timeout');
				cb();
			});
		}, function(cb) {
			closeTest(client, server, cb);
		}
	], done);
});
it('should give up after max request retries hit (post timeout)', function(done) {
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			client.connect(cb);
		},
		function(cb) {
			var allDone = false;
			var msg = 'My-Secret: not telling\r\n\r\nNyuu breaks free again!\r\n.\r\n';
			async.timesSeries(6, function(n, cb) {
				server.expect('POST\r\n', function() {
					this.expect(msg, cb);
					this.respond('340  Send article');
				});
			}, function(err) {
				if(err) throw err;
				allDone = true;
			});
			client.post(new DummyPost(msg), function(err, messageId) {
				assert.equal(err.code, 'timeout');
				assert(messageId); // should still return the message-id because we accepted the POST request
				assert(allDone);
				cb();
			});
		}, function(cb) {
			closeTest(client, server, cb);
		}
	], done);
});
it('should give up after max post retries hit');

it('should deal with a connection drop after receiving partial data');
it('should deal with the case of newlines being split across packets'); // or in unfortunate positions

it('should deal with socket errors');
it('should deal with a socket error during connect');
// TODO: connect() callback shouldn't be called on first error?

// TODO: consider testing recoverability after an error occurrence?

});
