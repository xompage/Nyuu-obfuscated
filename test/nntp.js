"use strict";

var assert = require("assert");
var async = require('async');
var NNTP = require('../lib/nntp');
var net = require('net');

// hijack Message-ID generator for testing purposes
NNTP._makeMsgId = function() {
	return 'xxxx@xxx';
};
// the post format that NNTP sends - needs to be the same as in lib/nntp.js
var expectedPost = function(headers, msg) {
	return headers.join('\r\n') + '\r\nMessage-ID: <' + NNTP._makeMsgId() + '>\r\n\r\n' + msg;
};

var tl = require('./_testlib');

var DEBUG = false;

var nntpLastLog = {warn: null, info: null, debug: null};
NNTP.log = {
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
		c.on('data', this.onData.bind(this));
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
		this.server.close(cb);
	},
	drop: function() {
		this._conn.destroy();
		this._conn = null;
	},
	listen: function(port, cb) {
		this.server.listen(port, 'localhost', cb);
	}
};


var currentServer;
var USE_PORT = 38174;
function setupTest(cb) {
	nntpLastLog = {warn: null, info: null, debug: null};
	
	if(currentServer) { // previous test failed?
		try {
			currentServer.close(function() {
				currentServer = null;
				setupTest(cb);
			});
			return;
		} catch(x) {} // failed to close, just continue...
	}
	
	var server = new TestServer(function() {
		server.respond('200 host test server');
	});
	var client;
	server.listen(USE_PORT, function() {
		client = new NNTP({ // connection settings
			connect: {
				host: 'localhost',
				port: USE_PORT,
			},
			secure: false, // we won't bother testing SSL, since it's a minimal change on our side
			user: null,
			password: null,
			timeout: 75,
			connTimeout: 100,
			reconnectDelay: 500,
			connectRetries: 1,
			postRetries: 1,
		});
		
		cb(null, server, client);
	});
	currentServer = server;
}

function setupAuth(client, server, cb) {
	client.opts.user = 'nyuu';
	client.opts.password = 'iamreallylucy';
	server.expect('AUTHINFO USER nyuu\r\n', function() {
		assert.equal(client.state, 'auth');
		this.respond('381 Give AUTHINFO PASS command');
		this.expect('AUTHINFO PASS iamreallylucy\r\n', function() {
			this.respond('281 User logged in');
			if(cb) cb();
		});
	});
}

function closeTest(client, server, cb) {
	server.expect('QUIT\r\n', '205 Connection closing');
	client.end();
	assert.equal(client.state, 'closing');
	tl.defer(function() {
		assert.equal(client.state, 'disconnected');
		server.close(cb);
		currentServer = null;
	});
	
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
				assert(err);
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
			var headers = ['My-Secret: not telling'];
			var msg = 'Nyuu breaks free again!\r\n.\r\n';
			server.expect('POST\r\n', function() {
				this.expect(expectedPost(headers, msg), '240 <new-article> Article received ok');
				this.respond('340  Send article');
			});
			client.post(headers, new Buffer(msg), cb);
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

it('should honour a request made before connected', function(done) {
	var server, client;
	async.waterfall([
		setupTest,
		function(_server, _client, cb) {
			server = _server;
			client = _client;
			
			server.expect('DATE\r\n', '111 20110204060810');
			client.date(cb);
			client.connect();
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
				assert(err);
			});
			client.destroy();
			assert.equal(client.state, 'disconnected');
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

it('should attempt to reconnect if connection is lost', function(done) {
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
it('should attempt to rejoin a group if connection is lost', function(done) {
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
			
			var headers = ['My-Secret: not telling'];
			var msg = 'Nyuu breaks free again!\r\n.\r\n';
			var fMsg = expectedPost(headers, msg);
			server.expect('POST\r\n', function() {
				this.expect(fMsg, function() {
					this.expect('POST\r\n', function() {
						this.expect(fMsg, '240 <new-article> Article received ok');
						this.respond('340  Send article');
					});
					this.drop();
				});
				this.respond('340  Send article');
			});
			client.post(headers, new Buffer(msg), cb);
		},
		function(a, cb) {
			assert.equal(a, 'new-article');
			
			closeTest(client, server, cb);
		}
	], done);
	
});

it('should return error on request timeout', function(done) {
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
			
			var tim;
			server.expect('DATE\r\n', function() {
				// never give a response...
				tim = setTimeout(function() {
					assert.fail('Client did not time out');
				}, 125);
			});
			client.date(function(err, date) {
				clearTimeout(tim);
				assert(err);
				assert(!date);
				closeTest(client, server, cb);
			});
		}
	], done);
	
});
it('should return error on posting timeout', function(done) {
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
			
			var tim;
			var headers = ['My-Secret: not telling'];
			var msg = 'Nyuu breaks free again!\r\n.\r\n';
			server.expect('POST\r\n', function() {
				this.expect(expectedPost(headers, msg), function() {
					// never give a response...
					tim = setTimeout(function() {
						assert.fail('Client did not time out');
					}, 125);
				});
				this.respond('340  Send article');
			});
			client.post(headers, new Buffer(msg), function(err, a) {
				clearTimeout(tim);
				assert(err);
				assert(!a);
				closeTest(client, server, cb);
			});
		}
	], done);
});

it('should deal with connection timeouts');
it('should do nothing on an idle too long message');

it('should not allow concurrent requests');

it('should retry reconnecting if it only fails once'); // also test that the delay period works

it('should warn on unexpected spurious data received');

it('should give up after max reconnect retries hit'); // also test that this counter is reset after a successful connect

it('should deal with a connection drop after receiving partial data');
it('should deal with the case of newlines being split across packets'); // or in unfortunate positions

it('should deal with socket errors');
it('should deal with a socket error during connect');
// TODO: connect() callback shouldn't be called on first error?

// TODO: consider testing recoverability after an error occurrence?

});
