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
	'tcp-keep-alive': {
		type: 'time',
		map: 'server/tcpKeepAlive'
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
		type: 'time',
		map: 'server/timeout'
	},
	'connect-timeout': {
		type: 'time',
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
	'ignore-post-timeout': {
		type: 'bool',
		map: 'server/ignorePostTimeout'
	},
	'keep-alive': {
		type: 'bool',
		map: 'server/keepAlive'
	},
	'check-connections': {
		type: 'int',
		map: 'check/server/connections',
		alias: 'k'
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
		map: 'check/tries'
	},
	'check-group': {
		type: 'string',
		map: 'check/group'
	},
	'check-post-tries': {
		type: 'int',
		map: 'check/postRetries'
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
		type: 'time',
		map: 'check/server/timeout'
	},
	'check-connect-timeout': {
		type: 'time',
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
	'check-keep-alive': {
		type: 'bool',
		map: 'check/server/keepAlive'
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
	date: {
		type: 'string',
		map: 'postDate'
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
	overwrite: {
		type: 'bool',
		alias: 'O'
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
		type: 'int',
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
	'use-post-pool': {
		type: 'bool',
		map: 'useBufferPool'
	},
	'preload-modules': {
		type: 'bool'
	},
	'use-lazy-connect': {
		type: 'bool',
		map: 'useLazyConnect'
	},
	'skip-errors': {
		type: 'string',
		alias: 'e'
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
	},
	config: {
		type: 'string',
		alias: 'C'
	}
};


// build minimist's option map
var mOpts = {string: [], boolean: [], alias: {}, default: {}};
for(var k in optMap) {
	var o = optMap[k];
	if(o.type == 'bool') {
		mOpts.boolean.push(k);
		mOpts.default[k] = null; // prevent minimist from setting this as false
	} else
		mOpts.string.push(k);
	
	if(o.alias) {
		mOpts.alias[o.alias] = k;
	}
}


var argv = require('minimist')(process.argv.slice(2), mOpts);


if(argv.help) {
	console.error(require('fs').readFileSync(__dirname + '/../help.txt').toString().replace(/^Nyuu\n/, 'Nyuu v' + require('../package.json').version + '\n'));
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
if(argv.config) {
	// TODO: allow proc:// or json:// ?
	var cOpts = require(require('fs').realpathSync(argv.config));
	require('../lib/util').deepMerge(ulOpts, cOpts);
}

for(var k in argv) {
	if(k == '_') continue;
	var v = argv[k];
	
	if(k in mOpts.alias) continue; // ignore minimist's annoying behaviour of setting aliased options
	if(!(k in optMap))
		error('Unknown option `' + k + '`');
	
	var o = optMap[k];
	if(o.type == 'bool' && v === null) continue; // hack to get around minimist forcing unset values to be false
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

if(argv['skip-errors']) {
	if(argv['skip-errors'].toLowerCase() == 'all')
		ulOpts.skipErrors = true;
	else
		ulOpts.skipErrors = argv['skip-errors'].split(',').map(function(s) {
			return s.trim().toLowerCase();
		});
}

if((typeof argv.date == 'string') && argv.date.toLowerCase() == 'now') {
	ulOpts.postDate = Date.now();
}

var connOptMap = {
	'ignore-cert': function(o, v) {
		o.rejectUnauthorized = !v;
	},
	ipv6: function(o, v) {
		o.family = v ? 6 : undefined;
	},
	host: function(o, v) {
		if(v.match(/^unix:/i))
			o.path = v.substr(5);
		else
			o.host = v;
	}
};
for(var k in connOptMap) {
	if(argv[k] !== null && argv[k] !== undefined)
		connOptMap[k](ulOpts.server.connect, argv[k]);
	if(argv['check-'+k] !== null && argv['check-'+k] !== undefined)
		connOptMap[k](ulOpts.check.server.connect, argv['check-'+k]);
}

var processes;
var processStart = function() {
	if(!processes) processes = new (require('../lib/procman'))();
	return processes.start.apply(processes, arguments);
};

if(argv.out) {
	if(argv.out === '-')
		ulOpts.nzb.writeTo = process.stdout;
	else if(argv.out.match(/^proc:\/\//i)) {
		ulOpts.nzb.writeTo = function(cmd) {
			return processStart(cmd, {stdio: ['pipe','ignore','ignore']}).stdin;
			// if process exits early, the write stream should break and throw an error
		}.bind(null, argv.out.substr(7));
	}
}
if(argv.overwrite !== null)
	ulOpts.nzb.writeOpts.flags = argv.overwrite ? 'w' : 'wx';

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

if(argv['preload-modules']) {
	if(ulOpts.server.secure || ulOpts.check.server.secure)
		require('tls'); // will require('net') as well
	else
		require('net');
	// we won't consider modules loaded by the UploadManager constructor (zlib/xz, nzbbuffer, bufferpool, procman) as 'too late', since it occurs before the 'start' event is fired, hence won't bother preloading these here
}


// custom validation rules
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
		return '[' + (new Date(Date.now() - tzOffset)).toISOString().replace('T', ' ').replace('Z', '') + ']' + addSpace;
	};
} else {
	logTimestamp = function(){ return ''; };
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
				
				if(argv['preload-modules']) {
					if(type == 'http') {
						require('http');
						require('url');
					} else {
						require('net');
					}
				}
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

var repeatChar = function(c, l) {
	if(c.repeat) return c.repeat(l);
	var buf = new Buffer(l);
	buf.fill(c);
	return buf.toString();
};
var lpad = function(s, l, c) {
	if(s.length > l) return s;
	return repeatChar((c || ' '), l-s.length) + s;
};
var rpad = function(s, l, c) {
	if(s.length > l) return s;
	return s + repeatChar((c || ' '), l-s.length);
};

var logger, errorCount = 0;
var getProcessIndicator = null;
var writeNewline = function() {
	process.stderr.write('\n');
};
var clrRow = stdErrProgress ? '\x1b[0G\x1B[0K' : '';
if(process.stderr.isTTY) {
	var writeLog = function(col, msg) {
		process.stderr.write(
			clrRow + '\x1B['+col+'m' + logTimestamp(' ') + msg.toString() + '\x1B[39m\n'
			+ (getProcessIndicator ? getProcessIndicator() : '')
		);
	};
	// assume colours are supported
	logger = {
		debug: function(msg) {
			writeLog('36', msg);
		},
		info: function(msg) {
			writeLog('32', msg);
		},
		warn: function(msg) {
			writeLog('33', msg);
		},
		error: function(msg) {
			writeLog('31', msg);
			errorCount++;
		}
	};
} else {
	var writeLog = function(type, msg) {
		process.stderr.write(
			clrRow + logTimestamp('') + type + ' ' + msg.toString() + '\n'
		);
	};
	logger = {
		debug: function(msg) {
			writeLog('[DBG] ', msg);
		},
		info: function(msg) {
			writeLog('[INFO]', msg);
		},
		warn: function(msg) {
			writeLog('[WARN]', msg);
		},
		error: function(msg) {
			writeLog('[ERR] ', msg);
			errorCount++;
		}
	};
}

var isNode010 = process.version.match(/^v0\.10\./);

if(verbosity < 4) logger.debug = function(){};
if(verbosity < 3) logger.info = function(){};
if(verbosity < 2) logger.warn = function(){};
if(verbosity < 1) {
	logger.error = function(){errorCount++;};
	// suppress output from uncaught exceptions
	process.once('uncaughtException', function(err) {
		process.exit(isNode010 ? 8 : 1);
	});
}

var displayCompleteMessage = function() {
	if(errorCount)
		Nyuu.log.info('Process complete, with ' + errorCount + ' error(s)');
	else
		Nyuu.log.info('Process complete');
};

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
				return processStart(cmd, {stdio: ['ignore','pipe','ignore']}).stdout;
			}.bind(null, m[2])
		};
		if(!ret.size)
			error('Invalid size specified for process input: ' + file);
		if(argv['preload-modules']) {
			require('../lib/procman');
			require('../lib/streamreader');
		}
		return ret;
	} else {
		if(argv['preload-modules'])
			require('../lib/filereader');
	}
	return file;
}), ulOpts, function(err) {
	var setRtnCode = function(code) {
		if(isNode010 && (!processes || !processes.running)) // .exitCode not available in node 0.10.x
			process.exit(code);
		else
			process.exitCode = code;
	};
	if(getProcessIndicator)
		process.removeListener('exit', writeNewline);
	getProcessIndicator = null;
	process.emit('finished');
	if(err) {
		Nyuu.log.error(err);
		setRtnCode(33);
	} else {
		displayCompleteMessage();
		if(errorCount)
			setRtnCode(32);
		else
			process.exitCode = 0;
	}
	(function(cb) {
		if(processes && processes.running) {
			var procWarnTO = setTimeout(function() {
				Nyuu.log.info(processes.running + ' external process(es) are still running; Nyuu will exit when these do');
			}, 1000).unref();
			processes.onEnd(function() {
				clearTimeout(procWarnTO);
				cb();
			});
		} else cb();
	})(function() {
		if(isNode010 && process.exitCode) process.exit(process.exitCode);
		setTimeout(function() {
			Nyuu.log.warn('Process did not terminate cleanly');
			process.exit();
		}, 5000).unref();
	});
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
var decimalPoint = ('' + 1.1).replace(/1/g, '');
var friendlyTime = function(t) {
	var days = (t / 86400000) | 0;
	t %= 86400000;
	var seg = [];
	[3600000, 60000, 1000].forEach(function(s) {
		seg.push(lpad('' + ((t / s) | 0), 2, '0'));
		t %= s;
	});
	return (days ? days + 'd,' : '') + seg.join(':') + decimalPoint + lpad(t + '', 3, '0');
};
var retArg = function(_) { return _; };
fuploader.once('start', function(files, _uploader) {
	var totalSize = 0, totalPieces = 0, totalFiles = 0;
	for(var filename in files) {
		var sz = files[filename].size;
		totalSize += sz;
		totalPieces += Math.ceil(sz / ulOpts.articleSize);
		totalFiles++;
	}
	Nyuu.log.info('Uploading ' + totalPieces + ' article(s) from ' + totalFiles + ' file(s) totalling ' + friendlySize(totalSize));
	
	var uploader = _uploader.uploader;
	var startTime = Date.now();
	progress.forEach(function(prg) {
		switch(prg.type) {
			case 'log':
				var logInterval = setInterval(function() {
					Nyuu.log.info('Article posting progress: ' + uploader.articlesRead + ' read, ' + uploader.articlesPosted + ' posted, ' + uploader.articlesChecked + ' checked');
				}, prg.interval);
				logInterval.unref();
				process.on('finished', function() {
					clearInterval(logInterval);
				});
			break;
			case 'stderr':
				if(getProcessIndicator) break; // no need to double output =P
				var postedSamples = [0];
				getProcessIndicator = function() {
					var chkPerc = uploader.articlesChecked / totalPieces,
					    pstPerc = uploader.articlesPosted / totalPieces;
					var barSize = Math.floor(chkPerc*50);
					var line = repeatChar('=', barSize) + repeatChar('-', Math.floor(pstPerc * 50) - barSize);
					
					// calculate speed over last 4s
					var speed = uploader.bytesPosted; // for first sample, just use current overall progress
					if(postedSamples.length >= 2) {
						speed = (postedSamples[postedSamples.length-1] - postedSamples[0]) / (postedSamples.length-1);
					}
					
					return '\x1b[0G\x1B[0K ' + lpad(''+Math.round((chkPerc+pstPerc)*5000)/100, 6) + '%  [' + rpad(line, 50) + '] ' + friendlySize(speed) + '/s';
				};
				var seInterval = setInterval(function() {
					process.stderr.write(getProcessIndicator());
					postedSamples.push(uploader.bytesPosted);
					if(postedSamples.length >= 4) // maintain max 4 samples
						postedSamples.shift();
				}, 1000);
				seInterval.unref();
				process.on('finished', function() {
					clearInterval(seInterval);
				});
				// if unexpected exit, force a newline to prevent some possible terminal corruption
				process.on('exit', writeNewline);
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
						'Errors skipped: ' + errorCount + ' across ' + uploader.articleErrors + ' article(s)',
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
									'  State: ' + c.getCurrentActivity() + (c.lastActivity ? ' for ' + ((now - c.lastActivity)/1000) + 's' : ''),
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
					var url = require('url');
					server = require('http').createServer(function(req, resp) {
						var path = url.parse(req.url).pathname.replace(/\/$/, '');
						var m;
						if(m = path.match(/^\/(post|check)queue\/?$/)) {
							// dump post/check queue
							var isCheckQueue = (m[1] == 'check');
							resp.writeHead(200, {
								'Content-Type': 'text/plain'
							});
							var dumpPost = function(post) {
								resp.write([
									'Message-ID: ' + post.messageId,
									'Subject: ' + post.headers.subject,
									'Body length: ' + post.postLen,
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
					server = require('net').createServer(function(conn) {
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
				process.on('finished', function() {
					server.close();
				});
			break;
		}
	});
	
	displayCompleteMessage = function() {
		var msg = 'Process complete';
		if(errorCount)
			msg += ', with ' + errorCount + ' error(s) across ' + uploader.articleErrors + ' post(s)';
		
		var time = Date.now() - startTime;
		Nyuu.log.info(msg + '. Uploaded ' + friendlySize(totalSize) + ' in ' + friendlyTime(time) + ' (' + friendlySize(totalSize/time*1000) + '/s)');
		
	};
});
fuploader.on('processing_file', function(file) {
	Nyuu.log.info('Reading file ' + file.name + '...');
})
fuploader.once('read_complete', function() {
	Nyuu.log.info('All file(s) read...');
});
