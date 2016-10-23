/**** Nyuu options/config file ****/
// This file contains all the default options for Nyuu
// You can customize these options to avoid having to specify them on the command line, however it is recommended that you not edit this file
// Instead, copy this file elsewhere and use the `--config` option to get Nyuu to use this copy. Missing options there will sourced from this file

module.exports = {



/** Upload Server Options **/
servers: [
	{
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
		keepAlive: false, // always reconnect on error, even if not needed
		onPostTimeout: null, // list of actions (strings) to take if server sends no response to a post; values can be 'retry', 'strip-hdr=X' and 'ignore'; if not set (null), defaults to ['retry','retry','retry'...] where the number of elements == requestRetries
		tcpKeepAlive: false, // false to disable, otherwise set a number for probe interval (in ms)
		
		postConnections: 3, // number of connections for posting
		checkConnections: 0, // number of connections used for checking
		// TODO: consider ability to reuse posting connections for checking?
		//ulConnReuse: false, // use uploading connections for post checks; only works if checking the same server as the one being uploaded to
	},
],
// multiple servers can be specified by adding elements to tbe above array, but note that:
// - specifying options via the CLI may get confusing
// - servers are currently selected randomly for posting/checking; Nyuu won't otherwise do anything special if you specify multiple servers (this includes falling over if a server is misbehaving)

/** Post Check Options **/
check: {
	delay: 5000, // (in ms) initial delay for performing check
	recheckDelay: 30000, // (in ms) delay retries by this amount of time; not used if tries<2
	tries: 3, // number of check attempts; should be 0 if not performing post checks
	group: '', // if set, will switch checking connections to this group; some servers seem to want one when STATing posts, otherwise they fail to show them; if set, should be a valid group you never post to, eg "bit.test"
	postRetries: 1, // maximum number of post retry attempts after a post check failure; set to 0 to never retry posting
	queueBuffer: null, // maximum number of posts in the post-check queue; if this number is exceeded, uploading is paused until the queue is emptied below this size; default is numConnections*8
},

skipErrors: [], // list of errors to skip; can be set to true to imply all errors; valid options are 
maxPostErrors: 0, // if > 0, maximum number of failed articles to allow before aborting
useLazyConnect: false, // if true, will only create connections when needed, rather than pre-emptively doing so

/** Post/Article Options **/
articleSize: 716800, // in bytes, must be a multiple of 2
bytesPerLine: 128, // in bytes, note: as per yEnc specifications, it's possible to exceed this number

postDate: null, // if set, override timestamps used for Message-ID header, Date header and NZB timestamps
keepMessageId: false, // if true, don't randomize Message-ID header every time the post is submitted
comment: '', // subject pre-comment
comment2: '', // subject post-comment
groupFiles: false, // group "similar" files (based on filename) together into sub-collections, similar to how usenet indexers would do it; only affects the file counter in the subject line

// if any of the following are functions, they'll be called with args(filenum, filenumtotal, filename, size, part, parts, chunkSize)
postHeaders: {
	// required headers; do NOT set Message-ID as this is auto-generated
	Subject: null, // if null, a default Subject is used
	From: (process.env.USER || process.env.USERNAME || 'user').replace(/[<>]/g, '') + ' <' + (process.env.USER || process.env.USERNAME || 'user').replace(/[" (),:;<>@]/g, '') + '@' + require('os').hostname().replace(/[^a-z0-9_.\-]/ig, '') + '>', // 'A Poster <a.poster@example.com>'
	Newsgroups: 'alt.binaries.test', // comma seperated list
	Date: null, // if null, value is auto-generated from when post is first generated
	Path: '',
	
	// optional headers
	//Organization: '',
	'User-Agent': 'Nyuu/' + require('./package.json').version,
	// nice list of headers: https://www.cotse.net/privacy/newsgroup_header.htm or http://www.cs.tut.fi/~jkorpela/headers.html
},
// postHeaders can also, itself, be a function, in which case, it is called with (name, size, num, numTotal) as arguments, and must return an object like the above

/** NZB Options **/
nzb: {
	writeTo: null, // supply a writable stream (or function which returns one) or filename for NZB output
	writeOpts: { // for details, https://nodejs.org/api/fs.html#fs_fs_createwritestream_path_options
		//mode: 0666,
		flags: 'wx', // change to 'w' to overwrite file if it exists
		defaultEncoding: 'utf-8',
		encoding: 'utf-8',
	},
	overrides: {
		// here you can override values for NZB <file> entries
		// if unset, will use the NNTP header values from the first segment of the file
		// can be set to a function, which will be called with args(header_value, filenum, filenumtotal, filename, size, parts)
		subject: null, // Subject header
		poster: null, // From header
		date: null, // timestamp when post was generated (note: will be interpreted as a Javascript date)
		groups: null // Newsgroups header
	},
	minify: false,
	compression: '', // can be 'gzip', 'zlib', 'deflate', 'xz' or '' (none)
	compressOpts: {}, // options for zlib, see https://nodejs.org/api/zlib.html#zlib_class_options
	metaData: {
		// eg:
		// password: 'mysecret',
	},
},

/** Input Stream Copy/Tee Options **/
inputCopy: null, // a writable stream to copy the input to, or a function (see example below)
/* this example excludes PAR2 files from being copied
inputCopy: function(filename, filesize) {
	if(!filename.match(/\.par2$/i))
		return fs.createWriteStream(filename + '.pipe');
}
*/
copyQueueBuffer: 4, // number of article-sized chunks to buffer to copied streams

/** Tuning Options **/
useBufferPool: true, // self manage article buffers rather than rely on GC's management; also improves performance of writing to buffers
headerAllocSize: 4096, // amount of buffer space to allocate for post headers, only used if useBufferPool is true

diskReqSize: null, // chunk size when reading from disk; default = Math.ceil(1048576/articleSize)*articleSize
diskBufferSize: 1, // number of chunks to buffer
articleQueueBuffer: null, // number of buffered articles; default is numConnections

/** Other Options **/
subdirs: 'skip', // can be 'skip' or 'keep'; note that it affects directly passed directories too
// if above setting is 'keep', filenames will be transformed according to the following setting
// the default is to keep the filename component only, which essentially flattens all files into a single directory
// this is similar to how other clients handle folders
// you can also return false from this function to skip specific files
subdirNameTransform: function(fileName, pathName, fullPath) { return fileName; },
// another example: include path, seperated by dashes (e.g. "MyFolder - SubFolder - SomeFile.txt")
// subdirNameTransform: function(fileName, pathName, fullPath) { return pathName.replace(/\//g, ' - ') + fileName; },


dumpPostLoc: '', // dump all failed articles to this location (the Message-ID will be appended to this, so if you want to store in a directory, end this with a trailing slash); only useful for debugging




};
