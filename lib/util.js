"use strict";

// for handling object keys case-insensitively
exports.getNCaseKey = function(obj, key) {
	key = exports.getNCaseKeyIndex(obj, key);
	if(key) return obj[key];
};
exports.getNCaseKeyIndex = function(obj, key) {
	key = key.toLowerCase();
	for(var k in obj) {
		if(k.toLowerCase() === key)
			return k;
	}
};
exports.setNCaseKey = function(obj, key, val) {
	key = key.toLowerCase();
	for(var k in obj) {
		if(k.toLowerCase() === key)
			obj[k] = val;
	}
};

// shallow clone
exports.clone = function(obj) {
	var cloned = {};
	for(var k in obj)
		cloned[k] = obj[k];
	return cloned;
};
