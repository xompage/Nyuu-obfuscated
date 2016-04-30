"use strict";

var assert = require("assert");

var MultiEncoder = require('../lib/article');

describe('Article', function() {

// TODO: test case of header exceeding line length??

it('should work', function(done) {
	var a = new MultiEncoder('some\nfile', 6, 2);
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
	}, Buffer('abc'));
	assert.equal(a1.part, 1);
	s = a1.data.toString();
	
	// first part should not have a crc32 (but may have a pcrc32)
	assert(!s.match(/[^p]crc32=/));
	assert.notEqual(a1.headerStr.indexOf('first post!'), -1);
	assert.equal(a1.headers.subject, 'first post!');
	assert.notEqual(a1.headerStr.indexOf('fromfield'), -1);
	assert.equal(a1.headers.from, 'fromfield');
	
	// TODO: consider parsing data and checking everything
	
	var a2 = a.generate({
		'X-Test': ''
	}, Buffer('def'));
	assert.equal(a2.part, 2);
	s = a2.data.toString();
	
	// check a2 has a crc32
	assert.notEqual(s.indexOf('crc32='), -1);
	assert.notEqual(a2.headerStr.indexOf('X-Test:'), -1);
	assert.equal(a2.headers['x-test'], '');
	assert(!a2.headers.subject); // since we didn't supply one
	
	assert.equal(a.pos, 6);
	done();
});

it('should throw if sent too many parts', function(done) {
	var a = new MultiEncoder('file', 6, 1);
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
	var a = new MultiEncoder('file', 5, 2);
	a.generate({}, Buffer('aa'));
	assert.throws(function() {
		a.generate({}, Buffer('bb'));
	}, Error);
	done();
});

});
