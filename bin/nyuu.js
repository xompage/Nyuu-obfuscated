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
	},
	'no-check-cert': {
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
		map: 'connections'
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
	'post-retries': {
		type: 'int',
		map: 'server/postRetries'
	},
	'check-connections': {
		type: 'int',
		map: 'check/connections'
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
	'check-onfail': {
		type: 'string',
		map: 'check/failAction'
	},
	'check-host': {
		type: 'string'
	},
	'check-port': {
		type: 'int',
		map: 'check/server/port'
	},
	'check-bind-host': {
		type: 'string',
		map: 'check/server/localAddress'
	},
	'check-ipv6': {
		type: 'bool'
	},
	'check-ssl': {
		type: 'bool',
		map: 'check/server/secure',
	},
	'check-no-check-cert': {
		type: 'bool'
	},
	'check-sni-host': {
		type: 'string',
		map: 'check/server/servername'
	},
	'check-ssl-ciphers': {
		type: 'string',
		map: 'check/server/ciphers'
	},
	'check-ssl-method': {
		type: 'string',
		map: 'check/server/secureProtocol'
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
		map: 'check/maxBuffer'
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
		switch(parts[2].toUpperCase()) {
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
	'no-check-cert': function(o) {
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
		connOptMap[k](ulOpts.check.server, argv['check-'+k]);
}
if(argv.out === '-')
	ulOpts.nzb.writeTo = process.stdout;
else if(argv.out.match(/^proc:\/\//i)) {
	ulOpts.nzb.writeTo = function(cmd) {
		var spawn = require('child_process').spawn;
		var opts = {stdio: ['pipe','ignore','ignore']};
		if(process.platform === 'win32') {
			opts.windowsVerbatimArguments = true;
			return spawn(process.env.comspec || 'cmd.exe', ['/s', '/c', '"' + cmd + '"'], opts).stdin;
		} else {
			return spawn('/bin/sh', ['-c', cmd], opts).stdin;
		}
		// if process exits early, the write stream should break and throw an error
	}.bind(null, argv.out.substr(7));
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

var logger;
if(process.stderr.isTTY) {
	// assume colours are supported
	logger = {
		debug: function(msg) {
			process.stderr.write('\x1B[36m');
			logTimestamp(1);
			console.error(msg);
			process.stderr.write('\x1B[39m');
		},
		info: function(msg) {
			process.stderr.write('\x1B[32m');
			logTimestamp(1);
			console.error(msg);
			process.stderr.write('\x1B[39m');
		},
		warn: function(msg) {
			process.stderr.write('\x1B[33m');
			logTimestamp(1);
			console.error(msg);
			process.stderr.write('\x1B[39m');
		},
		error: function(msg) {
			process.stderr.write('\x1B[31m');
			logTimestamp(1);
			console.error(msg);
			process.stderr.write('\x1B[39m');
		}
	};
} else {
	logger = {
		debug: function(msg) {
			logTimestamp();
			process.stderr.write('[DBG]  ');
			console.error(msg);
		},
		info: function(msg) {
			logTimestamp();
			process.stderr.write('[INFO] ');
			console.error(msg);
		},
		warn: function(msg) {
			logTimestamp();
			process.stderr.write('[WARN] ');
			console.error(msg);
		},
		error: function(msg) {
			logTimestamp();
			process.stderr.write('[ERR]  ');
			console.error(msg);
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
Nyuu.upload(argv._, ulOpts, function(err) {
	if(err) {
		Nyuu.log.error(err);
		process.exit(2);
	} else {
		Nyuu.log.info('Process complete');
	}
});
