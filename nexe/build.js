var nodeVer = '4.9.1';
var nexeBase = '.';
var nodeSrc = nexeBase + '/node/' + nodeVer + '/_/'; // TODO: auto search folder
var yencSrc = './yencode-src/';
var python = 'python';
var makeArgs = ["-j", "1"];
var vcBuildArch = "x86"; // x86 or x64
var useLTO = true;

var fs = require('fs');
var ncp = require('./ncp').ncp;
var nexe = require('nexe');

var isNode010 = !!nodeVer.match(/^0\.10\./);
var ltoFlag = useLTO ? '"-flto"' : '';
var ltoFlagC = useLTO ? ',"-flto"' : '';
var modulePref = isNode010?'node_':'';
fs.statSync(yencSrc + 'yencode.cc'); // trigger error if it doesn't exist

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

var doPatch = function(r, s, ignoreMissing) {
	var m = gypData.match(r);
	if(!m) {
		if(ignoreMissing) return;
		throw new Error('Could not match ' + r);
	}
	if(!r.global && gypData.substr(m.index+1).match(r))
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
	        }, (vcBuildArch == 'x86' ? {
	          "cxxflags": ["-msse2", "-O3", "-fomit-frame-pointer"],
	          // some of the ASM won't compile with LTO, so disable it for CRCUtil
	          "cflags!": ['-flto'],
	          "cxxflags!": ['-flto']
	        } : {
	          "cxxflags": ["-msse2", "-O3", "-fomit-frame-pointer"].concat(useLTO ? ['-flto'] : [])
	        })]
	      ],
	      "include_dirs": ["crcutil-1.0/code", "crcutil-1.0/tests"],
	      "defines": ["CRCUTIL_USE_MM_CRC32=0"]
	})+',');
}

var tNode = findGypTarget('<(node_lib_target_name)');
var tNodeM = "['\"]target_name['\"]:\\s*['\"]<\\(node_lib_target_name\\)['\"],";
if(!tNode) {
	tNode = findGypTarget('<(node_core_target_name)');
	tNodeM = "['\"]target_name['\"]:\\s*['\"]<\\(node_core_target_name\\)['\"],";
}
if(!tNode) {
	tNode = findGypTarget('node');
	tNodeM = "['\"]target_name['\"]:\\s*['\"]node['\"],";
}
var tNodeMatch = new RegExp('('+tNodeM+')');
if(tNode.sources.indexOf('src/'+modulePref+'yencode.cc') < 0)
	doPatch(/(['"]src\/node_file\.cc['"],)/, "'src/"+modulePref+"yencode.cc',");
if(tNode.dependencies.indexOf('crcutil') < 0)
	// try to avoid matching the cctest target
	doPatch(/('target_name': '<\([^\]]+?['"]node_js2c#host['"],)/, "'crcutil',");
if(tNode.include_dirs.indexOf('crcutil-1.0/code') < 0)
	doPatch(/(['"]<\(SHARED_INTERMEDIATE_DIR\)['"],? # for node_natives\.h\r?\n)/g, "'crcutil-1.0/code', 'crcutil-1.0/examples',");

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
	doPatch(tNodeMatch, "'cxxflags': ['-Os','-msse2'"+ltoFlagC+"],");
} else if(tNode.cxxflags.indexOf('-Os') < 0) {
	doPatch(new RegExp("(" + tNodeM + "[^]*?['\"]cxxflags['\"]:\\s*\\[)"), "'-Os','-msse2'"+ltoFlagC+",");
}

if(!tNode.ldflags) {
	doPatch(tNodeMatch, "'ldflags': ['-s'"+ltoFlagC+"],");
} else if(tNode.ldflags.indexOf('-s') < 0) {
	doPatch(new RegExp("(" + tNodeM + "[^]*?['\"]ldflags['\"]:\\s*\\[)"), "'-s'"+ltoFlagC+",");
}

// strip OpenSSL exports
doPatch(/('use_openssl_def':) 1,/, "0,", true);


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
		gypData = gypData.replace("'"+targets+"':", "'target_defaults': {'msvs_settings': {'VCCLCompilerTool': {'EnableEnhancedInstructionSet': '2', 'FavorSizeOrSpeed': '2'}, 'VCLinkerTool': {'GenerateDebugInformation': 'false'}}, 'cxxflags': ['-Os','-msse2'"+ltoFlagC+"], 'ldflags': ['-s'"+ltoFlagC+"]}, '"+targets+"':");
	} else {
		// TODO: other possibilities
		if(!gyp.target_defaults.msvs_settings)
			gypData = gypData.replace("'target_defaults': {", "'target_defaults': {'msvs_settings': {'VCCLCompilerTool': {'EnableEnhancedInstructionSet': '2', 'FavorSizeOrSpeed': '2'}, 'VCLinkerTool': {'GenerateDebugInformation': 'false'}},");
		else if(!gyp.target_defaults.msvs_settings.VCCLCompilerTool || !gyp.target_defaults.msvs_settings.VCLinkerTool || !gyp.target_defaults.msvs_settings.VCCLCompilerTool.EnableEnhancedInstructionSet)
			throw new Error('To be implemented');
		if(!gyp.target_defaults.cxxflags)
			gypData = gypData.replace("'target_defaults': {", "'target_defaults': {'cxxflags': ['-Os','-msse2'"+ltoFlagC+"],");
		else if(useLTO && gyp.target_defaults.cxxflags.indexOf('-flto') < 0)
			throw new Error('To be implemented');
		if(!gyp.target_defaults.ldflags)
			gypData = gypData.replace("'target_defaults': {", "'target_defaults': {'ldflags': ['-s'"+ltoFlagC+"],");
		else if(useLTO && gyp.target_defaults.ldflags.indexOf('-flto') < 0)
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



var patchFile = function(path, find, replFrom, replTo) {
	var ext = fs.readFileSync(nodeSrc + path).toString();
	if(!find || !ext.match(find)) {
		ext = ext.replace(replFrom, replTo);
		fs.writeFileSync(nodeSrc + path, ext);
	}
};

// TODO: improve placement of ldflags
patchFile('common.gypi', null, "'cflags': [ '-O3',", (useLTO ? "'ldflags': ['-flto'], ":'')+"'cflags': [ '-Os','-msse2'"+ltoFlagC+",");
patchFile('common.gypi', null, "'FavorSizeOrSpeed': 1,", "'FavorSizeOrSpeed': 2, 'EnableEnhancedInstructionSet': '2',");
patchFile('common.gypi', null, "'GenerateDebugInformation': 'true',", "'GenerateDebugInformation': 'false',");

// TODO: set AR=gcc-ar if ar fails

if(fs.existsSync(nodeSrc + 'src/node_extensions.h')) { // node 0.10.x
	patchFile('src/node_extensions.h', 'yencode', '\nNODE_EXT_LIST_START', '\nNODE_EXT_LIST_START\nNODE_EXT_LIST_ITEM('+modulePref+'yencode)');
}

// strip exports
patchFile('src/node.h', 'define NODE_EXTERN __declspec(dllexport)', 'define NODE_EXTERN __declspec(dllexport)', 'define NODE_EXTERN');
patchFile('common.gypi', null, /'BUILDING_(V8|UV)_SHARED=1',/g, '');


// create embeddable help
fs.writeFileSync('../bin/help.json', JSON.stringify({
	full: fs.readFileSync('../help-full.txt').toString(),
	short: fs.readFileSync('../help.txt').toString()
}));


// copy yencode sources across
var copyCC = function(src, dest) {
	var code = fs.readFileSync(src).toString();
	if(isNode010)
		code = code.replace(/NODE_MODULE\(([a-z0-9_]+)/, 'NODE_MODULE('+modulePref+'$1');
	else
		code = code.replace('NODE_MODULE(', 'NODE_MODULE_CONTEXT_AWARE_BUILTIN(');
	if(dest.substr(0, 3) != '../')
		dest = nodeSrc + dest;
	fs.writeFileSync(dest, code);
};
var copyJS = function(src, dest) {
	var code = fs.readFileSync(src).toString();
	code = code.replace(/require\(['"][^'"]*\/([0-9a-z_]+)\.node'\)/g, "process.binding('$1')");
	if(dest.substr(0, 3) != '../')
		dest = nodeSrc + dest;
	fs.writeFileSync(dest, code);
};
copyCC(yencSrc + 'yencode.cc', 'src/'+modulePref+'yencode.cc');
copyJS(yencSrc + 'index.js', 'lib/yencode.js');

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
	// note: on alpine, need to run `paxmark -m out/Release/mksnapshot` first and maybe `paxmark -m out/Release/node` at the end; see https://github.com/alpinelinux/aports/blob/master/main/nodejs/APKBUILD
	
	nexe.compile({
	    input: '../bin/nyuu.js', // where the input file is
	    output: './nyuu' + (require('os').platform() == 'win32' ? '.exe':''), // where to output the compiled binary
	    nodeVersion: nodeVer, // node version
	    nodeTempDir: nexeBase, // where to store node source.
	    // --without-snapshot
	    nodeConfigureArgs: ['--fully-static', '--without-dtrace', '--without-etw', '--without-perfctr', '--without-npm', '--with-intl=none', '--dest-cpu=' + vcBuildArch], // for all your configure arg needs.
	    nodeMakeArgs: makeArgs, // when you want to control the make process.
	    nodeVCBuildArgs: ["nosign", vcBuildArch, "noetw", "noperfctr", "intl-none"], // when you want to control the make process for windows.
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
	    
	    browserifyExcludes: ['yencode','xz','../node_modules/xz/package.json','iltorb','../node_modules/iltorb/package.json']
	}, function(err) {
	    if(err) {
	        return console.log(err);
	    }
	    
	    console.log('done');
	    fs.unlinkSync('../bin/help.json');
	    
	    // paxmark -m nyuu
	    // tar --group=nobody --owner=nobody -cf nyuu-v0.3.8-linux-x86-sse2.tar nyuu ../config-sample.json
	    // xz -9e --x86 --lzma2 *.tar
	    
	});
});
