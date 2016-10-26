"use strict";

var assert = require("assert");

var MultiEncoder = require('../lib/article');
var BufferPool = require('../lib/bufferpool');

describe('Article', function() {

// TODO: test case of header exceeding line length??

var simpleCheck = function(pool) {
	var a = new MultiEncoder('some\nfile', 6, 3);
	assert.equal(a.filename, 'somefile');
	assert.ok(a.line_size);
	
	var s;
	
	var a1 = a.generate({
		Subject: 'first post!',
		From: function(filename, filesize, part, parts, size) {
			assert.equal(filename, 'somefile');
			assert.equal(filesize, 6);
			assert.equal(part, 1);
			assert.equal(parts, 2);
			assert.equal(size, 3);
			return 'fromfield';
		}
	}, Buffer('abc'), pool);
	assert.equal(a1.part, 1);
	s = a1.data.toString();
	
	var headers = a1.data.slice(0, a1.postPos).toString();
	
	// first part should not have a crc32 (but may have a pcrc32)
	assert(!s.match(/[^p]crc32=/));
	assert.notEqual(headers.indexOf('first post!'), -1);
	assert.equal(a1.headers.subject, 'first post!');
	assert.notEqual(headers.indexOf('fromfield'), -1);
	assert.equal(a1.headers.from, 'fromfield');
	
	// TODO: consider parsing data and checking everything
	
	var a2 = a.generate({
		'X-Test': ''
	}, Buffer('def'), pool);
	assert.equal(a2.part, 2);
	s = a2.data.toString();
	headers = a2.data.slice(0, a2.postPos).toString();
	
	// check a2 has a crc32
	assert.notEqual(s.indexOf('crc32='), -1);
	assert.notEqual(headers.indexOf('X-Test:'), -1);
	assert.equal(a2.headers['x-test'], '');
	assert(!a2.headers.subject); // since we didn't supply one
	
	assert.equal(a.pos, 6);
};

it('basic unpooled post test', function(done) {
	simpleCheck();
	done();
});
it('basic (small) pooled post test', function(done) {
	simpleCheck(new BufferPool(1));
	done();
});
it('basic (large) pooled post test', function(done) {
	simpleCheck(new BufferPool(4096));
	done();
});

it('should throw if sent too many parts', function(done) {
	var a = new MultiEncoder('file', 6, 6);
	var a1 = a.generate({}, Buffer('aabbcc'));
	
	assert.equal(a1.part, 1);
	assert.notEqual(a1.data.toString().indexOf('crc32='), -1);
	
	assert.throws(function() {
		a.generate({}, Buffer('b'));
	}, Error);
	done();
});
it('should throw if sent too much data', function(done) {
	var a = new MultiEncoder('file', 3, 2);
	a.generate({}, Buffer('aa'));
	assert.throws(function() {
		a.generate({}, Buffer('bb'));
	}, Error);
	done();
});
it('should throw if sent data isn\'t expected amount', function(done) {
	var a = new MultiEncoder('file', 5, 3);
	a.generate({}, Buffer('aa'));
	assert.throws(function() {
		a.generate({}, Buffer('bb'));
	}, Error);
	done();
});

// TODO: test use of sending a pool
// TODO: test Post stuff?
// TODO: check message IDs

});
