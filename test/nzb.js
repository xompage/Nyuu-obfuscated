"use strict";

var assert = require("assert");
var Newbz = require('../lib/nzb');

describe('NZB Generator', function() {
	it('should just do it\'s shit', function() {
		var data = [];
		var nzb = new Newbz(
			'A <Poster>',
			['alt.binaries.test', 'tildes suck&&&&', '"made up group"'],
			{
				'testing & stuffing around' : 'test value',
				another_tag : '"hello world"'
			},
			data.push.bind(data),
			true,
			'utf8'
		);
		
		nzb.file('i_am_insane.jpg', 2, null);
		nzb.addSegment('blabla@test.test', 123);
		nzb.addSegment('invalid<name>@place', 111);
		nzb.file('Silly&File', 1, null);
		// this file is invalid as it has no segments, but I cbf checking this case
		nzb.end();
		
		data = Buffer.concat(data).toString();
		
		if(!data.indexOf('<nzb xmlns="http://www.newzbin.com/DTD/2003/nzb">'))
			throw new Error('Missing NZB tag');
		if(!data.indexOf('<meta type="testing &amp; stuffing around">test value</meta>'))
			throw new Error('Missing 1st meta tag');
		if(!data.indexOf('<meta type="another_tag">&quot;hello world&quot;</meta>'))
			throw new Error('Missing 2nd meta tag');
		if(!data.indexOf('poster="A &lt;Poster&gt;"'))
			throw new Error('Missing poster attrib');
		if(!data.indexOf('subject="Silly&amp;File (1/1)"'))
			throw new Error('Missing subject attrib');
		if(!data.indexOf('<group>&quot;made up group&quot;</group>'))
			throw new Error('Missing particular group');
		if(!data.indexOf(' number="2"'))
			throw new Error('Missing 2nd segment');
		if(!data.indexOf('invalid&lt;name&gt;@place'))
			throw new Error('Missing 2nd segment ID');
		if(!data.indexOf('</file><file '))
			throw new Error('Missing file start/end');
		if(!data.indexOf('</nzb>'))
			throw new Error('Missing NZB close tag');
		
		// doesn't seem to be any problems otherwise...
	});
});
