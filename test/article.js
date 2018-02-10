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
	
	a.setHeaders({
		Subject: 'first post!',
		From: function(filename, filesize, part, parts, post) {
			assert.equal(filename, 'somefile');
			assert.equal(filesize, 6);
			assert.equal(part, 1);
			assert.equal(parts, 2);
			assert.equal(post.rawSize, 3);
			return 'fromfield';
		}
	});
	var a1Headers = {};
	var a1 = a.generate(new Buffer('abc'), pool, a1Headers);
	assert.equal(a1.part, 1);
	s = a1.data.toString();
	
	var headers = a1.data.slice(0, a1.postPos).toString();
	
	// first part should not have a crc32 (but may have a pcrc32)
	assert(!s.match(/[^p]crc32=/));
	assert.notEqual(headers.indexOf('first post!'), -1);
	assert.equal(a1Headers.subject, 'first post!');
	assert.notEqual(headers.indexOf('fromfield'), -1);
	assert.equal(a1Headers.from, 'fromfield');
	
	// TODO: consider parsing data and checking everything
	
	a.setHeaders({
		'X-Test': ''
	});
	var a2Headers = {};
	var a2 = a.generate(new Buffer('def'), pool, a2Headers);
	assert.equal(a2.part, 2);
	s = a2.data.toString();
	headers = a2.data.slice(0, a2.postPos).toString();
	
	// check a2 has a crc32
	assert.notEqual(s.indexOf('crc32='), -1);
	assert.notEqual(headers.indexOf('X-Test:'), -1);
	assert.equal(a2Headers['x-test'], '');
	assert(!a2Headers.subject); // since we didn't supply one
	
	assert.equal(a.pos, 6);
	
	// test release+reload
	var oldData = new Buffer(a1.data);
	a1.releaseData();
	a1.reloadData(new Buffer('abc'));
	assert.equal(oldData.toString('hex'), a1.data.toString('hex'));
	
	oldData = new Buffer(a2.data);
	a2.releaseData();
	a2.reloadData(new Buffer('def'));
	assert.equal(oldData.toString('hex'), a2.data.toString('hex'));
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
	a.setHeaders({});
	var a1 = a.generate(new Buffer('aabbcc'));
	
	assert.equal(a1.part, 1);
	assert.notEqual(a1.data.toString().indexOf('crc32='), -1);
	
	assert.throws(function() {
		a.generate(new Buffer('b'));
	}, Error);
	done();
});
it('should throw if sent too much data', function(done) {
	var a = new MultiEncoder('file', 3, 2);
	a.setHeaders({});
	a.generate(new Buffer('aa'));
	assert.throws(function() {
		a.generate(new Buffer('bb'));
	}, Error);
	done();
});
it('should throw if sent data isn\'t expected amount', function(done) {
	var a = new MultiEncoder('file', 5, 3);
	a.setHeaders({});
	a.generate(new Buffer('aa'));
	assert.throws(function() {
		a.generate(new Buffer('bb'));
	}, Error);
	done();
});

// TODO: test Post.* stuff?
// TODO: check message IDs
// TODO: test raw posts

});
