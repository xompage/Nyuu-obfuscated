"use strict";

var assert = require("assert");
var TimerQueue = require('../lib/timerqueue');

var tl = require('./_testlib');

describe('Timer Queue', function() {

it('should return queued in order', function(done) {
	var q = new TimerQueue();
	q.add(20, 1);
	q.add(40, 2);
	var s = Date.now();
	q.take(function(n) {
		assert(Date.now() - s >= 20);
		assert.equal(n, 1);
		q.take(function(n) {
			assert(Date.now() - s >= 40);
			assert.equal(n, 2);
			
			done();
		});
	});
});

it('should return queued in order (no waiting)', function(done) {
	var q = new TimerQueue();
	q.add(40, 2);
	var s = Date.now();
	q.take(function(n) {
		assert(Date.now() - s >= 20);
		assert.equal(n, 1);
	});
	q.add(20, 1);
	q.take(function(n) {
		assert(Date.now() - s >= 40);
		assert.equal(n, 2);
		
		done();
	});
});

it('should return queued in order (out of order requests)', function(done) {
	var q = new TimerQueue();
	var s = Date.now();
	q.take(function(n) {
		assert(Date.now() - s >= 20);
		assert.equal(n, 1);
		q.add(20, 2);
	});
	q.take(function(n) {
		assert(Date.now() - s >= 40);
		assert.equal(n, 2);
		
		done();
	});
	q.add(20, 1);
});

it('should handle 0 time', function(done) {
	var q = new TimerQueue();
	q.add(0, 1);
	q.take(function(n) {
		assert.equal(n, 1);
		done();
	});
});

it('should work with both async/sync takes', function(done) {
	var q = new TimerQueue();
	assert.equal(q.takeSync(), undefined);
	q.add(0, 1);
	assert.equal(q.takeSync(), 1);
	
	q.take(function(n) {
		assert.equal(n, 2);
		q.add(20, 3);
	});
	assert.equal(q.takeSync(), undefined);
	q.add(20, 2);
	setTimeout(function() { // this timer *should* fire after the q.take above
		assert.equal(q.takeSync(), 3);
		assert.equal(q.takeSync(), undefined);
		
		q.add(0, 4);
		assert.equal(q.takeSync(), 4);
		q.take(function(n) {
			assert.equal(n, 5);
			done();
		});
		q.add(20, 5);
		assert.equal(q.takeSync(), undefined);
	}, 100);
});

it('should return empty on finished', function(done) {
	var q = new TimerQueue();
	q.finished();
	q.take(function(n) {
		assert.equal(n, undefined);
		done();
	});
	assert.equal(q.takeSync(), undefined);
});

it('should return empty on finished (with items)', function(done) {
	var q = new TimerQueue();
	q.add(20, 1);
	q.add(40, 2);
	var s = Date.now();
	q.take(function(n) {
		assert.equal(n, 1);
		assert(Date.now() - s >= 20);
	});
	q.finished();
	q.take(function(n) {
		assert.equal(n, 2);
		assert(Date.now() - s >= 40);
	});
	q.take(function(n) {
		assert.equal(n, undefined);
		assert(Date.now() - s >= 40);
	});
	q.take(function(n) {
		assert.equal(n, undefined);
		done();
	});
});

it('should return empty on finished (with items v2)', function(done) {
	var q = new TimerQueue();
	q.add(20, 1);
	q.add(40, 2);
	var s = Date.now();
	q.take(function(n) {
		assert.equal(n, 1);
		assert(Date.now() - s >= 20);
	});
	q.take(function(n) {
		assert.equal(n, 2);
		assert(Date.now() - s >= 40);
	});
	q.take(function(n) {
		assert.equal(n, undefined);
		assert(Date.now() - s >= 40);
	});
	q.take(function(n) {
		assert.equal(n, undefined);
		done();
	});
	q.finished();
});

it('should return empty on finished (out of order request)', function(done) {
	var q = new TimerQueue();
	q.take(function(n) {
		assert.equal(n, undefined);
		done();
	});
	q.finished();
});


it('should disable add on finished', function(done) {
	var q = new TimerQueue();
	q.finished();
	assert.throws(q.add.bind(q, 1, tl.emptyFn));
	done();
});


});
