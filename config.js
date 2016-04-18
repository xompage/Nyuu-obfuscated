/**** Nyuu options/config file ****/
// This file contains all the default options for Nyuu
// You can customize these options to avoid having to specify them on the command line, however it is recommended that you not edit this file
// Instead, copy this file elsewhere and use the `--config` option to get Nyuu to use this copy. Missing options there will sourced from this file

var appVer = require('./package.json').version;
module.exports = {




/** Upload Server Options **/
server: {
	// connection options - see the following pages for full documentation
	// non-SSL: https://nodejs.org/api/net.html#net_socket_connect_options_connectlistener
	// SSL: https://nodejs.org/api/tls.html#tls_tls_connect_options_callback
	connect: { // connection options
		host: 'localhost',
		port: null, // null => if server.secure, port=563, else, port=119
		
		// SSL options
		rejectUnauthorized: true,
	},
	secure: false, // set to true to use SSL
	user: '',
	password: '',
	// note that these times are specified in miliseconds
	timeout: 60000, // 60000ms = 1 minute
	connTimeout: 30000, // 30 seconds
	reconnectDelay: 5000, // 5 seconds
	connectRetries: 1,
	requestRetries: 5, // how many times to retry an interrupted request
	postRetries: 1, // how many times to retry if server returns 441 response to posted article
	connections: 3, // number of connections
	keepAlive: false, // always reconnect on error, even if not needed
},

/** Post Check Options **/
check: {
	// this 'server' block is identical to the 'server' block above
	// missing fields are simply copied from there
	server: {
		connect: {
		},
		connections: 0, // 1 is a good number, but if you're uploading fast enough that it becomes a bottleneck, increase it
	},
	delay: 5000, // (in ms) initial delay for performing check
	recheckDelay: 30000, // (in ms) delay retries by this amount of time; not used if tries<2
	tries: 3, // number of check attempts; should be 0 if not performing post checks
	group: '', // if set, will switch checking connections to this group; some servers seem to want one when STATing posts, otherwise they fail to show them; if set, should be a valid group you never post to, eg "bit.test"
	ulConnReuse: false, // use uploading connections for post checks; only works if checking the same server as the one being uploaded to
	postRetries: 1, // maximum number of post retry attempts after a post check failure; set to 0 to never retry posting
	queueBuffer: null, // maximum number of posts in the post-check queue; if this number is exceeded, uploading is paused until the queue is emptied below this size; default is numConnections*8
},

skipErrors: [], // list of errors to skip; can be set to true to imply all errors; valid options are 
useLazyConnect: false, // if true, will only create connections when needed, rather than pre-emptively doing so

/** Post/Article Options **/
articleSize: 768000, // in bytes, must be a multiple of 2
bytesPerLine: 128, // in bytes, note: as per yEnc specifications, it's possible to exceed this number

comment: '', // subject pre-comment
comment2: '', // subject post-comment
groupFiles: false, // group "similar" files (based on filename) together into sub-collections, similar to how usenet indexers would do it; only affects the file counter in the subject line

// if any of the following are functions, they'll be called with args(filename, size, part, parts, chunkSize)
postHeaders: {
	// required headers; do NOT set Message-ID as this is auto-generated
	// the subject header is treated a bit specially
	// - if null, will use default behaviour
	// - if set to a function, will be called with args(filenum, filenumtotal, filename, size, part, parts, chunkSize)
	Subject: null,
	From: (process.env.USER || process.env.USERNAME || 'user').replace(/[<>]/g, '') + ' <' + (process.env.USER || process.env.USERNAME || 'user').replace(/[" (),:;<>@]/g, '') + '@' + require('os').hostname().replace(/[^a-z0-9_.\-]/ig, '') + '>', // 'A Poster <a.poster@example.com>'
	Newsgroups: 'alt.binaries.test', // comma seperated list
	Date: function() { return (new Date()).toUTCString(); },
	Path: '',
	
	// optional headers
	//Organization: '',
	'User-Agent': 'Nyuu/' + appVer,
	// nice list of headers: https://www.cotse.net/privacy/newsgroup_header.htm
},

/** NZB Options **/
nzb: {
	writeTo: null, // supply a writable stream (or function which returns one) or filename for NZB output
	writeOpts: { // for details, https://nodejs.org/api/fs.html#fs_fs_createwritestream_path_options
		//mode: 0666,
		flags: 'wx', // change to 'w' to overwrite file if it exists
		defaultEncoding: 'utf-8',
		encoding: 'utf-8',
	},
	minify: false,
	compression: '', // can be 'gzip', 'zlib', 'deflate', 'xz' or '' (none)
	compressOpts: {}, // options for zlib, see https://nodejs.org/api/zlib.html#zlib_class_options
	metaData: {
		'x-generator': 'Nyuu v' + appVer + ' [https://animetosho.org/app/nyuu]',
	},
},

/** Tuning Options **/
dumpPosts: '', // dump all successfully posted article headers (excluding Message-ID) to this location (the Message-ID will be appended to this, so if you want to store in a directory, end this with a trailing slash); only useful for debugging
useBufferPool: true, // self manage article buffers rather than rely on GC's management

diskReqSize: null, // chunk size when reading from disk; default = articleSize
diskBufferSize: null, // amount of data to buffer; ideally a multiple of articleSize; default = diskReqSize
articleQueueBuffer: null, // number of buffered articles; default is numConnections*2

/** Other Options **/
subdirs: 'skip', // can be 'skip' or 'keep'
// if above setting is 'keep', filenames will be transformed according to this setting
// the default is to keep the filename component only, which essentially flattens all files into a single directory
// this is similar to how other clients handle folders
// you can also return false from this function to skip specific files
subdirNameTransform: function(fileName, pathName, fullPath) { return fileName; },
// another example: include path, seperated by dashes (e.g. "MyFolder - SubFolder - SomeFile.txt")
// subdirNameTransform: function(fileName, pathName, fullPath) { return pathName.replace(/\//g, ' - ') + fileName; },






};
