#!/usr/bin/env node

"use strict";
process.title = 'Nyuu';


var optMap = {
	host: {
		type: 'string',
		alias: 'h',
		map: 'server/connect/host'
	},
	port: {
		type: 'int',
		alias: 'P',
		map: 'server/connect/port'
	},
	ssl: {
		type: 'bool',
		map: 'server/secure',
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
		map: 'headerCheck/connections'
	},
	'check-reuse-conn': {
		type: 'bool',
		map: 'headerCheck/ulConnReuse'
	},
	'check-delay': {
		type: 'time',
		map: 'headerCheck/checkDelay'
	},
	'check-retry-delay': {
		type: 'time',
		map: 'headerCheck/recheckDelay'
	},
	'check-tries': {
		type: 'int',
		map: 'headerCheck/tries',
		alias: 'c'
	},
	'check-group': {
		type: 'string',
		map: 'headerCheck/group'
	},
	'check-onfail': {
		type: 'string',
		map: 'headerCheck/failAction'
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
		map: 'comment'
	},
	comment2: {
		type: 'string',
		map: 'comment2'
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
	meta: {
		type: 'map',
		alias: 'M'
	},
	subdirs: {
		type: 'string',
		alias: 'r',
		map: 'subdirs'
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
		for(var i=0; i<path.length-1; i++)
			config = config[path[i]];
		config[path.slice(-1)] = v;
	}
}

if(argv.subject) {
	ulOpts.postHeaders.Subject = function(comment, comment2, filename, filesize, part, parts, size) {
		return argv.subject.replace(/\{(comment2?|filename|filesize|parts?|size)\}/ig, function(p) {
			switch(p[1].toLowerCase()) {
				case 'comment': return comment;
				case 'comment2': return comment2;
				case 'filename': return filename;
				case 'filesize': return filesize;
				case 'part': return part;
				case 'parts': return parts;
				case 'size': return size;
			}
		});
	};
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
if(!argv.host)                  error('Server host must be supplied');
if(!argv._.length)              error('Must supply at least one input file');
if(argv.subdirs && ['skip','keep'].indexOf(argv.subdirs) < 0)
	error('Invalid option supplied for `--subdirs`');
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
	} else {
		Nyuu.log.info('Process complete');
	}
});
