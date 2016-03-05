Nyuu
====

>   *A powerful beast hidden by a deceptively cute exterior*

Nyuu is a **command-line usenet binary posting tool**.

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

All the usual:

-   NNTP SSL support

-   yEnc encoding

-   Header checking

-   NZB creation, with minification & compression

-   Sub-directory handling

**Fast & efficient:**

-   Multiple uploading connections

-   Header check is asynchronous (minimal impact on speed)

-   Fastest yEnc and CRC32 implementations

-   Buffered async I/O (minimise the effects of slow disks)

-   No temporary files, no disk writes (except for writing the NZB output)

-   No unnecessary disk reads - only performs a single, sequential read pass
    over files

    -   PAR2 generation (when integrated) will require an extra initial pass of
        just the first 16KB of each file, and may require multiple read passes
        if all recovery blocks cannot fit in memory

**Highly configurable:**

-   NNTP article posting: article/line sizes, header customisation

-   Configure timeouts, delays and error handling parameters

-   NZB meta tags

 

Installation & Requirements
===========================

Nyuu should run on node.js 0.10.x and later. Recent Linux distributions should
have *nodejs* in their repositories, otherwise, see
[NodeSource](<https://github.com/nodesource/distributions>). For Windows/OSX
builds, they [can be found here](<https://nodejs.org/en/download/stable/>).

Dependencies
------------

If you have NPM installed (may come with your install of NodeJS), the following
command (executed inside the Nyuu directory) is all you need to set up the
dependencies:

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
npm install
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

 

Usage
=====

For command line usage, [see here](<help.txt>).

 

Planned Features
================

-   Automatic SFV/MD5 file generation. For SFV, we can use the calculated CRC32
    values from yEnc so that there’s minimal CPU impact and no impact on disk.
    MD5 can be taken from the PAR2 generation pass (if enabled, otherwise it
    will need to be re-calculated, but we can still avoid the disk hit since
    calculation will be streamed)

-   PAR2 generation support

-   automatic 7-Zip wrapping

Not planned
-----------

-   RAR support, since 7-Zip should cover everything  

 

Alternatives
============

The following are all the command-line usenet posters I could find:

-   [Newsmangler](<https://github.com/alexis57/newsmangler>): no longer
    maintained tool written in Python. Relatively basic and lacks some features
    I’d like to have (e.g. specifying where NZBs are written to), but otherwise
    quite capable.

-   [Newspost](<https://github.com/joehillen/newspost>): fairly old unmaintained
    tool written in C. Powerful, but does not generate NZBs and not particularly
    efficient.

-   [NewsUP](<https://github.com/demanuel/NewsUP/>): flexible tool written in
    Perl. Unfortunately yEnc calculation is implemented in Perl, so will smash
    your CPU.

-   [Sanguinews](<https://github.com/tdobrovolskij/sanguinews>): inspired from
    Newsmangler and similar in a number of ways. Written in Ruby.

-   [Yencee](<https://sourceforge.net/projects/yencee/>): simple tool written in
    Perl. No NZB output.

-   [Ypost](<https://sourceforge.net/projects/ypost/>): newer tool written in
    C++. Does not generate NZBs.

(to continue the obvious tradition of using a different language, Nyuu is
written in Javascript)

 

License
=======

Nyuu is **Public Domain**. Use her as you will, at your own risk of course
(don’t come back crying if you lose a limb or two).
