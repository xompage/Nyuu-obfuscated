#!/usr/bin/env node

"use strict";
process.title = 'Nyuu';


var optMap = {
	host: {
		type: 'string',
		alias: 'h'
	},
	port: {
		type: 'int',
		alias: 'P',
		map: 'server/connect/port'
	},
	'bind-host': {
		type: 'string',
		map: 'server/connect/localAddress'
	},
	ipv6: {
		type: 'bool',
		alias: '6'
	},
	ssl: {
		type: 'bool',
		map: 'server/secure',
		alias: 'S'
	},
	'ignore-cert': {
		type: 'bool'
	},
	'sni-host': {
		type: 'string',
		map: 'server/connect/servername'
	},
	'ssl-ciphers': {
		type: 'string',
		map: 'server/connect/ciphers'
	},
	'ssl-method': {
		type: 'string',
		map: 'server/connect/secureProtocol'
	},
	user: {
		type: 'string',
		alias: 'u',
		map: 'server/user'
	},
	password: {
		type: 'string',
		alias: 'p',
		map: 'server/password'
	},
	connections: {
		type: 'int',
		alias: 'n',
		map: 'server/connections'
	},
	timeout: {
		type: 'int',
		map: 'server/timeout'
	},
	'connect-timeout': {
		type: 'int',
		map: 'server/connTimeout'
	},
	'reconnect-delay': {
		type: 'int',
		map: 'server/reconnectDelay'
	},
	'connect-retries': {
		type: 'int',
		map: 'server/connectRetries'
	},
	'request-retries': {
		type: 'int',
		map: 'server/requestRetries'
	},
	'post-retries': {
		type: 'int',
		map: 'server/postRetries'
	},
	'check-connections': {
		type: 'int',
		map: 'check/server/connections'
	},
	'check-reuse-conn': {
		type: 'bool',
		map: 'check/ulConnReuse'
	},
	'check-delay': {
		type: 'time',
		map: 'check/delay'
	},
	'check-retry-delay': {
		type: 'time',
		map: 'check/recheckDelay'
	},
	'check-tries': {
		type: 'int',
		map: 'check/tries',
		alias: 'c'
	},
	'check-group': {
		type: 'string',
		map: 'check/group'
	},
	'check-post-tries': {
		type: 'int',
		map: 'check/postRetries'
	},
	'check-ignore-fail': {
		type: 'bool',
		map: 'check/ignoreFailure'
	},
	'check-host': {
		type: 'string'
	},
	'check-port': {
		type: 'int',
		map: 'check/server/connect/port'
	},
	'check-bind-host': {
		type: 'string',
		map: 'check/server/connect/localAddress'
	},
	'check-ipv6': {
		type: 'bool'
	},
	'check-ssl': {
		type: 'bool',
		map: 'check/server/connect/secure',
	},
	'check-ignore-cert': {
		type: 'bool'
	},
	'check-sni-host': {
		type: 'string',
		map: 'check/server/connect/servername'
	},
	'check-ssl-ciphers': {
		type: 'string',
		map: 'check/server/connect/ciphers'
	},
	'check-ssl-method': {
		type: 'string',
		map: 'check/server/connect/secureProtocol'
	},
	'check-user': {
		type: 'string',
		map: 'check/server/user'
	},
	'check-password': {
		type: 'string',
		map: 'check/server/password'
	},
	'check-timeout': {
		type: 'int',
		map: 'check/server/timeout'
	},
	'check-connect-timeout': {
		type: 'int',
		map: 'check/server/connTimeout'
	},
	'check-reconnect-delay': {
		type: 'int',
		map: 'check/server/reconnectDelay'
	},
	'check-connect-retries': {
		type: 'int',
		map: 'check/server/connectRetries'
	},
	'check-request-retries': {
		type: 'int',
		map: 'check/server/requestRetries'
	},
	'article-size': {
		type: 'size',
		alias: 'a',
		map: 'articleSize'
	},
	'article-line-size': {
		type: 'int',
		map: 'bytesPerLine'
	},
	comment: {
		type: 'string',
		alias: 't',
		map: 'comment'
	},
	comment2: {
		type: 'string',
		map: 'comment2'
	},
	'group-files': {
		type: 'bool',
		alias: 'F',
		map: 'groupFiles'
	},
	header: {
		type: 'map',
		alias: 'H'
	},
	subject: {
		type: 'string',
		alias: 's'
	},
	from: {
		type: 'string',
		alias: 'f',
		map: 'postHeaders/From'
	},
	groups: {
		type: 'string',
		alias: 'g',
		map: 'postHeaders/Newsgroups'
	},
	out: {
		type: 'string',
		alias: 'o',
		map: 'nzb/writeTo'
	},
	minify: {
		type: 'bool',
		map: 'nzb/minify'
	},
	'nzb-compress': {
		type: 'string',
		map: 'nzb/compression'
	},
	'nzb-compress-level': {
		type: 'int',
		map: 'nzb/compressOpts/level'
	},
	'nzb-encoding': {
		type: 'string',
		map: 'nzb/writeOpts/encoding'
	},
	meta: {
		type: 'map',
		alias: 'M'
	},
	subdirs: {
		type: 'string',
		alias: 'r',
		map: 'subdirs'
	},
	'disk-req-size': {
		type: 'size',
		map: 'diskReqSize'
	},
	'disk-buf-size': {
		type: 'size',
		map: 'diskBufferSize'
	},
	'post-queue-size': {
		type: 'int',
		map: 'articleQueueBuffer'
	},
	'check-queue-size': {
		type: 'int',
		map: 'check/queueBuffer'
	},
	
	help: {
		type: 'bool',
		alias: '?'
	},
	version: {
		type: 'bool'
	},
	'log-level': {
		type: 'int',
		alias: 'l'
	},
	'log-time': {
		type: 'bool',
		alias: 'T'
	},
	verbose: {
		type: 'bool',
		alias: 'v'
	},
	quiet: {
		type: 'bool',
		alias: 'q'
	},
	progress: {
		type: 'array'
	}
};


// build minimist's option map
var mOpts = {string: [], boolean: [], alias: {}};
for(var k in optMap) {
	var o = optMap[k];
	if(o.type == 'bool')
		mOpts.boolean.push(k);
	else
		mOpts.string.push(k);
	
	if(o.alias) {
		mOpts.alias[o.alias] = k;
	}
}


var argv = require('minimist')(process.argv.slice(2), mOpts);


if(argv.help) {
	console.error(require('fs').readFileSync(__dirname + '/../help.txt').toString());
	process.exit(0);
}
if(argv.version) {
	console.error(require('../package.json').version);
	process.exit(0);
}

var error = function(msg) {
	console.error(msg);
	console.error('Enter `nyuu --help` for usage information');
	process.exit(1);
};
var parseSize = function(s) {
	if(typeof s == 'number' || (s|0) || s === '0') return Math.floor(s);
	var parts;
	if(parts = s.match(/^([0-9.]+)([kKmMgGtTpPeE])$/)) {
		var num = +(parts[1]);
		switch(parts[2].toUpperCase()) {
			case 'E': num *= 1024;
			case 'P': num *= 1024;
			case 'T': num *= 1024;
			case 'G': num *= 1024;
			case 'M': num *= 1024;
			case 'K': num *= 1024;
		}
		if(isNaN(num)) return false;
		return Math.floor(num);
	}
	return false;
};
var parseTime = function(s) {
	if(typeof s == 'number' || (s|0) || s === '0') return Math.floor(s*1000);
	var parts;
	if(parts = s.match(/^([0-9.]+)([mM]?[sS]|[mMhHdDwW])$/)) {
		var num = +(parts[1]);
		switch(parts[2].toLowerCase()) {
			case 'w': num *= 7;
			case 'd': num *= 24;
			case 'h': num *= 60;
			case 'm': num *= 60;
			case 's': num *= 1000;
		}
		if(isNaN(num)) return false;
		return Math.floor(num);
	}
	return false;
};

var ulOpts = require('../config.js');

for(var k in argv) {
	if(k == '_') continue;
	var v = argv[k];
	
	if(k in mOpts.alias) continue; // ignore minimist's annoying behaviour of setting aliased options
	if(!(k in optMap))
		error('Unknown option `' + k + '`');
	
	var o = optMap[k];
	if(o.type == 'int')
		v = v|0;
	if(o.type == 'size') {
		v = parseSize(v);
		if(!v) error('Invalid size specified for `' + k + '`');
	}
	if(o.type == 'time') {
		v = parseTime(v);
		if(v === false) error('Invalid time specified for `' + k + '`');
	}
	
	// fix arrays/maps
	var isArray = Array.isArray(v);
	if(o.type == 'array' || o.type == 'map') {
		if(!isArray) argv[k] = [v];
		// create map
		if(o.type == 'map') {
			v = {};
			argv[k].forEach(function(h) {
				var m;
				if(m = h.match(/^(.+?)[=:](.*)$/)) {
					v[m[1].trim()] = m[2].trim();
				} else {
					error('Invalid format for `' + k + '`');
				}
			});
			argv[k] = v;
		}
	} else if(isArray)
		error('Multiple values supplied for `' + k + '`!');
	
	if(o.map) {
		var path = o.map.split('/');
		var config = ulOpts;
		for(var i=0; i<path.length-1; i++) {
			if(!(path[i] in config))
				config[path[i]] = {};
			config = config[path[i]];
		}
		config[path.slice(-1)] = v;
	}
}

if(argv.subject) {
	ulOpts.postHeaders.Subject = function(filenum, filenumtotal, filename, filesize, part, parts, size) {
		return argv.subject.replace(/\{(filenum|files|filename|filesize|parts?|size)\}/ig, function(p) {
			switch(p[1].toLowerCase()) {
				case 'filenum': return filenum;
				case 'files': return filenumtotal;
				case 'filename': return filename;
				case 'filesize': return filesize;
				case 'part': return part;
				case 'parts': return parts;
				case 'size': return size;
			}
		});
	};
}

var connOptMap = {
	'ignore-cert': function(o) {
		o.rejectUnauthorized = false;
	},
	ipv6: function(o) {
		o.family = 6;
	},
	host: function(o, v) {
		if(v.match(/^unix:/i))
			o.path = v.substr(5);
		else
			o.host = v;
	}
};
for(var k in connOptMap) {
	if(argv[k])
		connOptMap[k](ulOpts.server.connect, argv[k]);
	if(argv['check-'+k])
		connOptMap[k](ulOpts.check.server.connect, argv['check-'+k]);
}

var execOpts = function(cmd, opts) {
	var spawn = require('child_process').spawn;
	if(process.platform === 'win32') {
		opts.windowsVerbatimArguments = true;
		return spawn(process.env.comspec || 'cmd.exe', ['/s', '/c', '"' + cmd + '"'], opts);
	} else {
		return spawn('/bin/sh', ['-c', cmd], opts);
	}
};

if(argv.out) {
	if(argv.out === '-')
		ulOpts.nzb.writeTo = process.stdout;
	else if(argv.out.match(/^proc:\/\//i)) {
		ulOpts.nzb.writeTo = function(cmd) {
			return execOpts(cmd, {stdio: ['pipe','ignore','ignore']}).stdin;
			// if process exits early, the write stream should break and throw an error
		}.bind(null, argv.out.substr(7));
	}
}

// map custom headers
if(argv.headers) {
	// to preserve case, build case-insensitive lookup
	var headerCMap = {};
	for(var k in ulOpts.postHeaders)
		headerCMap[k.toLowerCase()] = k;
	
	for(var k in argv.headers) {
		// handle casing wierdness
		var kk = headerCMap[k.toLowerCase()];
		if(!kk) {
			headerCMap[k.toLowerCase()] = kk = k;
		}
		ulOpts.postHeaders[kk] = argv.headers[k];
	}
}

// map custom meta tags
if(argv.meta) {
	for(var k in argv.meta)
		ulOpts.nzb.metaData[k] = argv.meta[k];
}



// custom validation rules
if(!argv.host && argv.host !== '0') error('Server host must be supplied');
if(!argv._.length)                  error('Must supply at least one input file');
if(argv.subdirs && ['skip','keep'].indexOf(argv.subdirs) < 0)
	error('Invalid option supplied for `--subdirs`');
if(argv['nzb-compress'] && ['gzip','zlib','deflate','xz'].indexOf(argv['nzb-compress']) < 0)
	error('Invalid value supplied for `--nzb-compress`');
// TODO: more validation

if(argv.quiet && argv.verbose)
	error('Cannot specify both `--quiet` and `--verbose`');

var verbosity = 3;
if(argv['log-level'])
	verbosity = argv['log-level'];
else if(argv.quiet)
	verbosity = 2;
else if(argv.verbose)
	verbosity = 4;

var logTimestamp;
if(argv['log-time']) {
	var tzOffset = (new Date()).getTimezoneOffset() * 60000;
	logTimestamp = function(addSpace) {
		process.stderr.write('[' + (new Date(Date.now() - tzOffset)).toISOString().replace('T', ' ').replace('Z', '') + ']');
		if(addSpace) process.stderr.write(' ');
	};
} else {
	logTimestamp = function(){};
}

var progress = [];
var stdErrProgress = false;
if(argv.progress) {
	argv.progress.forEach(function(str) {
		var m = str.match(/^([a-z]+)(:|$)/i);
		if(!m) error('Unknown progress specification: ' + str);
		var type = m[1].toLowerCase();
		var arg = str.substr(m[0].length);
		switch(type) {
			case 'log':
				progress.push({type: 'log', interval: parseTime(arg) || 60});
			break;
			case 'stderr':
				progress.push({type: 'stderr'});
				stdErrProgress = true;
			break;
			case 'tcp':
			case 'http':
				var o = {type: type, port: 0};
				if(m = arg.match(/^([a-z0-9\-.]*|\[[a-f0-9:]+\]):(\d*)$/i)) {
					if(m[1].length) {
						if(m[1].substr(0, 1) == '[')
							o.host = m[1].substr(1, m[1].length-2);
						else
							o.host = m[1];
					}
					o.port = m[2]|0;
				} else if((arg|0) == arg) {
					o.port = arg|0;
				} else {
					o.host = arg;
				}
				progress.push(o);
			break;
			case 'none':
				// bypass
			break;
			default:
				error('Unknown progress specification: ' + str);
		}
	});
} else if(verbosity >= 3 && process.stderr.isTTY) {
	// default progress bar
	progress.push({type: 'stderr'});
	stdErrProgress = true;
}

var lpad = function(s, l) {
	if(s.length > l) return s;
	return ' '.repeat(l-s.length) + s;
};
var rpad = function(s, l) {
	if(s.length > l) return s;
	return s + ' '.repeat(l-s.length);
};

var logger;
var writeProgress = null;
if(process.stderr.isTTY) {
	var padLen = stdErrProgress ? 80 : 0;
	// assume colours are supported
	logger = {
		debug: function(msg) {
			process.stderr.write('\x1B[36m');
			logTimestamp(1);
			process.stderr.write(rpad(msg, padLen));
			process.stderr.write('\x1B[39m\r\n');
			if(writeProgress) writeProgress();
		},
		info: function(msg) {
			process.stderr.write('\x1B[32m');
			logTimestamp(1);
			process.stderr.write(rpad(msg, padLen));
			process.stderr.write('\x1B[39m\r\n');
			if(writeProgress) writeProgress();
		},
		warn: function(msg) {
			process.stderr.write('\x1B[33m');
			logTimestamp(1);
			process.stderr.write(rpad(msg, padLen));
			process.stderr.write('\x1B[39m\r\n');
			if(writeProgress) writeProgress();
		},
		error: function(msg) {
			process.stderr.write('\x1B[31m');
			logTimestamp(1);
			process.stderr.write(rpad(msg, padLen));
			process.stderr.write('\x1B[39m\r\n');
			if(writeProgress) writeProgress();
		}
	};
} else {
	var padLen = stdErrProgress ? 73 : 0;
	logger = {
		debug: function(msg) {
			logTimestamp();
			process.stderr.write('[DBG]  ');
			console.error(rpad(msg, padLen));
		},
		info: function(msg) {
			logTimestamp();
			process.stderr.write('[INFO] ');
			console.error(rpad(msg, padLen));
		},
		warn: function(msg) {
			logTimestamp();
			process.stderr.write('[WARN] ');
			console.error(rpad(msg, padLen));
		},
		error: function(msg) {
			logTimestamp();
			process.stderr.write('[ERR]  ');
			console.error(rpad(msg, padLen));
		}
	};
}

if(verbosity < 4) logger.debug = function(){};
if(verbosity < 3) logger.info = function(){};
if(verbosity < 2) logger.warn = function(){};
if(verbosity < 1) {
	logger.error = function(){};
	// suppress output from uncaught exceptions
	process.once('uncaughtException', function(err) {
		process.exit(8);
	});
}

var Nyuu = require('../');
Nyuu.setLogger(logger);
var fuploader = Nyuu.upload(argv._.map(function(file) {
	// TODO: consider supporting deferred filesize gathering?
	var m = file.match(/^procjson:\/\/(.+?,.+?,.+)$/i);
	if(m) {
		if(m[1].substr(0, 1) != '[')
			m[1] = '[' + m[1] + ']';
		m = JSON.parse(m[1]);
		if(!Array.isArray(m) || m.length != 3)
			error('Invalid syntax for process input: ' + file);
		var ret = {
			name: m[0],
			size: m[1]|0,
			stream: function(cmd) {
				return execOpts(cmd, {stdio: ['ignore','pipe','ignore']}).stdout;
			}.bind(null, m[2])
		};
		if(!ret.size)
			error('Invalid size specified for process input: ' + file);
		return ret;
	}
	return file;
}), ulOpts, function(err) {
	if(err) {
		Nyuu.log.error(err);
		process.exit(2);
	} else {
		writeProgress = null;
		Nyuu.log.info('Process complete');
		setTimeout(function() {
			Nyuu.log.warn('Process did not terminate cleanly');
			process.exit(0);
		}, 5000).unref();
	}
});

// display some stats
var friendlySize = function(s) {
	var units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB'];
	for(var i=0; i<units.length; i++) {
		if(s < 10000) break;
		s /= 1024;
	}
	return (Math.round(s *100)/100) + ' ' + units[i];
};
var retArg = function(_) { return _; };
fuploader.once('start', function(files, uploader) {
	var totalSize = 0, totalPieces = 0, totalFiles = 0;
	for(var filename in files) {
		var sz = files[filename].size;
		totalSize += sz;
		totalPieces += Math.ceil(sz / ulOpts.articleSize);
		totalFiles++;
	}
	Nyuu.log.info('Uploading ' + totalPieces + ' article(s) from ' + totalFiles + ' file(s) totalling ' + friendlySize(totalSize));
	
	var startTime = Date.now();
	progress.forEach(function(prg) {
		switch(prg.type) {
			case 'log':
				setInterval(function() {
					Nyuu.log.info('Article posting progress: ' + uploader.articlesRead + ' read, ' + uploader.articlesPosted + ' posted, ' + uploader.articlesChecked + ' checked');
				}, prg.interval).unref();
			break;
			case 'stderr':
				writeProgress = function() {
					var perc = uploader.articlesChecked / totalPieces;
					var barSize = Math.floor(perc*50);
					var line = '='.repeat(barSize) + '-'.repeat(Math.floor(uploader.articlesPosted / totalPieces * 50) - barSize);
					// TODO: add speed indicator
					process.stderr.write(' ' + lpad(''+Math.round(perc*10000)/100, 6) + '% complete  [' + rpad(line, 50) + ']\x1b[0G');
				};
				setInterval(writeProgress, 1000).unref();
			break;
			case 'tcp':
			case 'http':
				var writeState = function(conn) {
					var now = Date.now();
					
					// TODO: JSON output etc
					conn.write([
						'Time: ' + (new Date(now)),
						'Start time: ' + (new Date(startTime)),
						'',
						'Total articles: ' + totalPieces,
						'Articles read: ' + uploader.articlesRead,
						'Articles posted: ' + uploader.articlesPosted,
						'Articles checked: ' + uploader.articlesChecked,
						'',
						'Post connections active: ' + uploader.postConnections.filter(retArg).length,
						'Check connections active: ' + uploader.checkConnections.filter(retArg).length,
						'',
						'Post queue size: ' + uploader.queue.queue.length + (uploader.queue.hasFinished ? ' (finished)' : ''),
						'Check queue size: ' + uploader.checkQueue.queue.length + ' + ' + uploader.checkQueue.pendingAdds + ' delayed' + (uploader.checkQueue.hasFinished ? ' (finished)' : ''),
						'', ''
					].join('\r\n'));
					
					var dumpConnections = function(conns) {
						var i = 0;
						conns.forEach(function(c) {
							conn.write('Connection #' + (++i) + '\r\n');
							if(c) {
								conn.write([
									'  State: ' + c.getCurrentActivity() + ' for ' + ((now - c.lastActivity)/1000) + 's',
									'  Transfer: ' + friendlySize(c.bytesRecv) + ' down / ' + friendlySize(c.bytesSent) + ' up',
									'  Requests: ' + c.numRequests + ' (' + c.numPosts + ' posts)',
									'  Reconnects: ' + (c.numConnects-1),
									'  Errors: ' + c.numErrors,
									'', ''
								].join('\r\n'));
							} else {
								conn.write('  State: finished\r\n\r\n')
							}
						});
					};
					if(uploader.postConnections.length) {
						conn.write('===== Post Connections\' Status =====\r\n');
						dumpConnections(uploader.postConnections);
					}
					if(uploader.checkConnections.length) {
						conn.write('===== Check Connections\' Status =====\r\n');
						dumpConnections(uploader.checkConnections);
					}
				};
				
				var server;
				if(prg.type == 'http') {
					server = require('http').createServer(function(req, resp) {
						var path = require('url').parse(req.url).pathname.replace(/\/$/, '');
						var m;
						if(m = path.match(/^\/(post|check)queue\/?$/)) {
							// dump post/check queue
							var isCheckQueue = (m[1] == 'check');
							resp.writeHead(200, {
								'Content-Type': 'text/plain'
							});
							var dumpPost = function(post) {
								if(isCheckQueue)
									resp.write('Message-ID: ' + post.messageId + '\r\n');
								resp.write([
									'Subject: ' + post.subject,
									'Body length: ' + post.data.length,
									'Post attempts: ' + post.postTries,
									''
								].join('\r\n'));
								if(isCheckQueue)
									resp.write('Check attempts: ' + post.chkFailures + '\r\n');
							};
							uploader[isCheckQueue ? 'checkQueue' : 'queue'].queue.forEach(function(post) {
								dumpPost(post);
								resp.write('\r\n');
							});
							if(isCheckQueue && uploader.checkQueue.pendingAdds) {
								resp.write('\r\n===== Delayed checks =====\r\n');
								for(var k in uploader.checkQueue.queuePending) {
									dumpPost(uploader.checkQueue.queuePending[k].data);
									resp.write('\r\n');
								}
							}
							resp.end();
						} else if(m = path.match(/^\/(check)queue\/([^/]+)\/?$/)) {
							// search queue for target post
							var q = uploader.checkQueue.queue;
							var post;
							for(var k in q) {
								if(q[k].messageId == m[2]) {
									post = q[k];
									break;
								}
							}
							if(!post) {
								// check deferred queue too
								var q = uploader.checkQueue.queuePending;
								for(var k in q) {
									if(q[k].data.messageId == m[2]) {
										post = q[k].data;
										break;
									}
								}
							}
							if(post) {
								// dump post from check queue
								resp.writeHead(200, {
									'Content-Type': 'message/rfc977' // our made up MIME type; follows similarly to SMTP mail
								});
								resp.write(post.headers.join('\r\n'));
								resp.write('\r\nMessage-ID: <' + post.messageId + '>\r\n\r\n');
								resp.write(post.data);
							} else {
								resp.writeHead(404, {
									'Content-Type': 'text/plain'
								});
								resp.write('Specified post not found in queue');
							}
							resp.end();
						} else if(!path || path == '/') {
							// dump overall status
							resp.writeHead(200, {
								'Content-Type': 'text/plain'
							});
							writeState(resp);
							resp.end();
						} else {
							resp.writeHead(404, {
								'Content-Type': 'text/plain'
							});
							resp.end('Invalid URL');
						}
					});
				} else {
					server = require('tcp').createServer(function(conn) {
						writeState(conn);
						conn.end();
					});
				}
				server.listen(prg.port, prg.host, function() {
					var addr = server.address();
					if(addr.family == 'IPv6')
						addr = '[' + addr.address + ']:' + addr.port;
					else
						addr = addr.address + ':' + addr.port;
					Nyuu.log.info('Status ' + prg.type.toUpperCase() + ' server listening on ' + addr);
				});
				server.unref();
			break;
		}
	});
});
fuploader.once('error', function(err) {
	throw err; // TODO: something better
});
fuploader.on('processing_file', function(file) {
	Nyuu.log.info('Reading file ' + file.name + '...');
})
fuploader.once('read_complete', function() {
	Nyuu.log.info('All file(s) read...');
});
