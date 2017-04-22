#!/usr/bin/env node

"use strict";
process.title = 'Nyuu';

var fs = require('fs');
var util = require('../lib/util');
var error = function(msg) {
	console.error(msg);
	console.error('Enter `nyuu --help` or `nyuu --help-full` for usage information');
	process.exit(1);
};
var processes;
var processStart = function() {
	if(!processes) processes = new (require('../lib/procman'))();
	return processes.start.apply(processes, arguments);
};

var servOptMap = {
	host: {
		type: 'string',
		alias: 'h'
	},
	port: {
		type: 'int',
		alias: 'P',
		keyMap: 'connect/port'
	},
	'bind-host': {
		type: 'string',
		keyMap: 'connect/localAddress',
		ifSetDefault: ''
	},
	'tcp-keep-alive': {
		type: 'time',
		keyMap: 'tcpKeepAlive',
		ifSetDefault: '30s'
	},
	ipv6: {
		type: 'bool',
		keyMap: 'connect/family',
		fn: function(v) {
			return v ? 6 : undefined;
		},
		alias: '6'
	},
	ssl: {
		type: 'bool',
		keyMap: 'secure',
		alias: 'S'
	},
	'ignore-cert': {
		type: 'bool',
		keyMap: 'connect/rejectUnauthorized',
		fn: function(v) {
			return !v;
		}
	},
	'sni-host': {
		type: 'string',
		keyMap: 'connect/servername',
		ifSetDefault: ''
	},
	'ssl-ciphers': {
		type: 'string',
		keyMap: 'connect/ciphers',
		ifSetDefault: ''
	},
	'ssl-method': {
		type: 'string',
		keyMap: 'connect/secureProtocol',
		ifSetDefault: ''
	},
	user: {
		type: 'string',
		alias: 'u',
		keyMap: 'user',
		ifSetDefault: ''
	},
	password: {
		type: 'string',
		alias: 'p',
		keyMap: 'password',
		ifSetDefault: ''
	},
	timeout: {
		type: 'time',
		keyMap: 'timeout'
	},
	'connect-timeout': {
		type: 'time',
		keyMap: 'connTimeout'
	},
	'post-timeout': {
		type: 'time',
		keyMap: 'postTimeout'
	},
	'reconnect-delay': {
		type: 'time',
		keyMap: 'reconnectDelay'
	},
	'connect-retries': {
		type: 'int',
		keyMap: 'connectRetries'
	},
	'request-retries': {
		type: 'int',
		keyMap: 'requestRetries'
	},
	'post-retries': {
		type: 'int',
		postOnly: true,
		keyMap: 'postRetries'
	},
	'error-teardown': {
		type: 'bool',
		keyMap: 'errorTeardown'
	},
	'disconnect-timeout': {
		type: 'time',
		keyMap: 'closeTimeout'
	},
	'on-post-timeout': {
		type: 'list',
		postOnly: true,
		keyMap: 'onPostTimeout',
		fn: function(v) {
			if(!v) return;
			return v.map(function(s) {
				if(s != 'retry' && s != 'ignore' && !s.match(/^strip-hdr=./))
					error('Unknown value for `on-post-timeout`: ' + s);
				return s;
			});
		}
	},
	'keep-alive': {
		type: 'bool',
		keyMap: 'keepAlive'
	},
	'post-chunk-size': {
		type: 'size',
		keyMap: 'uploadChunkSize',
		ifSetDefault: '192K'
	},
	connections: {
		type: 'int',
		alias: 'n',
		checkAlias: 'k'
	},
};

var optMap = {
	/*'check-reuse-conn': {
		type: 'bool',
		map: 'check/ulConnReuse'
	},*/
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
		map: 'check/group',
		ifSetDefault: ''
	},
	'check-post-tries': {
		type: 'int',
		map: 'check/postRetries'
	},
	'article-size': {
		type: 'size',
		alias: 'a',
		map: 'articleSize'
	},
	'article-line-size': {
		type: 'int',
		map: 'bytesPerLine',
		fn: function(v) {
			if(v < 1) error('Invalid value for `article-line-size`');
			return v;
		}
	},
	comment: {
		type: 'string',
		alias: 't',
		map: 'comment',
		ifSetDefault: ''
	},
	comment2: {
		type: 'string',
		map: 'comment2',
		ifSetDefault: ''
	},
	date: {
		type: 'string',
		map: 'postDate',
		ifSetDefault: '',
		fn: function(v) {
			if((typeof v == 'string') && v.toLowerCase() == 'now')
				return Date.now();
			return v;
		}
	},
	'keep-message-id': {
		type: 'bool',
		map: 'keepMessageId'
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
		alias: 's',
		map: 'postHeaders/Subject',
		fn: function(v) {
			if(!v) return;
			return function(filenum, filenumtotal, filename, filesize, part, parts, size) {
				return v.replace(/\{(filenum|files|filename|filesize|parts?|size)\}/ig, function(m, token) {
					switch(token.toLowerCase()) {
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
		map: 'nzb/writeTo',
		fn: function(v) {
			if(v === '-')
				return process.stdout;
			else if(v && v.match(/^proc:\/\//i)) {
				return function(cmd) {
					return processStart(cmd, {stdio: ['pipe','ignore','ignore']}).stdin;
					// if process exits early, the write stream should break and throw an error
				}.bind(null, v.substr(7));
			}
			return v;
		}
	},
	minify: {
		type: 'bool',
		map: 'nzb/minify'
	},
	'nzb-compress': {
		type: 'string',
		map: 'nzb/compression',
		ifSetDefault: 'gzip',
		fn: function(v) {
			if(v && ['gzip','zlib','deflate','xz'].indexOf(v) < 0)
				error('Invalid value supplied for `nzb-compress`');
			return v;
		}
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
		alias: 'O',
		map: 'nzb/writeOpts/flags',
		fn: function(v) {
			return v ? 'w' : 'wx';
		}
	},
	meta: {
		type: 'map',
		alias: 'M'
	},
	'nzb-cork': {
		type: 'bool',
		map: 'nzb/corkOutput'
	},
	subdirs: {
		type: 'string',
		alias: 'r',
		map: 'subdirs',
		ifSetDefault: 'keep',
		fn: function(v) {
			if(!v) return 'skip';
			if(['skip','keep'].indexOf(v) < 0)
				error('Invalid option supplied for `subdirs`');
			return v;
		}
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
	'check-queue-cache': {
		type: 'int',
		map: 'check/queueCache'
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
		type: 'list',
		alias: 'e',
		map: 'skipErrors',
		ifSetDefault: 'all',
		fn: function(v) {
			if(!v) return false;
			if(v.indexOf('all') >= 0)
				return true;
			return v;
		}
	},
	'post-error-limit': {
		type: 'int',
		map: 'maxPostErrors'
	},
	'dump-failed-posts': {
		type: 'string',
		map: 'dumpPostLoc',
		ifSetDefault: ''
	},
	'input-raw-posts': {
		type: 'bool'
	},
	'delete-raw-posts': {
		type: 'bool',
		map: 'deleteRawPosts'
	},
	'copy-input': {
		type: 'string'
	},
	'copy-include': {
		type: 'string'
	},
	'copy-exclude': {
		type: 'string'
	},
	'copy-queue-size': {
		type: 'int',
		map: 'copyQueueBuffer'
	},
	
	help: {
		type: 'bool',
		alias: '?'
	},
	'help-full': {
		type: 'bool'
	},
	version: {
		type: 'bool'
	},
	'package-info': {
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

for(var k in servOptMap) {
	var o = servOptMap[k];
	optMap[k] = o;
	if(!o.postOnly) {
		var o2 = util.extend({}, o);
		delete o2.alias;
		if(o2.checkAlias) o2.alias = o2.checkAlias;
		optMap['check-' + k] = o2;
	}
}


var argv;
try {
	argv = require('../lib/arg_parser.js')(process.argv.slice(2), optMap);
} catch(x) {
	error(x.message);
}
var isNode010 = process.version.match(/^v0\.10\./);


if(argv['help-full'] || argv.help) {
	var helpText;
	try {
		// for embedding help text
		helpText = require('./help.json')[argv['help-full'] ? 'full':'short'];
	} catch(x) {
		helpText = fs.readFileSync(__dirname + '/../help' + (argv['help-full'] ? '':'-short') + '.txt').toString();
	}
	console.error(helpText.replace(/^Nyuu(\r?\n)/, 'Nyuu v' + require('../package.json').version + '$1'));
	process.exit(0);
}
if(argv.version) {
	console.error(require('../package.json').version);
	process.exit(0);
}
if(argv['package-info']) {
	var pc = require('../package.json');
	var parsePackage = function(p) {
		var r = {};
		['version','description','license','author','homepage'].forEach(function(e) {
			if(e in p) r[e] = p[e];
		});
		return r;
	};
	
	// can't search package.json for dependencies (pc.dependencies) and use a loop, because nexe won't include it; TODO: fix this
	var modules = {
		nyuu: parsePackage(pc),
		async: parsePackage(require('../node_modules/async/package.json')),
		yencode: parsePackage(require('../node_modules/yencode/package.json')),
	};
	try {
		modules.xz = parsePackage(require('../node_modules/xz/package.json'));
	} catch(x) {}
	try {
		modules.nexe = parsePackage(require('../node_modules/nexe/package.json'));
	} catch(x) {}
	var m = {
		'Packages': modules,
		'Node Component Versions': process.versions,
		'Architecture': {arch: process.arch, platform: process.platform},
		//'Node Release': process.release,
		//'Node Features': process.features,
		'Node Compilation Config': process.config
	};
	
	for(var i in m) {
		console.error('\n' + i + ':');
		process.stderr.write(require('util').inspect(m[i], {colors: process.stderr.isTTY}) + '\n');
	}
	process.exit(0);
}


var evalConfig = function(data, filename) {
	var sandbox = util.extend({}, global);
	sandbox.module = {
		id: filename,
		exports: {},
		parent: module,
		filename: filename,
		children: [],
		paths: module.paths
	};
	sandbox.exports = sandbox.module.exports;
	sandbox.require = require;
	sandbox.global = sandbox;
	
	// add some handy shortcuts (like REPL)
	require('repl')._builtinLibs.forEach(function(m) {
		Object.defineProperty(sandbox, m, {
			get: function() {
				return sandbox[m] = require(m);
			},
			set: function(val) {
				delete sandbox[m];
				sandbox[m] = val;
			},
			configurable: true
		});
	});
	sandbox.__nyuu_pkg = require('../package.json'); // kinda necessary in nexe builds, since package.json doesn't exist there
	
	require('vm').runInNewContext(data, sandbox, isNode010 ? filename : {filename: filename});
	return sandbox.module.exports;
};

var ulOpts = require('../config.js');
if(argv.config || process.env.NYUU_CONFIG) {
	// TODO: allow proc:// or json:// ?
	var confFile = argv.config || process.env.NYUU_CONFIG;
	var confData = fs.readFileSync(confFile).toString();
	
	// try to determine type of config file from heuristics
	var confType;
	if(confFile.match(/\.json$/i))
		confType = 'json';
	else if(confFile.match(/\.js$/i))
		confType = 'js';
	else if(confData.trim().substr(0, 1) == '{')
		confType = 'json';
	else if(confData.match(/(^|[^a-zA-Z0-9])exports[^a-zA-Z0-9]/))
		confType = 'js';
	
	var cOpts;
	if(confType == 'json')
		cOpts = JSON.parse(confData);
	else if(confType == 'js')
		cOpts = evalConfig(confData, confFile);
	else
		error('Invalid config data supplied');
	
	if(cOpts.isFullConfig && confType == 'js') {
		if(cOpts.servers) {
			// for the default setup of one upload server, but multiple specified in custom config, duplicate the default setup for each custom server
			if(ulOpts.servers.length == 1 && cOpts.servers.length > 1) {
				var srv = JSON.stringify(ulOpts.servers[0]);
				for(var i = 1; i < cOpts.servers.length; i++)
					ulOpts.servers[i] = JSON.parse(srv);
			}
			if(ulOpts.servers.length == cOpts.servers.length) {
				// merge server options one by one
				ulOpts.servers.forEach(function(server, i) {
					util.deepMerge(server, cOpts.servers[i]);
				});
				delete cOpts.servers; // don't merge this any more
			}
		}
		util.deepMerge(ulOpts, cOpts);
	} else {
		// simple config format, just set unset CLI args
		cOpts = require('../lib/arg_parser.js')(cOpts, optMap);
		
		// allow --quiet or --verbose to override whatever is specified in the config, without error
		if(argv.quiet || argv.verbose) {
			delete cOpts.quiet;
			delete cOpts.verbose;
		}
		for(var k in cOpts) {
			if(!(k in argv))
				argv[k] = cOpts[k];
		}
	}
}

var setPathedVal = function(base, key, val) {
	var path = key.split('/');
	var obj = base;
	for(var i=0; i<path.length-1; i++) {
		if(!(path[i] in obj))
			obj[path[i]] = {};
		obj = obj[path[i]];
	}
	obj[path.slice(-1)[0]] = val;
};

for(var k in argv) {
	var o = optMap[k];
	if(o && o.map)
		setPathedVal(ulOpts, o.map, argv[k]);
}


// handle server options mess
if(!ulOpts.servers || ulOpts.servers.length < 1)
	ulOpts.servers = [{}];

// check if postConnections/checkConnections is set in the config, if so, we assume that those servers are marked for posting/checking, otherwise, assume that all servers are fair game
var defNumConnPost = 0, defNumConnCheck = 0;
ulOpts.servers.forEach(function(server) {
	defNumConnPost += server.postConnections;
	defNumConnCheck += server.checkConnections;
	if(server.ulConnReuse)
		defNumConnCheck += server.postConnections;
});

var servOptHelper = function(k, val, type, servers) {
	if(val === null || val === undefined) return;
	
	var o = servOptMap[k];
	var key = o.keyMap;
	if(!key) switch(k) {
		case 'connections':
			key = type + 'Connections';
		break;
		case 'host':
			if(val.match(/^unix:/i)) {
				key = 'connect/path';
				val  = val.substr(5);
			} else
				key = 'connect/host';
		break;
		default:
			throw new Error('Unhandled server setting `' + k + '`');
	}
	
	servers.forEach(function(server) {
		setPathedVal(server, key, o.fn ? o.fn(val, server) : val);
	});
};
var checkOverrides = false;
for(var k in servOptMap) {
	servOptHelper(k, argv[k], 'post', ulOpts.servers.filter(function(server) {
		// set options if posting is (or will be) enabled
		return (!defNumConnPost && argv.connections) || server.postConnections;
	}));
	if(argv['check-' + k] !== null && argv['check-' + k] !== undefined) {
		if(k == 'connections') {
			// connections is special in that it's not an override
			ulOpts.servers.forEach(function(server) {
				if(!defNumConnCheck || server.checkConnections)
					server.checkConnections = argv['check-' + k];
			});
		} else {
			checkOverrides = true;
		}
	}
}
if(checkOverrides && argv['check-connections'] !== 0 && (defNumConnCheck || argv['check-connections'])) {
	// go through servers, find ones with check connections enabled, and split out
	var chkServ = [], addServ = [];
	ulOpts.servers.forEach(function(server) {
		if(!defNumConnCheck || server.checkConnections) {
			if(server.postConnections) {
				// split this server into two parts - one for checking, other for posting
				var copy = JSON.parse(JSON.stringify(server));
				copy.postConnections = 0;
				chkServ.push(copy);
				addServ.push(copy);
				server.checkConnections = 0;
			} else {
				// this server is only used for checking, no need to split
				chkServ.push(server);
			}
		}
	});
	
	for(var k in servOptMap) {
		servOptHelper(k, argv['check-' + k], 'check', chkServ);
	}
	
	ulOpts.servers = ulOpts.servers.concat(addServ);
}


if(argv['dump-failed-posts']) {
	try {
		if(fs.statSync(argv['dump-failed-posts']).isDirectory()) {
			// if supplied a folder, append a directory separator if not supplied
			var sep = require('path').sep;
			if(ulOpts.dumpPostLoc.substr(-1) != sep)
				ulOpts.dumpPostLoc += sep;
		}
	} catch(x) {}
}

if(argv['copy-input']) {
	var copyIncl, copyExcl, copyTarget = argv['copy-input'];
	var reFlags = process.platform == 'win32' ? 'i' : '';
	if(argv['copy-include'])
		copyIncl = new RegExp(argv['copy-include'], reFlags);
	if(argv['copy-exclude'])
		copyExcl = new RegExp(argv['copy-exclude'], reFlags);
	
	var copyProc = copyTarget.match(/^proc:\/\//i);
	if(copyProc)
		copyTarget = copyTarget.substr(7);
	
	ulOpts.inputCopy = function(filename, size) {
		if(copyIncl && !filename.match(copyIncl)) return;
		if(copyExcl && filename.match(copyExcl)) return;
		
		var target = copyTarget.replace(/\{(filename|size)\}/ig, function(m, token) {
			return token == 'filename' ? filename : size;
		});
		if(copyProc) {
			return processStart(target, {stdio: ['pipe','ignore','ignore']}).stdin;
		} else {
			return fs.createWriteStream(target);
		}
	};
}

// map custom headers
if(argv.header) {
	// to preserve case, build case-insensitive lookup
	var headerCMap = {};
	for(var k in ulOpts.postHeaders)
		headerCMap[k.toLowerCase()] = k;
	
	for(var k in argv.header) {
		// handle casing wierdness
		var kk = headerCMap[k.toLowerCase()];
		if(!kk) {
			headerCMap[k.toLowerCase()] = kk = k;
		}
		ulOpts.postHeaders[kk] = argv.header[k];
	}
}

// map custom meta tags
if(argv.meta) util.extend(ulOpts.nzb.metaData, argv.meta);

if(argv['preload-modules']) {
	require('net'); // tls requires it, so may as well...
	ulOpts.servers.forEach(function(server) {
		if(server.secure) require('tls');
	});
	// we won't consider modules loaded by the UploadManager constructor (zlib/xz, nzbbuffer, bufferpool, procman) as 'too late', since it occurs before the 'start' event is fired, hence won't bother preloading these here
}

// if doing raw posts, default keepMessageId to true
if(argv['input-raw-posts'] && argv['keep-message-id'] !== false)
	ulOpts.keepMessageId = true;

// custom validation rules
if(!argv._.length)                  error('Must supply at least one input file');
// TODO: more validation

if(argv.quiet && argv.verbose)
	error('Cannot specify both `quiet` and `verbose`');

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
var stdErrProgress = false, usingProgressIndicator = false;
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
			case 'stderrx':
				stdErrProgress = true;
			case 'stdout':
			case 'stdoutx':
				if(usingProgressIndicator) error('Can only specify one of stderr/x and stdout/x');
				usingProgressIndicator = true;
				progress.push({type: type});
				
				if(argv['preload-modules'])
					require('../lib/progrec');
			break;
			case 'tcp':
			case 'http':
				var o = {type: type, port: 0};
				if(arg.substr(0, 5) == 'unix:') {
					o.socket = arg.substr(5);
				} else if(m = arg.match(/^([a-z0-9\-.]*|\[[a-f0-9:]+\]):(\d*)$/i)) {
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

var getProcessIndicator = null;
var writeNewline = function() {
	process.stderr.write('\n');
};
var clrRow = stdErrProgress ? '\x1b[0G\x1B[0K' : '';
var writeLog;
if(process.stderr.isTTY) {
	// assume colours are supported
	writeLog = function(col, type, msg) {
		process.stderr.write(
			clrRow + '\x1B['+col+'m' + logTimestamp('') + type + '\x1B[39m ' + msg.toString() + '\n'
			+ (getProcessIndicator && stdErrProgress ? getProcessIndicator() : '')
		);
	};
} else {
	writeLog = function(col, type, msg) {
		process.stderr.write(
			clrRow + logTimestamp('') + type + ' ' + msg.toString() + '\n'
			+ (getProcessIndicator && stdErrProgress ? getProcessIndicator() : '')
		);
	};
}
var errorCount = 0;
var logger = {
	debug: function(msg) {
		writeLog('36', '[DBG ]', msg);
	},
	info: function(msg) {
		writeLog('32', '[INFO]', msg);
	},
	warn: function(msg) {
		writeLog('33', '[WARN]', msg);
	},
	error: function(msg) {
		writeLog('31', '[ERR ]', msg);
		errorCount++;
	}
};

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

var displayCompleteMessage = function(err) {
	if(err)
		Nyuu.log.error(err.toString() + (err.skippable ? ' (use `skip-errors` to ignore)':''));
	else if(errorCount)
		Nyuu.log.info('Process complete, with ' + errorCount + ' error(s)');
	else
		Nyuu.log.info('Process complete');
};

var Nyuu = argv['input-raw-posts'] ? require('../lib/postuploader') : require('../');
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
	if(getProcessIndicator)
		process.removeListener('exit', writeNewline);
	getProcessIndicator = null;
	process.emit('finished');
	if(err) {
		displayCompleteMessage(err);
		process.exitCode = 33;
	} else {
		displayCompleteMessage();
		process.exitCode = errorCount ? 32 : 0;
	}
	(function(cb) {
		if(processes && processes.running) {
			var procWarnTO = setTimeout(function() {
				if(!processes.running) return;
				Nyuu.log.info(processes.running + ' external process(es) are still running; Nyuu will exit when these do');
			}, 1000).unref();
			processes.onEnd(function() {
				clearTimeout(procWarnTO);
				cb();
			});
		} else cb();
	})(function() {
		if(isNode010 && process.exitCode) {
			// hack for lack of .exitCode support on node 0.10
			process.on('exit', function() {
				process.exit(process.exitCode);
			});
		}
		setTimeout(function() {
			if(process._getActiveHandles) { // undocumented function, but seems to always work
				var ah = process._getActiveHandles();
				var hTypes = {};
				ah.forEach(function(h) {
					var cn = (h.constructor ? h.constructor.name : 0) || 'unknown';
					if(cn in hTypes)
						hTypes[cn]++;
					else
						hTypes[cn] = 1;
				});
				var handleStr = '';
				for(var hn in hTypes) {
					handleStr += ', ' + hn + (hTypes[hn] > 1 ? ' (' + hTypes[hn] + ')' : '');
				}
				Nyuu.log.warn('Process did not terminate cleanly; active handles: ' + handleStr.substr(2));
				if(verbosity >= 4) {
					process.stderr.write(require('util').inspect(ah, {colors: process.stderr.isTTY}) + '\n');
				}
			} else
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
var friendlyTime = function(t, compact) {
	var days = (t / 86400000) | 0;
	t %= 86400000;
	var seg = [];
	var sect = [3600000, 60000, 1000];
	if(compact && t < 3600000)
		sect.shift();
	sect.forEach(function(s) {
		seg.push(lpad('' + ((t / s) | 0), 2, '0'));
		t %= s;
	});
	var ret = (days ? days + 'd,' : '') + seg.join(':');
	if(!compact)
		ret += decimalPoint + lpad(t + '', 3, '0');
	return ret;
};
var toPercent = function(n) {
	return (Math.round(n*10000)/100).toFixed(2) + '%';
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
	if(argv['input-raw-posts']) {
		totalPieces = totalFiles;
		Nyuu.log.info('Uploading ' + totalPieces + ' article(s) totalling about ' + friendlySize(totalSize));
	} else
		Nyuu.log.info('Uploading ' + totalPieces + ' article(s) from ' + totalFiles + ' file(s) totalling ' + friendlySize(totalSize));
	
	var startTime = Date.now();
	progress.forEach(function(prg) {
		switch(prg.type) {
			case 'log':
				var logInterval = setInterval(function() {
					Nyuu.log.info('Article posting progress: ' + uploader.articlesRead + ' read, ' + uploader.articlesPosted + ' posted, ' + uploader.articlesChecked + ' checked');
				}, prg.interval);
				process.on('finished', function() {
					clearInterval(logInterval);
				});
			break;
			case 'stderr':
			case 'stderrx':
			case 'stdout':
			case 'stdoutx':
				if(getProcessIndicator) break; // no need to double output =P
				var ProgressRecorder = require('../lib/progrec');
				var byteSamples = new ProgressRecorder(180);
				var progressSamples = new ProgressRecorder(180);
				byteSamples.add(0);
				progressSamples.add(0);
				getProcessIndicator = function() {
					var chkPerc = uploader.articlesChecked / totalPieces,
					    pstPerc = uploader.articlesPosted / totalPieces,
					    totPerc = toPercent((chkPerc+pstPerc)/2);
					
					// calculate speed over last 4s
					var speed = uploader.bytesPosted; // for first sample, just use current overall progress
					var completed = (uploader.articlesChecked + uploader.articlesPosted)/2;
					var advancement = completed;
					if(byteSamples.count() >= 2) {
						speed = byteSamples.average(4, 4*ulOpts.articleSize);
						advancement = progressSamples.average(10, 20);
					}
					
					var eta = (totalPieces - completed) / advancement;
					eta = Math.round(eta)*1000;
					if(!isNaN(eta) && isFinite(eta) && eta > 0)
						eta = friendlyTime(eta, true);
					else
						eta = '-';
					
					if(prg.type == 'stderr' || prg.type == 'stdout') {
						var LINE_WIDTH = 35;
						var barSize = Math.floor(chkPerc*LINE_WIDTH);
						var line = repeatChar('=', barSize) + repeatChar('-', Math.floor(pstPerc * LINE_WIDTH) - barSize);
						return '\x1b[0G\x1B[0K ' + lpad(totPerc, 6) + '  [' + rpad(line, LINE_WIDTH) + ']' + (uploader.bytesPosted ?
							' ' + friendlySize(speed) + '/s, ETA ' + eta
						: '');
					} else {
						// extended display
						var posted = '' + uploader.articlesChecked;
						if(uploader.articlesChecked != uploader.articlesPosted)
							posted += '+' + (uploader.articlesPosted - uploader.articlesChecked);
						var ret = 'Posted: ' + posted + '/' + totalPieces + ' (' + totPerc + ') @ ' + friendlySize(speed) + '/s (raw: ' + friendlySize(uploader.currentPostSpeed()*1000) + '/s) ETA ' + eta;
						if(ret.length > 80)
							// if too long, strip the raw post speed
							ret = ret.replace(/ \(raw\: [0-9.]+ [A-Zi]+\/s\)/, ',');
						return '\x1b[0G\x1B[0K' + ret;
					}
				};
				var prgTarget = prg.type.substr(0, 6);
				var seInterval = setInterval(function() {
					byteSamples.add(uploader.bytesPosted);
					progressSamples.add((uploader.articlesChecked + uploader.articlesPosted)/2);
					process[prgTarget].write(getProcessIndicator());
				}, 1000);
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
						'Articles read: ' + uploader.articlesRead + ' (' + toPercent(uploader.articlesRead/totalPieces) + ')' + (uploader.articlesReRead ? ' (+' + uploader.articlesReRead + ' re-read)':''),
						'Articles posted: ' + uploader.articlesPosted + ' (' + toPercent(uploader.articlesPosted/totalPieces) + ')' + (uploader.articlesRePosted ? ' (+' + uploader.articlesRePosted + ' re-posted)':''),
						'Articles checked: ' + uploader.articlesChecked + ' (' + toPercent(uploader.articlesChecked/totalPieces) + ')',
						'Errors skipped: ' + errorCount + ' across ' + uploader.articleErrors + ' article(s)',
						'Upload Rate (raw|real): ' + friendlySize(uploader.currentPostSpeed()*1000) + '/s | ' + friendlySize(uploader.bytesPosted/(now-startTime)*1000) + '/s',
						'',
						'Post connections active: ' + uploader.postConnections.filter(retArg).length,
						'Check connections active: ' + uploader.checkConnections.filter(retArg).length,
						'',
						'Post queue size: ' + uploader.queue.queue.length + ' (' + toPercent(Math.min(uploader.queue.queue.length/uploader.queue.size, 1)) + ' full)' + (uploader.queue.hasFinished ? ' - finished' : ''),
						'Check queue size: ' + uploader.checkQueue.queue.length + ' + ' + uploader.checkQueue.pendingAdds + ' delayed' + ' (' + toPercent(Math.min((uploader.checkQueue.queue.length+uploader.checkQueue.pendingAdds)/uploader.checkQueue.size, 1)) + ' full)' + (uploader.checkQueue.hasFinished ? ' - finished' : ''),
						'Check cache size: ' + uploader.checkCache.cacheSize + ' (' + toPercent(Math.min(uploader.checkCache.cacheSize/uploader.checkCache.size, 1)) + ' full)',
						'Re-read queue size: ' + uploader.reloadQueue.queue.length,
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
								var subj = post.getHeader('subject');
								if(subj === null) subj = '[unknown, post evicted from cache]';
								resp.write([
									'Message-ID: ' + post.messageId,
									'Subject: ' + subj,
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
								if(post.data) {
									// dump post from check queue
									resp.writeHead(200, {
										'Content-Type': 'message/rfc977' // our made up MIME type; follows similarly to SMTP mail
									});
									resp.write(post.data);
								} else {
									resp.writeHead(500, {
										'Content-Type': 'text/plain'
									});
									resp.write('Specified post exists, but cannot be retrieved as it has been evicted from cache');
								}
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
						req.socket.unref();
					});
				} else {
					server = require('net').createServer(function(conn) {
						writeState(conn);
						conn.end();
						conn.unref();
					});
				}
				server.on('error', function(err) {
					Nyuu.log.warn('StatusServer ' + err.toString());
				});
				server.once('listening', process.on.bind(process, 'finished', function() {
					server.close();
				}));
				if(prg.socket) {
					server.listen(prg.socket, function() {
						Nyuu.log.info('Status ' + prg.type.toUpperCase() + ' server listening at ' + prg.socket);
					});
				} else {
					server.listen(prg.port, prg.host, function() {
						var addr = server.address();
						if(addr.family == 'IPv6')
							addr = '[' + addr.address + ']:' + addr.port;
						else
							addr = addr.address + ':' + addr.port;
						Nyuu.log.info('Status ' + prg.type.toUpperCase() + ' server listening on ' + addr);
					});
				}
			break;
		}
	});
	
	displayCompleteMessage = function(err) {
		var msg = '';
		var time = Date.now() - startTime;
		if(err) {
			Nyuu.log.error(err.toString() + (err.skippable ? ' (use `skip-errors` to ignore)':''));
			msg = 'Process has been aborted. Posted ' + uploader.articlesPosted + ' article(s)';
			var unchecked = uploader.articlesPosted - uploader.articlesChecked;
			if(unchecked)
				msg += ' (' + unchecked + ' unchecked)';
			msg += ' in ' + friendlyTime(time) + ' (' + friendlySize(uploader.bytesPosted/time*1000) + '/s)';
		} else {
			msg = 'Finished uploading ' + friendlySize(totalSize) + ' in ' + friendlyTime(time) + ' (' + friendlySize(totalSize/time*1000) + '/s)';
			
			if(errorCount)
				msg += ', with ' + errorCount + ' error(s) across ' + uploader.articleErrors + ' post(s)';
		}
		
		Nyuu.log.info(msg + '. Raw upload: ' + friendlySize(uploader.currentPostSpeed()*1000) + '/s');
	};
	
	process.once('SIGINT', function() {
		Nyuu.log.warn('SIGINT received, aborting...');
		uploader.cancel('Process aborted by user');
	});
});
fuploader.on('processing_file', function(file) {
	Nyuu.log.info('Reading file ' + file.name + '...');
})
fuploader.once('read_complete', function() {
	Nyuu.log.info('All file(s) read...');
});
