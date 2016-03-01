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
		alias: 'c',
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
	// TODO: header check options
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
	// TODO: custom headers
	subject: {
		type: 'string',
		alias: 's',
		map: 'postHeaders/Subject'
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
	'nzb-out': {
		type: 'string',
		alias: 'o',
		map: 'nzb/writeTo'
	},
	'nzb-minify': {
		type: 'bool',
		map: 'nzb/minify'
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
	}
	// TODO: verbosity option
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
	console.error(require('fs').readFileSync('../help.txt').toString());
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
	if(typeof s == 'number') return Math.floor(s);
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
		if(isNaN(num) || num < 1) return false;
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
	
	if(o.map) {
		var path = o.map.split('/');
		var config = ulOpts;
		for(var i=0; i<path.length-1; i++)
			config = config[path[i]];
		config[path.slice(-1)] = v;
	}
}


// custom validation rules
if(!argv.host)                  error('Server host must be supplied');
if(!argv._.length)              error('Must supply at least one input file');
//if(!ulOpts.server.connect.port) error('Invalid port specified');
// TODO:


require('../').upload(argv._, ulOpts, function(err) {
	if(err) {
		console.error(err);
	} else {
		console.error('Process Complete');
	}
});
