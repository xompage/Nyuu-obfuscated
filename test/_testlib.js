var asyncDelay = 100;
module.exports = {
	emptyFn: function(){},
	throwErr: function(err) {
		if(err) throw err;
	},
	defer: function(f) {
		setTimeout(f, asyncDelay);
	}
};
