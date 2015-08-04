"use strict";

var assert = require("assert");
var Queue = require('../lib/queue');

var emptyFn = function(){};
var throwErr = function(err) {
	if(err) throw err;
};
var asyncDelay = 100, defer = function(f) {
	setTimeout(f, asyncDelay);
};

it('should return queued in order', function(done) {
	// queue up 1,2; it should return 1,2
	var q = new Queue(10);
	q.add(1, function(err) {
		if(err) throw err;
		q.add(2, function(err) {
			if(err) throw err;
			q.take(function(n) {
				assert.equal(n, 1);
				q.take(function(n) {
					assert.equal(n, 2);
					done();
				});
			});
		});
	});
});

it('should return queued in order (no waiting)', function(done) {
	// queue up 1,2; it should return 1,2
	var q = new Queue(10);
	q.add(1, throwErr);
	q.add(2, throwErr);
	q.take(function(n) {
		assert.equal(n, 1);
	});
	q.take(function(n) {
		assert.equal(n, 2);
		done();
	});
});

it('should return queued in order (out of order requests)', function(done) {
	// queue up 1,2; it should return 1,2
	var q = new Queue(10);
	q.take(function(n) {
		assert.equal(n, 1);
		q.add(2, throwErr);
	});
	q.take(function(n) {
		assert.equal(n, 2);
		done();
	});
	q.add(1, throwErr);
});

it('should return empty on finished', function(done) {
	var q = new Queue(10);
	q.finished();
	q.take(function(n) {
		assert.equal(n, undefined);
		done();
	});
});

it('should return empty on finished (with items)', function(done) {
	var q = new Queue(1);
	q.add(1, throwErr);
	q.add(2, throwErr);
	q.take(function(n) {
		assert.equal(n, 1);
	});
	q.finished();
	q.take(function(n) {
		assert.equal(n, 2);
	});
	q.take(function(n) {
		assert.equal(n, undefined);
	});
	q.take(function(n) {
		assert.equal(n, undefined);
		done();
	});
});

it('should return empty on finished (out of order request)', function(done) {
	var q = new Queue(10);
	q.take(function(n) {
		assert.equal(n, undefined);
		done();
	});
	q.finished();
});


it('should disable add on finished', function(done) {
	var q = new Queue(10);
	q.finished();
	try {
		q.add(1, emptyFn);
	} catch(ex) {
		return done();
	}
	throw new Error('No exception thrown');
});

it('should wait when queue size exceeded', function(done) {
	var q = new Queue(2);
	var addDone = 0;
	q.add(1, function(err) {
		if(err) throw err;
		q.add(2, function(err) {
			if(err) throw err;
			q.add(3, function(err) {
				if(err) throw err;
				addDone = 1;
			});
			q.add(4, function(err) {
				if(err) throw err;
				addDone = 2;
			});
			
			defer(function() {
				assert.equal(addDone, 0);
				q.take(function(n) {
					assert.equal(n, 1);
					defer(function() {
						assert.equal(addDone, 1);
						q.add(5, function(err) {
							if(err) throw err;
							addDone = 3;
						});
						defer(function() {
							assert.equal(addDone, 1);
							q.take(function(n) {
								assert.equal(n, 2);
							});
							q.take(function(n) {
								assert.equal(n, 3);
								defer(function() {
									assert.equal(addDone, 3);
									q.take(function(n) {
										assert.equal(n, 4);
										done();
									});
								});
							});
						});
					});
				});
			});
		});
	});
});
