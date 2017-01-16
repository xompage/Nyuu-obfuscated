var asyncDelay = 100;
module.exports = {
	emptyFn: function(){},
	throwErr: function(err) {
		if(err) throw err;
	},
	defer: function(f) {
		setTimeout(f, asyncDelay);
	},
	fn1: function(f) {
		var called = false;
		return function() {
			if(called) throw new Error('callback called more than once');
			called = true;
			f.apply(null, arguments);
		};
	}
};
