var nodeVer = '4.7.3';
var nexeBase = '.';
var nodeSrc = nexeBase + '/node/' + nodeVer + '/_/'; // TODO: auto search folder
var yencSrc = './yencode-src/';
var python = 'python';
var makeArgs = ["-j", "4"];
var vcBuildArch = "x86"; // x86 or x64

var fs = require('fs');
var ncp = require('./ncp').ncp;
var nexe = require('nexe');

var isNode010 = !!nodeVer.match(/^0\.10\./);
var modulePref = isNode010?'node_':'';
var yencodeCC = fs.readFileSync(yencSrc + 'yencode.cc').toString(); // trigger error if it doesn't exist

var gypParse = function(gyp) {
	// very hacky fixes for Python's flexibility
	gyp = gyp.replace(/'(\s*\n\s*')/g, "' +$1");
	gyp = gyp.replace(/#[^'"]*?(\r?\n)/g, "$1");
	gyp = gyp.replace(/(\n\s*)#.*?(\r?\n)/g, "$1$2");
	gyp = gyp.replace(/(\n\s*)#.*?(\r?\n)/g, "$1$2");
	gyp = gyp.replace(/(\n\s*)#.*?(\r?\n)/g, "$1$2");
	gyp = gyp.replace(/(\n\s*)#.*?(\r?\n)/g, "$1$2");
	return eval('(' + gyp + ')');
};
// monkey patch node.gyp
var gypData = fs.readFileSync(nodeSrc + 'node.gyp').toString();
var gyp = gypParse(gypData);


var findGypTarget = function(targ) {
	for(var i in gyp.targets)
		if(gyp.targets[i].target_name == targ)
			return gyp.targets[i];
	return false;
};

// changing the GYP too much breaks nexe, so resort to monkey-patching it

var doPatch = function(r, s) {
	var m = gypData.match(r);
	if(!m) throw new Error('Could not match ' + r);
	if(gypData.substr(m.index+1).match(r))
		throw new Error('Expression matched >1 times: ' + r);
	gypData = gypData.replace(r, '$1 ' + s);
};
if(!findGypTarget('crcutil')) {
	doPatch(/(\},\s*['"]targets['"]: \[)/, JSON.stringify({
	      "target_name": "crcutil",
	      "type": "static_library",
	      "sources": [
	        "crcutil-1.0/code/crc32c_sse4.cc",
	        "crcutil-1.0/code/multiword_64_64_cl_i386_mmx.cc",
	        "crcutil-1.0/code/multiword_64_64_gcc_amd64_asm.cc",
	        "crcutil-1.0/code/multiword_64_64_gcc_i386_mmx.cc",
	        "crcutil-1.0/code/multiword_64_64_intrinsic_i386_mmx.cc",
	        "crcutil-1.0/code/multiword_128_64_gcc_amd64_sse2.cc",
	        "crcutil-1.0/examples/interface.cc"
	      ],
	      "conditions": [
	        ['OS=="win"', {
	          "msvs_settings": {"VCCLCompilerTool": {"EnableEnhancedInstructionSet": "2"}}
	        }, {
	          "cxxflags": ["-msse2", "-O3", "-fomit-frame-pointer"]
	        }]
	      ],
	      "include_dirs": ["crcutil-1.0/code", "crcutil-1.0/tests"],
	      "defines": ["CRCUTIL_USE_MM_CRC32=0"]
	})+',');
}

var tNode = findGypTarget('<(node_core_target_name)');
var tNodeM = "['\"]target_name['\"]:\\s*['\"]<\\(node_core_target_name\\)['\"],";
if(!tNode) {
	tNode = findGypTarget('node');
	tNodeM = "['\"]target_name['\"]:\\s*['\"]node['\"],";
}
var tNodeMatch = new RegExp('('+tNodeM+')');
if(tNode.sources.indexOf('src/'+modulePref+'yencode.cc') < 0)
	doPatch(/(['"]src\/node_file\.cc['"],)/, "'src/"+modulePref+"yencode.cc',");
if(tNode.dependencies.indexOf('crcutil') < 0)
	doPatch(/(['"]node_js2c#host['"],)/, "'crcutil',");
if(tNode.include_dirs.indexOf('crcutil-1.0/code') < 0)
	doPatch(/(['"]deps\/uv\/src\/ares['"],)/, "'crcutil-1.0/code', 'crcutil-1.0/examples',");

if(gyp.variables.library_files.indexOf('lib/yencode.js') < 0)
	doPatch(/(['"]lib\/fs\.js['"],)/, "'lib/yencode.js',");



// urgh, copy+paste :/
if(!tNode.msvs_settings) {
	doPatch(tNodeMatch, "'msvs_settings': {'VCCLCompilerTool': {'EnableEnhancedInstructionSet': '2', 'FavorSizeOrSpeed': '2'}, 'VCLinkerTool': {'GenerateDebugInformation': 'false'}},");
} else {
	if(!tNode.msvs_settings.VCCLCompilerTool) {
		doPatch(new RegExp("(" + tNodeM + "[^]*?['\"]msvs_settings['\"]:\\s*\\{)"), "'VCCLCompilerTool': {'EnableEnhancedInstructionSet': '2', 'FavorSizeOrSpeed': '2'},");
	} else if(!tNode.msvs_settings.VCCLCompilerTool.EnableEnhancedInstructionSet) {
		doPatch(/(['"]VCCLCompilerTool['"]:\s*\{)/, "'EnableEnhancedInstructionSet': '2', 'FavorSizeOrSpeed': '2',");
	}
	
	if(!tNode.msvs_settings.VCLinkerTool) {
		doPatch(new RegExp("(" + tNodeM + "[^]*?['\"]msvs_settings['\"]:\\s*\\{)"), "'VCLinkerTool': {'GenerateDebugInformation': 'false'},");
	} else if(!tNode.msvs_settings.VCLinkerTool.GenerateDebugInformation) {
		doPatch(/(['"]VCLinkerTool['"]:\s*\{)/, "'GenerateDebugInformation': 'false',");
	}
}
if(!tNode.cxxflags) {
	doPatch(tNodeMatch, "'cxxflags': ['-Os','-msse2','-static','-flto'],");
} else if(tNode.cxxflags.indexOf('-Os') < 0) {
	doPatch(new RegExp("(" + tNodeM + "[^]*?['\"]cxxflags['\"]:\\s*\\[)"), "'-Os','-msse2','-static','-flto',");
}

if(!tNode.ldflags) {
	doPatch(tNodeMatch, "'ldflags': ['-s','-static','-flto'],");
} else if(tNode.ldflags.indexOf('-s') < 0) {
	doPatch(new RegExp("(" + tNodeM + "[^]*?['\"]ldflags['\"]:\\s*\\[)"), "'-s','-static','-flto',");
}



fs.writeFileSync(nodeSrc + 'node.gyp', gypData);


// patch manifest
var pkg = require('../package.json');
var manif = fs.readFileSync(nodeSrc + 'src/res/node.rc').toString();
manif = manif
.replace(/1 ICON node\.ico/, '')
.replace(/VALUE "CompanyName", "[^"]+"/, '')
.replace(/VALUE "ProductName", "[^"]+"/, 'VALUE "ProductName", "' + pkg.name + '"')
.replace(/VALUE "FileDescription", "[^"]+"/, 'VALUE "FileDescription", "' + pkg.description + '"')
.replace(/VALUE "FileVersion", NODE_EXE_VERSION/, 'VALUE "FileVersion", "' + pkg.version + '"')
.replace(/VALUE "ProductVersion", NODE_EXE_VERSION/, 'VALUE "ProductVersion", "' + pkg.version + '"')
.replace(/VALUE "InternalName", "[^"]+"/, 'VALUE "InternalName", "nyuu"');
fs.writeFileSync(nodeSrc + 'src/res/node.rc', manif);


var patchGypCompiler = function(file, targets) {
	// require SSE2; TODO: tweak this?
	var gypData = fs.readFileSync(nodeSrc + file).toString();
	var gyp = gypParse(gypData);
	
	if(!gyp.target_defaults) {
		targets = targets || 'targets';
		gypData = gypData.replace("'"+targets+"':", "'target_defaults': {'msvs_settings': {'VCCLCompilerTool': {'EnableEnhancedInstructionSet': '2', 'FavorSizeOrSpeed': '2'}, 'VCLinkerTool': {'GenerateDebugInformation': 'false'}}, 'cxxflags': ['-Os','-msse2','-static','-flto'], 'ldflags': ['-s','-static','-flto']}, '"+targets+"':");
	} else {
		// TODO: other possibilities
		if(!gyp.target_defaults.msvs_settings)
			gypData = gypData.replace("'target_defaults': {", "'target_defaults': {'msvs_settings': {'VCCLCompilerTool': {'EnableEnhancedInstructionSet': '2', 'FavorSizeOrSpeed': '2'}, 'VCLinkerTool': {'GenerateDebugInformation': 'false'}},");
		else if(!gyp.target_defaults.msvs_settings.VCCLCompilerTool || !gyp.target_defaults.msvs_settings.VCLinkerTool || !gyp.target_defaults.msvs_settings.VCCLCompilerTool.EnableEnhancedInstructionSet)
			throw new Error('To be implemented');
		if(!gyp.target_defaults.cxxflags)
			gypData = gypData.replace("'target_defaults': {", "'target_defaults': {'cxxflags': ['-Os','-msse2','-static','-flto'],");
		else if(gyp.target_defaults.cxxflags.indexOf('-flto') < 0)
			throw new Error('To be implemented');
		if(!gyp.target_defaults.ldflags)
			gypData = gypData.replace("'target_defaults': {", "'target_defaults': {'ldflags': ['-s','-static','-flto'],");
		else if(gyp.target_defaults.ldflags.indexOf('-flto') < 0)
			throw new Error('To be implemented');
	}
	
	fs.writeFileSync(nodeSrc + file, gypData);
};
//patchGypCompiler('node.gyp');
patchGypCompiler('deps/cares/cares.gyp');
//patchGypCompiler('deps/http_parser/http_parser.gyp');
patchGypCompiler('deps/openssl/openssl.gyp');
patchGypCompiler('deps/uv/uv.gyp');
patchGypCompiler('deps/zlib/zlib.gyp', 'conditions');
if(fs.existsSync(nodeSrc + 'deps/v8/src/v8.gyp'))
	patchGypCompiler('deps/v8/src/v8.gyp');
else
	patchGypCompiler('deps/v8/tools/gyp/v8.gyp');




if(fs.existsSync(nodeSrc + 'src/node_extensions.h')) { // node 0.10.x
	var ext = fs.readFileSync(nodeSrc + 'src/node_extensions.h').toString();
	ext = ext.replace('\nNODE_EXT_LIST_START', '\nNODE_EXT_LIST_START\nNODE_EXT_LIST_ITEM('+modulePref+'yencode)');
	fs.writeFileSync(nodeSrc + 'src/node_extensions.h', ext);
}

// create embeddable help
fs.writeFileSync('../bin/help.json', JSON.stringify({
	full: fs.readFileSync('../help.txt').toString(),
	short: fs.readFileSync('../help-short.txt').toString()
}));


// copy yencode sources across
if(isNode010)
	yencodeCC = yencodeCC.replace('NODE_MODULE(yencode', 'NODE_MODULE('+modulePref+'yencode');
else
	yencodeCC = yencodeCC.replace('NODE_MODULE(', 'NODE_MODULE_CONTEXT_AWARE_BUILTIN(');
fs.writeFileSync(nodeSrc + 'src/'+modulePref+'yencode.cc', yencodeCC);

var yencodeJs = fs.readFileSync(yencSrc + 'index.js').toString();
yencodeJs = yencodeJs.replace(/require\(['"][^'"]*yencode\.node'\)/g, "process.binding('yencode')");
fs.writeFileSync(nodeSrc + 'lib/yencode.js', yencodeJs);

fs.readdirSync(yencSrc).forEach(function(f) {
	if(f == 'yencode.cc' || f == 'index.js' || f.match(/^test/)) return;
	
	var dst;
	if(f.match(/\.(c|cpp|cc|h)$/))
		dst = 'src/' + f;
	else if(f.match(/\.js$/))
		dst = 'lib/' + f;
	
	if(dst) {
		fs.writeFileSync(nodeSrc + dst, fs.readFileSync(yencSrc + f));
	}
});
ncp(yencSrc + 'crcutil-1.0', nodeSrc + 'crcutil-1.0', function() {
	
	
	// now run nexe
	// TODO: consider building startup snapshot?
	
	nexe.compile({
	    input: '../bin/nyuu.js', // where the input file is
	    output: './nyuu' + (require('os').platform() == 'win32' ? '.exe':''), // where to output the compiled binary
	    nodeVersion: nodeVer, // node version
	    nodeTempDir: nexeBase, // where to store node source.
	    nodeConfigureArgs: ['--fully-static', '--without-dtrace', '--without-etw', '--without-perfctr', '--without-npm', '--with-intl=none'], // for all your configure arg needs.
	    nodeMakeArgs: makeArgs, // when you want to control the make process.
	    nodeVCBuildArgs: ["nosign", vcBuildArch], // when you want to control the make process for windows.
	                                        // By default "nosign" option will be specified
	                                        // You can check all available options and its default values here:
	                                        // https://github.com/nodejs/node/blob/master/vcbuild.bat
	    python: python, // for non-standard python setups. Or python 3.x forced ones.
	    resourceFiles: [  ], // array of files to embed.
	    resourceRoot: [  ], // where to embed the resourceFiles.
	    flags: true, // use this for applications that need command line flags.
	    jsFlags: "", // v8 flags
	    startupSnapshot: '', // when you want to specify a script to be
	                                            // added to V8's startup snapshot. This V8
	                                            // feature deserializes a heap to save startup time.
	                                            // More information in this blog post:
	                                            // http://v8project.blogspot.de/2015/09/custom-startup-snapshots.html
	    framework: "node", // node, nodejs, or iojs
	    
	    browserifyExcludes: ['yencode','xz','../node_modules/xz/package.json']
	}, function(err) {
	    if(err) {
	        return console.log(err);
	    }
	    
	    console.log('done');
	    fs.unlinkSync('../bin/help.json');
	});
});
