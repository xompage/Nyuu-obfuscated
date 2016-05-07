Nyuu
====

>   *A powerful beast hidden by a deceptively cute exterior*

Nyuu is a **command-line [usenet
binary](<https://en.wikipedia.org/wiki/Usenet#Binary_content>) posting tool**.

Nyuu is designed primarily to be fast, efficient and customizable, exposing all
the interesting bits and pieces.

Nyuu runs on top of node.js (which *everyone* knows is [bad ass rock star
tech](<https://www.youtube.com/watch?v=bzkRVzciAZg>)) with minimal dependencies.
It does require one compiled module,
[yencode](<https://animetosho.org/app/node-yencode>), for ultra fast yEnc and
CRC32 calculation.

 

Note that Nyuu is currently still under heavy development and many features may
not work properly or even be implemented. As with any other experimental
subject, use precaution.

Features
========

**All the standard stuff:** i.e. Nyuu doesn’t miss out on what you need

-   NNTP SSL support

-   yEnc encoding

-   NZB creation, with minification & compression

-   Sub-directory handling

**Fast & efficient:** Nyuu is amongst the fastest (if not [the
fastest](<bench/info.md#benchmark-2>)) usenet posters

-   Multiple uploading connections

-   Post checking is asynchronous (minimal impact on speed)

-   Fastest yEnc and CRC32 implementations

-   Buffered async I/O (minimise the effects of slow disks)

-   No temporary files, no disk writes (except for writing the NZB output)

-   No unnecessary disk reads - only performs a single, sequential read pass
    over files

    -   PAR2 generation (when integrated) will require an extra initial pass of
        just the first 16KB of each file, and may require multiple read passes
        if all recovery blocks cannot fit in memory

**Reliable:** Nyuu was designed for automation and its reliability requirements

-   Requests are all retryable

-   Able to recover from connection failures/dropouts

-   Timeouts and limits to deal with unexpected server hangs or faults

-   Can selectively skip/ignore some errors

-   Post checking (aka header checks), with multiple attempts and post retrying

-   Unusual or unexpected events are logged

**Highly configurable:** tuning knobs for everything

-   Lots of connection and SSL options

-   NNTP article posting: article/line sizes, header customisation

-   Configure timeouts, delays and error handling parameters

-   NZB meta tags

**Unique features:** the not so usual stuff

-   Pipe input/output from/to processes instead of files

-   Extensive upload diagnostic details available (via optional TCP/HTTP status
    server) to help tune settings or find problems

Installation & Requirements
===========================

Nyuu should run on node.js 0.10.x and later. Recent Linux distributions should
have *nodejs* in their repositories, otherwise, see
[NodeSource](<https://github.com/nodesource/distributions>). For Windows/OSX
builds, they [can be found here](<https://nodejs.org/en/download/stable/>).
Although node.js 0.10.x is supported, newer versions of Node provide greatly
improved SSL performance.

Nyuu download packages can be found on [the releases
page](<https://github.com/animetosho/Nyuu/releases>). Pre-packaged Windows
builds with Node 4.4.3 may also exist there if I can be bothered to provide
them.

Dependencies
------------

If you have NPM installed (may come with your install of NodeJS), the following
command (executed inside the Nyuu directory) is all you need to set up the
dependencies:

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
npm install --no-optional --production
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

If you don’t want to use NPM, you can use your package manager instead if it has
all the necessary packages - on Debian 9 / Ubuntu 15.10:

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
apt-get install node-minimist node-async
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Alternatively, you can grab the dependencies manually: create a directory named
*node\_modules* in the Nyuu directory. Inside of which, place
[async](<https://github.com/caolan/async/releases>) and
[minimist](<https://github.com/substack/minimist/releases>).

For yencode, you’ll need to place it in the *node\_modules* directory as well,
then follow [the installation
instructions](<https://animetosho.org/app/node-yencode>).

At the end, the folder structure should resemble something like (not all files
shown):

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Nyuu/
- bin/
- lib/
- node_modules/
  - async/
    - package.json
  - minimist/
    - index.js
  - yencode/
    - index.js
package.json
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Executable
----------

Once dependencies have been installed, Nyuu can be run via `node bin/nyuu` or
`nodejs bin/nyuu`. If you wish to just use `nyuu` instead, you need to link to
it from somewhere your *PATH* environment points to. For example, on Linux you
might do

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
ln -s "`pwd`/bin/nyuu.js" /usr/bin/nyuu
chmod a+x bin/nyuu.js
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

(if Node is running via *nodejs* instead of *node*, you can edit the first line
in *bin/nyuu.js* to fix this)

For Windows, you can make a file named *nyuu.cmd* and place it in your system
directory, with the following contents:

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
@"C:\node\node.exe" "C:\path\to\nyuu\bin\nyuu.js" %*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

(obviously, fix the paths to what they actually are)

Optional Modules
----------------

You may have noticed the `--no-optional` flag for NPM above. You can remove that
flag when doing `npm install` to enable additional features, if you need them.
The following modules have been marked optional:

-   [xz](<https://www.npmjs.com/package/xz>): enables NZBs to be compressed
    using xz via the `--nzb-compress xz` option

Running Tests
-------------

Tests are run via *mocha*, installable via `npm install -g mocha`, and can be
run simply by using the `mocha` command inside Nyuu’s root directory.  
Note that some test cases test functionality of timeouts; to reduce time it
takes to run these tests, timeouts are set relatively small, which means that a
slow computer may not be able to service them as expected.

Usage
=====

For command line usage, [see here](<help.txt>).

As an example, if you’re interested in the exact command used by the Anime Tosho
usenet bot, here it is: (note, this may not be optimal for you)

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
/usr/bin/nodejs bin/nyuu --user [user] --password [pass] --host [host] --from "Anime Tosho <usenet.bot@animetosho.org>" --connections 8 --minify --log-time --group-files --skip-errors post-timeout,check-timeout,check-missing --ignore-post-timeout --check-tries 4 --check-post-tries 2 --check-connections 1 --progress http:localhost --subdirs keep --disk-req-size 30000K --post-queue-size 16 --request-retries 8 -H "Organization=Anime Tosho" [folder] --comment [torrentname] -M "x-generator=Nyuu [https://animetosho.org/app/nyuu]" -M "title=[torrentname]" -M "x-info-url=https://animetosho.org/view/[id]" --groups alt.binaries.multimedia.anime.highspeed --preload-modules -o "proc:///usr/bin/7z a -tgzip -bd -mx=9 -si [nzb]" 2>>[logfile]
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Planned Features
================

-   Integrate [ParPar](<https://animetosho.org/app/parpar>) for streaming PAR2
    creation

-   Streaming 7-Zip creation

-   Multi-server support for both posting and checking

-   Repost missing articles from NZB, and/or some sort of resumption support

-   SOCKS proxy support

-   A web (HTTP) interface would be nice as an alternative to the command line
    interface; not sure if it will be done however

Not planned
-----------

-   RAR support, since 7-Zip should cover everything  

Alternatives
============

The following are all the command-line usenet posters I could find, along with
my rather sour and depressing comments. Many of these are probably great, but,
competition and, ya'know...

-   [GoPostStuff](<https://github.com/madcowfred/GoPostStuff/>): newer post tool
    written in Go, by the same author as Newsmangler. Haven’t tested it. Doesn’t
    appear to support NZB generation.

-   [Newsmangler](<https://github.com/madcowfred/newsmangler>): no longer
    maintained tool written in Python. Relatively basic and lacks some features
    I’d like to have (e.g. specifying where NZBs are written to), but otherwise
    quite capable. Updated forks, which add extra functionality, [do
    exist](<https://github.com/nicors57/newsmangler>).

-   [Newspost](<https://github.com/joehillen/newspost>): fairly old unmaintained
    tool written in C. Powerful, but does not generate NZBs and not particularly
    efficient. [bytesbacon](<https://www.reddit.com/user/bytesbacon>) has also
    pointed out that a [threaded fork
    exists](<https://github.com/PietjeBell88/newspost>), which greatly improves
    its efficiency.

-   [NewsUP](<https://github.com/demanuel/NewsUP/>): flexible tool written in
    Perl. Still quite actively maintained.

-   [Sanguinews](<https://github.com/tdobrovolskij/sanguinews>): inspired from
    Newsmangler and similar in a number of ways. Written in Ruby.

-   [Yencee](<https://sourceforge.net/projects/yencee/>): simple tool written in
    Perl. No NZB output.

-   [Ypost](<https://sourceforge.net/projects/ypost/>): old tool written in C++.
    Does not generate NZBs.

(to continue the obvious tradition of using a different language, Nyuu is
written in Javascript)

[Here's a benchmark comparison](<bench/info.md>) between a few of the above.

License
=======

Nyuu is **Public Domain**. Use her as you will, at your own risk of course
(don’t come back crying if you lose a limb or two).
