"use strict";

var assert = require("assert");
var tl = require('./_testlib');
var FileUploader = require('../lib/fileuploader');
var net = require('net');

// simple NNTP server
function NNTPServer(opts) {
	// set denyPost
	// set auth user/pass
	
	this.posts = {};
	this.postIdMap = {};
	this.groups = ['limbs', 'rifles', 'bloodbath']; // list of available groups
	
	this.server = net.createServer(function(c) {
		new NNTPConnection(opts, this, c);
	}.bind(this));
}
NNTPServer.prototype = {
	onPostHook: null,
	
	groupNumPosts: function(grp) {
		if(this.groups.indexOf(grp) < 0)
			return false;
		
		if(grp in this.posts) {
			return this.posts[grp].length;
		} else {
			return 0;
		}
	},
	postById: function(id, grp) {
		if(typeof id != 'number') {
			return this.postIdMap[id];
		}
		if(!(grp in this.posts)) return false;
		return this.posts[grp][id];
	},
	addPost: function(headers, msg) {
		if(!headers.newsgroups) throw new Error('Post missing groups spec');
		if(('messageid' in headers) && (headers.messageid in this.postIdMap))
			return false;
		
		var messageId = headers.messageid;
		if(!messageId) {
			do {
				// 8 random a-z letters
				messageId = 'xxxxxxxx'.replace(/x/g, function() {
					return String.fromCharCode(97 + Math.random()*26);
				});
			} while(messageId in this.postIdMap);
		}
		
		// prepare post
		var post = {};
		for(var k in headers)
			post[k] = headers[k];
		post.messageId = messageId;
		post._msg = msg;
		post._groupNum = {};
		
		var dropPost = false; // drop the post to simulate it going missing?
		if(this.onPostHook) {
			var f = this.onPostHook;
			this.onPostHook = null;
			dropPost = f(post);
		}
		
		if(!dropPost)
			if(!this.insertPost(post))
				return false;
		return messageId;
	},
	insertPost: function(post) {
		// add post to specified groups
		var groups = post.newsgroups.split(',');
		for(var i in groups) {
			var grp = groups[i].trim();
			var grpCount = this.groupNumPosts(grp);
			if(grpCount === false)
				return false;
			post._groupNum[grp] = grpCount;
			if(!(grp in this.posts))
				this.posts[grp] = [];
			this.posts[grp].push(post);
		}
		
		// add thing in ID mapping
		this.postIdMap[post.messageId] = post;
		return true;
	},
	listen: function(port, cb) {
		this.server.listen(port, 'localhost', cb);
	},
	close: function(cb) {
		this.server.close(cb);
	}
};

function NNTPConnection(opts, server, conn) {
	this.dataQueue = [];
	this.opts = opts;
	this.server = server;
	this.conn = conn;
	this._respond(opts.denyPost ? 201 : 200, 'host test server');
	
	conn.on('data', this.onData.bind(this));
}
NNTPConnection.prototype = {
	authReq: false,
	authed: false,
	group: '',
	postMode: false,
	
	onData: function(chunk) {
		// grab incomming lines
		var data = chunk.toString();
		if(this.postMode) {
			return this.onPostData(data);
		}
		var p;
		while((p = data.indexOf('\r\n')) >= 0) {
			var line = this.dataQueue.join('') + data.substr(0, p);
			data = data.substr(p+2);
			this.dataQueue = [];
			
			var m = line.match(/^([A-Za-z]+) ?/);
			if(!m) throw new Error('Unexpected message format: ' + line);
			this.onRequest(m[1].toUpperCase(), line.substr(m[0].length));
			
			if(this.postMode) {
				return this.onPostData(data);
			}
		}
		if(data.length) this.dataQueue.push(data);
	},
	onPostData: function(data) {
		var p = data.indexOf('\r\n.\r\n');
		if(p >= 0) {
			// post received
			var messageId;
			if(messageId = this.addPost(this.dataQueue.join('') + data.substr(0, p))) {
				this._respond(240, '<' + messageId + '> Article received ok');
			} else {
				this._respond(441, ''); // TODO: fix 
			}
			data = data.substr(p+5);
			this.dataQueue = [];
			this.postMode = false;
			return this.onData(data);
		} else {
			this.dataQueue.push(data);
		}
		
	},
	onRequest: function(req, data) {
		// TODO: handle special responses (i.e. timeout, junk, disconnect)
		if(this.authReq && req != 'AUTHINFO' && !this.authed) {
			this._respond(480, 'Authentication required');
			return;
		}
		switch(req) {
			case 'AUTHINFO':
				var m;
				if(m = data.match(/^(USER|PASS) (.*)$/i)) {
					// for now, accept any user/pass
					// TODO: proper checking of USER/PASS ordering etc
					if(m[1].toUpperCase() == 'USER') {
						this._respond(381, 'Give AUTHINFO PASS command');
					} else {
						this._respond(281, 'User logged in');
						this.authed = true;
					}
				} else {
					throw new Error('Command not supported');
				}
			break;
			case 'DATE':
				this._respond(111, '20101122013344');
			break;
			case 'STAT':
				var msgId, post;
				if(msgId = data.match(/^<(.*)>$/)) {
					post = this.server.postById(msgId[1]);
				} else {
					if(!this.group) {
						this._respond(412, 'No newsgroup has been selected');
						break;
					}
					post = this.server.postById(data|0, this.group);
				}
				if(post)
					this._respond(223, (post._groupNum[this.group] || 0) + ' <' + post.messageId + '> article retrieved - request text separately');
				else
					this._respond(423, ''); // TODO:
			break;
			case 'GROUP':
				var np = this.server.groupNumPosts(data);
				if(np !== false) {
					// response not entirely accurate, but good enough for our purposes
					this._respond(211, np + ' 1 ' + np + ' ' + data);
					this.group = data;
				} else {
					this._respond(411, 'No such newsgroup');
				}
			break;
			case 'POST':
				if(data) throw new Error('Unexpected POST params');
				this.postMode = true;
				this._respond(340, 'Send article');
			break;
			case 'QUIT':
				this._respond(205, 'bye');
				this.conn.end();
			break;
			default:
				throw new Error('Command not supported');
		}
	},
	addPost: function(data) {
		// split headers
		var sData = data.toString();
		var p = data.indexOf('\r\n\r\n');
		if(p < 0) return false;
		sData = sData.substr(0, p+2);
		data = data.slice(Buffer(sData).length + 2);
		
		// parse headers
		var h = {};
		var re = /([a-zA-Z0-9\-_]+) *\: *([^\r\n]*)\r\n/;
		sData = sData.replace(new RegExp(re.source, 'g'), function(m) {
			m = m.match(re);
			h[m[1].toLowerCase()] = m[2];
			return '';
		});
		if(sData.length) throw new Error('Unexpected header data received!');
		
		return this.server.addPost(h, data);
	},
	_respond: function(code, msg) {
		this.conn.write(code + ' ');
		this.conn.write(msg);
		this.conn.write('\r\n');
	}
};

function deepMerge(dest, src) {
	for(var k in src) {
		if((k in dest) && typeof dest[k] == 'object' && !Array.isArray(dest[k])) {
			deepMerge(dest[k], src[k]);
		} else {
			dest[k] = src[k];
		}
	}
}

var clientOpts = function(opts) {
	var o = {
		server: {
			connect: {
				host: '127.0.0.1',
				port: USE_PORT,
			},
			secure: false, // set to 'true' to use SSL
			user: 'joe',
			password: 'blogs',
			timeout: 100,
			connTimeout: 100,
			reconnectDelay: 50,
			connectRetries: 1,
			postRetries: 1
		},
		connections: 1,
		check: {
			server: {},
			connections: 0,
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
	};
	
	deepMerge(o, opts);
	return o;
};

var USE_PORT = 38175;
var doTest = function(files, opts, cb) {
	var server = new NNTPServer({});
	server.listen(USE_PORT, function() {
		FileUploader.upload(files, clientOpts(opts), function(err) {
			if(err) return cb(err);
			server.close(function() {
				cb(null, server);
			});
		});
	});
};

describe('Nyuu', function() {

it('basic test', function(done) {
	doTest(['index.js'], {
		connections: 1,
		check: {
			delay: 10,
			recheckDelay: 10,
			tries: 0,
		}
	}, function(err, server) {
		assert.equal(Object.keys(server.posts.rifles).length, 1);
		assert.equal(Object.keys(server.postIdMap).length, 1);
		done(err);
	});
});

it('complex test', function(done) {
	doTest(['lib/', 'index.js'], {
		connections: 3,
		check: {
			connections: 1,
			delay: 10,
			recheckDelay: 10,
			tries: 1,
		},
		articleSize: 4096
	}, function(err, server) {
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
		connections: 1,
		check: {
			connections: 1,
			delay: 10,
			recheckDelay: 500,
			tries: 2,
		}
	};
	
	var s = Date.now();
	(function(cb) {
		var server = new NNTPServer({});
		var post;
		server.onPostHook = function(post) {
			setTimeout(function() {
				// make this post magically appear later
				server.insertPost(post);
			}, 200);
			return true; // drop this post
		};
		server.listen(USE_PORT, function() {
			FileUploader.upload(files, clientOpts(opts), function(err) {
				if(err) return cb(err);
				var t = Date.now() - s;
				assert(t > 500); // should try once
				assert(t < 1000); // but not twice (won't happen since we restrict tries to 1, in which case, it shouldn't re-post)
				server.close(function() {
					cb(null, server);
				});
			});
		});
	})(function(err, server) {
		assert.equal(Object.keys(server.posts.rifles).length, 1);
		assert.equal(Object.keys(server.postIdMap).length, 1);
		done(err);
	});
});


it('should retry post if post check finds first attempt missing', function(done) {
	var files = ['index.js'];
	var opts = {
		connections: 1,
		check: {
			connections: 1,
			delay: 10,
			recheckDelay: 10,
			tries: 1,
		}
	};
	
	(function(cb) {
		var server = new NNTPServer({});
		server.onPostHook = function(){ return true; }; // drop the first post
		server.listen(USE_PORT, function() {
			FileUploader.upload(files, clientOpts(opts), function(err) {
				if(err) return cb(err);
				server.close(function() {
					cb(null, server);
				});
			});
		});
	})(function(err, server) {
		assert.equal(Object.keys(server.posts.rifles).length, 1);
		assert.equal(Object.keys(server.postIdMap).length, 1);
		done(err);
	});
});


});
