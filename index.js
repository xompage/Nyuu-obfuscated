"use strict";

// TODO: grab cmd args etc

var main = require('./main');

main.log = console;

var opts = {server: {path: './output'}};

main.run(['main.js'], opts, function(err) {
	if(err) console.error(err);
	else console.log('Complete!');
});
