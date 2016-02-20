"use strict";

var assert = require("assert");
var Queue = require('../lib/queue');

var tl = require('./_testlib');

describe('Buffered Queue', function() {

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
	q.add(1, tl.throwErr);
	q.add(2, tl.throwErr);
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
		q.add(2, tl.throwErr);
	});
	q.take(function(n) {
		assert.equal(n, 2);
		done();
	});
	q.add(1, tl.throwErr);
});

it('takeSync should work', function(done) {
	var q = new Queue(1);
	assert.equal(q.takeSync(), undefined);
	q.add(1, tl.throwErr);
	assert.equal(q.takeSync(), 1);
	assert.equal(q.takeSync(), undefined);
	q.add(2, tl.throwErr);
	q.add(3, tl.throwErr);
	assert.equal(q.takeSync(), 2);
	assert.equal(q.takeSync(), 3);
	assert.equal(q.takeSync(), undefined);
	done();
});

it('should work with both async/sync takes', function(done) {
	var q = new Queue(1);
	q.take(function(n) {
		assert.equal(n, 1);
		q.add(2, tl.throwErr);
	});
	assert.equal(q.takeSync(), undefined);
	q.add(1, tl.throwErr);
	assert.equal(q.takeSync(), 2); // or should this really be undefined at this point?
	assert.equal(q.takeSync(), undefined);
	
	q.add(3, function(err) {
		if(err) throw err;
		q.add(4, tl.throwErr);
	});
	assert.equal(q.takeSync(), 3);
	q.take(function(n) {
		assert.equal(n, 4);
		
		q.add(5, function(err) {
			if(err) throw err;
			q.add(6, tl.throwErr);
		});
		q.take(function(n) {
			assert.equal(n, 5);
		});
		assert.equal(q.takeSync(), 6);
		done();
	});
});

it('should return empty on finished', function(done) {
	var q = new Queue(10);
	q.finished();
	q.take(function(n) {
		assert.equal(n, undefined);
		done();
	});
	assert.equal(q.takeSync(), undefined);
	assert.equal(q.hasFinished, true);
});

it('should return empty on finished (with items)', function(done) {
	var q = new Queue(1);
	q.add(1, tl.throwErr);
	q.add(2, tl.throwErr);
	q.take(function(n) {
		assert.equal(n, 1);
	});
	q.finished();
	assert.equal(q.hasFinished, true);
	q.take(function(n) {
		assert.equal(n, 2);
	});
	q.take(function(n) {
		assert.equal(q.hasFinished, true);
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
	assert.throws(q.add.bind(q, 1, tl.emptyFn));
	done();
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
			
			tl.defer(function() {
				assert.equal(addDone, 0);
				q.take(function(n) {
					assert.equal(n, 1);
					tl.defer(function() {
						assert.equal(addDone, 1);
						q.add(5, function(err) {
							if(err) throw err;
							addDone = 3;
						});
						tl.defer(function() {
							assert.equal(addDone, 1);
							q.take(function(n) {
								assert.equal(n, 2);
							});
							q.take(function(n) {
								assert.equal(n, 3);
								tl.defer(function() {
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

});
