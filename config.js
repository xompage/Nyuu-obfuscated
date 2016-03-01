// this is the default config file

module.exports = {
	
	// usenet server
	// TODO: consider multi-server?
	server: { // connection settings
		connect: {
			host: 'news.example.com',
			port: null
		},
		secure: false, // set to 'true' to use SSL
		user: null,
		password: null,
		// TODO: SSL options
		timeout: 60000, // in ms
		connTimeout: 30000, // in ms
		reconnectDelay: 5000, // in ms
		connectRetries: 3,
		postRetries: 1, // how many times to retry if server returns 441 response to posted article
		// TODO: reconnect, max retries etc
	},
	connections: 3, // number of connections
	
	checkServers: {
		// same as 'server' above; missing fields are copied from there
		// TODO: multiple servers?
	},
	headerCheckConnections: 1, // probably not much of a reason to go above 1
	headerCheckDelays: [40*1000, 20*1000], // (in ms) further retries will use the last number specified
	headerCheckTries: 0, // number of retries; should be 0 if not performing header checks
	headerCheckGroup: '', // which group to check in; if left blank, will auto determine from posting headers
	headerCheckUlConnReuse: false, // use uploading connections for header checks; only works if checking the same server as the one being uploaded to
	headerCheckFailAction: 'error', // what to do when header check fails to get the post; options are 'error' (die), 'warn' (ignore and print warning), 'repost' (re-post article)
	// TODO: max repost tries
	
	articleSize: 768000, // must be a multiple of 2
	//articleLines: null,
	bytesPerLine: 128, // note: as per yEnc specifications, it's possible to exceed this number
	
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
	// TODO: subject format
	
	// if any of the following are functions, they'll be called with args(filename, part, parts, size)
	postHeaders: {
		// required headers
		Subject: null, // will be overwritten if set to null
		From: 'A Poster <a.poster@example.com>',
		Newsgroups: 'alt.binaries.test', // comma seperated list
		Date: (new Date()).toUTCString(),
		Path: '',
		//'Message-ID': function() { return require('crypto').pseudoRandomBytes(24).toString('hex') + '@nyuu'; },
		
		// optional headers
		//Organization: '',
		'User-Agent': 'Nyuu'
	},
	
	nzb: {
		writeTo: '', // TODO: filename, output stream (eg stdout) etc
		writeOpts: {
			//mode: 0666,
			encoding: 'utf-8',
		},
		minify: false,
		compression: '', // TODO: gzip etc
		metaData: {
			client: 'Nyuu',
		},
	},
	
};
