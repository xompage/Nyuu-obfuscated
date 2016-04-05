Here are some very rushed and unscientific benchmarks of a few command line
binary Usenet posters.  
I did this because I couldn't find anything like this out there and it provides
a rough idea of where Nyuu stands amongst the rest. But if anyone has the time
to do better benchmarks, please do submit a pull request!

Test was done on an Atom C2750 CPU, 8GB RAM, 1TB 7200rpm drive, running Linux
3.16 amd64. To avoid variations caused by network latency, uploading was done to
a local install of cyrus-nntpd on the same machine. The news folder was mounted
on a RAM disk to get rid of disk bottlenecks on the server.

Only a single 1GB file was uploaded; this file was generated via `dd
if=/dev/urandom of=rnd1g bs=1M count=1024`. Due to the repeated testing, this
file was cached in memory, so disk reads by the various news posters were all
pretty much 0.

Settings were generally left at default, with minimal changes to get things
working. General changes:

-   number of connections = 4

-   article size: 768000 bytes

-   SSL, both on/off tested

-   in general, anything unnecessary was disabled, such as NZB output and header
    checking

Speeds were obtained using the [time
utility](<http://man7.org/linux/man-pages/man1/time.1.html>). CPU speed is
1024MB divided by the sum of the user and system time. Overall speed is 1024MB
divided by the total process time.

 

Applications Tested
-------------------

-   GoPostStuff (git 2015-02-16) on Go 1.3.3

-   NewsUP (git 2016-03-16) on Perl 5.20.2

-   Nyuu (git 2016-03-31) on NodeJS 0.10.42

-   Newsmangler (git 2014-01-01) [no SSL support] on Python 2.7.9 + yenc 0.2

-   Newsmangler, nicors57's fork (git 2016-03-26) on Python 2.7.9 + yenc 0.2

-   Sanguinews 0.7.0 on Ruby 2.1.5

-   Newspost 2.1.1 [no SSL support], as a reference point

 

Results
-------

![](<no-ssl.png>)

![](<ssl.png>)

![](<rss.png>)

 

Notes
-----

-   The old Newspost doesn't support multiple connections, so generally falls
    behind the more modern clients that do. As this was mostly for reference
    purposes, the following points won't discuss this client.

-   Results for Sanguinews seems unusually high. Maybe the native yEnc isn't
    being used. As such, the following statements will ignore these results  
    If anyone can find a possible reason for this, please do tell.

-   Posting speed between the applications are fairly similar at 4 connections
    (perhaps limited by the NNTP server)

-   GoPostStuff's memory usage seems to indicate that it may be loading the
    entire file into memory (mmap?)

-   Nyuu's CPU usage is the lowest, thanks to the highly optimized yEnc and CRC
    implementation on x86, however memory usage is currently its weak point. I
    suspect that this is largely due to NodeJS’ streams being rather memory
    hungry - unfortunately, Node/V8's memory management does leave a lot to be
    desired at times... I plan to improve this in later versions.
