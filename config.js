// this is the default config file

var appVer = require('./package.json').version;

module.exports = {
	
	// usenet server
	// TODO: consider multi-server?
	server: { // connection settings
		connect: {
			host: 'news.example.com',
			port: null,
			
			// SSL options
			rejectUnauthorized: true,
			servername: undefined, // SNI host name
		},
		secure: false, // set to 'true' to use SSL
		user: null,
		password: null,
		timeout: 60000, // in ms
		connTimeout: 30000, // in ms
		reconnectDelay: 5000, // in ms
		connectRetries: 1,
		postRetries: 1, // how many times to retry if server returns 441 response to posted article
		connections: 3, // number of connections
	},
	
	check: {
		server: {
			connect: {},
			// same as 'server' above; missing fields are copied from there
			// TODO: multiple servers?
			connections: 0, // 1 is a good number, but if you're uploading fast enough that it becomes a bottleneck, increase it
		},
		delay: 5*1000, // (in ms) initial delay for performing check
		recheckDelay: 30*1000, // (in ms) delay retries by this amount of time; not used if tries<2
		tries: 3, // number of check attempts; should be 0 if not performing post checks
		group: '', // if set, will switch checking connections to this group; some servers seem to want one when STATing posts, otherwise they fail to show them; if set, should be a valid group you never post to, eg "bit.test"
		ulConnReuse: false, // use uploading connections for post checks; only works if checking the same server as the one being uploaded to
		postRetries: 1, // maximum number of post retry attempts after a post check failure; set to 0 to never retry posting
		ignoreFailure: false, // what to do once all post retry attempts have been exhausted; either error and halt the process (true) or ignore, print a warning, and assume the last post attempt succeeded (false)
		queueBuffer: 50, // maximum number of posts in the post-check queue; if this number is exceeded, uploading is paused until the queue is emptied below this size
		method: 'stat', // 'stat', 'head' or 'newnews' ; TODO: ?
	},
	
	articleSize: 768000, // must be a multiple of 2
	//articleLines: null,
	bytesPerLine: 128, // note: as per yEnc specifications, it's possible to exceed this number
	
	dumpPosts: '', // dump all successfully posted article headers (excluding Message-ID) to this location (the Message-ID will be appended to this, so if you want to store in a directory, end this with a trailing slash); only useful for debugging
	
	diskReqSize: 768000, // chunk size when reading from disk
	diskBufferSize: 1536000, // amount of data to buffer; ideally a multiple of articleSize
	articleQueueBuffer: 10, // number of buffered articles; just leave it alone
	
	/**
	 * Folder handling - this can be:
	 *
	 * - skip: skips files in folders
	 * - keep: uploads all files in folders - use the subdirNameTransform to specify what filenames to use
	 * - archive: automatically wraps files into 7z archives (one archive for each folder)
	 * - archiveAll: merges all folders into a single 7z archive
	 */
	subdirs: 'skip',
	// if above setting is 'keep', filenames will be transformed according to this setting
	// the default is to keep the filename component only, which essentially flattens all files into a single directory
	// this is similar to how other clients handle folders
	subdirNameTransform: function(fileName, pathName, fullPath) { return fileName; },
	// another example: include path, seperated by dashes (e.g. "MyFolder - SubFolder - SomeFile.txt")
	// subdirNameTransform: function(fileName, pathName, fullPath) { return pathName.replace(/\//g, ' - ') + fileName; },
	
	comment: '', // subject pre-comment
	comment2: '', // subject post-comment
	groupFiles: false, // group "similar" files (based on filename) together into sub-collections, similar to how usenet indexers would do it; only affects the file counter in the subject line
	// TODO: subject format
	
	// if any of the following are functions, they'll be called with args(filename, part, parts, size)
	postHeaders: {
		// required headers
		Subject: null, // will be overwritten if set to null; will also have (filenum, filenumtotal) prepended to args list
		From: (process.env.USER || process.env.USERNAME || 'user').replace(/[<>]/g, '') + ' <' + (process.env.USER || process.env.USERNAME || 'user').replace(/[" (),:;<>@]/g, '') + '@' + require('os').hostname().replace(/[^a-z0-9_.\-]/ig, '') + '>', // 'A Poster <a.poster@example.com>'
		Newsgroups: 'alt.binaries.test', // comma seperated list
		Date: (new Date()).toUTCString(),
		Path: '',
		// don't supply Message-ID - it is always set
		
		// optional headers
		//Organization: '',
		'User-Agent': 'Nyuu/' + appVer
		
		// nice list of headers: https://www.cotse.net/privacy/newsgroup_header.htm
	},
	
	nzb: {
		writeTo: null, // supply a writable stream (or function which returns one) or filename for NZB output
		writeOpts: {
			//mode: 0666,
			encoding: 'utf-8',
		},
		minify: false,
		compression: '', // can be 'gzip', 'zlib', 'deflate', 'xz' or '' (none)
		compressOpts: {}, // options for zlib
		metaData: {
			'x-generator': 'Nyuu v' + appVer + ' [https://animetosho.org/app/nyuu]',
		},
	},
	
};
