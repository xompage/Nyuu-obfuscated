module.exports = {
	
	// usenet server
	server: { // connection settings
		connect: {
			host: 'news.example.com',
			port: 119,
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
	},
	headerCheckConnections: 0, // probably not much of a reason to go above 1
	headerCheckDelays: [40, 20], // further retries will use the last number specified
	headerCheckTries: 3,
	headerCheckGroup: '', // which group to check in; if left blank, will auto determine from posting headers
	headerCheckUlConnReuse: false, // use uploading connections for header checks
	// TODO: check delay, max tries, multiple servers?
	
	articleSize: 768000, // must be a multiple of 2
	//articleLines: null,
	bytesPerLine: 128, // note: as per yEnc specifications, it's possible to exceed this number
	
	diskReqSize: 768000, // chunk size when reading from disk
	diskBufferSize: 1536000, // amount of data to buffer; ideally a multiple of articleSize
	articleQueueBuffer: 10, // number of buffered articles; just leave it alone
	
	comment: '', // subject pre-comment
	comment2: '', // subject post-comment
	// TODO: subject format
	
	// if any of the following are functions, they'll be called with args(filename, part, parts, size)
	postHeaders: {
		Subject: null, // will be overwritten if set to null
		From: 'A Poster <a.poster@example.com>',
		Newsgroups: 'alt.binaries.test', // comma seperated list
		Date: (new Date()).toISOString(),
		Path: '',
		//Organization: '',
		'User-Agent': 'Nyuu',
		//'Message-ID': function() { return require('crypto').pseudoRandomBytes(24).toString('hex') + '@nyuu'; }
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
	
	logLevel: 'info',
	
};
