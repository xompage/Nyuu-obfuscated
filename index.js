"use strict";

// TODO: grab cmd args etc

var FileUploader = require('./lib/fileuploader');

FileUploader.log = console;

var opts = {server: {path: './output'}};

FileUploader.upload(['index.js'], opts, function(err) {
	if(err) console.error(err);
	else console.log('Complete!');
});
