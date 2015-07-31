module.exports = {
	
	// usenet server
	server: { // connection settings
		host: 'news.example.com',
		port: 119,
		secure: false, // set to 'true' to use SSL
		user: null,
		password: null,
		// TODO: SSL options
		timeout: 60000, // in ms
		// TODO: reconnect, max retries etc
	},
	connections: 3, // number of connections
	
	checkServers: {
		// same as 'server' above; missing fields are copied from there
	},
	headerCheckConnections: 0, // probably not much of a reason to go above 1
	// TODO: check delay, max tries, multiple servers?
	
	articleSize: 768000,
	//articleLines: null,
	bytesPerLine: 128, // note: as per yEnc specifications, it's possible to exceed this number
	
	comment: '', // subject pre-comment
	comment2: '', // subject post-comment
	// TODO: subject format
	
	postHeaders: {
		Subject: null, // will be overwritten if set to null
		From: 'A Poster <a.poster@example.com>',
		Newsgroups: 'alt.binaries.test', // comma seperated list
		'Message-ID': null, // will be overwritten if set to null
		Date: (new Date()).toISOString(),
		Path: '',
		//Organization: '',
		'User-Agent': 'Nyuu'.
	},
	
	nzb: {
		writeTo: '', // TODO: filename, output stream (eg stdout) etc
		minify: false,
		compression: '', // TODO: gzip etc
		metaData: {
			client: 'Nyuu',
		},
	},
	
	logLevel: 'info',
	
};
