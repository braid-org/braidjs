# To Test Braid-HTTP

Run the server with:

```
node server.js
```

### Test the server alone

Run this at your command-line:

```
$ curl -v -H Subscribe:true http://localhost:9000/json
```

You should see this:

```
*   Trying 127.0.0.1:9000...
* Connected to localhost (127.0.0.1) port 9000 (#0)
> GET /json HTTP/1.1
> Host: localhost:9000
> User-Agent: curl/7.79.1
> Accept: */*
> Subscribe:true
> 
* Mark bundle as not supporting multiuse
< HTTP/1.1 209 unknown
< Range-Request-Allow-Methods: PATCH, PUT
< Range-Request-Allow-Units: json
< content-type: application/json
< subscribe: true
< cache-control: no-cache, no-transform
< X-Accel-Buffering: no
< Date: Wed, 29 May 2024 13:05:38 GMT
< Connection: keep-alive
< Keep-Alive: timeout=5
< Transfer-Encoding: chunked
< 
Version: "test"
Parents: "oldie"
Content-Length: 16

{"this":"stuff"}

Version: "test1"
Parents: "oldie", "goodie"
hash: 42
:status: 115
Content-Length: 1
Content-Range: json [1]

1

Version: "test2"
Content-Length: 1
Content-Range: json [2]

2

Version: "test3"
Patches: 2

Content-Length: 1
Content-Range: json [3]
hash: 43

3

Content-Length: 1
Content-Range: json [4]

4

Version: "another!"
Content-Length: 3

"!"

```
...and the connection should stay open until you hit `C-c`.


### Test the client against the server

Open a browser to:
```
http://localhost:9000/
```

The page will run a series of GET+subscribe and PUT tests, and then turn green
if they succeed, and red if they failed.

If you kill and restart the server, the browser should wait a second,
reconnect and then display a **Reconnection Results** section that looks like
this:

```
Read 1 connection died
Read 3 connection died
Read 2 connection died
Read 1 {"version":"test","parents":["oldie"],"body":"{\"this\":\"stuff\"}"}!
Read 1 {"version":"test1","parents":["oldie","goodie"],"patches":[{"unit":"json","range":"[1]","content":"1"}]}!
Read 1 {"version":"test2","patches":[{"unit":"json","range":"[2]","content":"2"}]}!
Read 1 {"version":"test3","patches":[{"headers":{"content-length":"1","content-range":"json [3]"},"unit":"json","range":"[3]","content":"3"},{"headers":{"content-length":"1","content-range":"json [4]"},"unit":"json","range":"[4]","content":"4"}]}!
Read 3 {"version":"test","parents":["oldie"],"body":"{\"this\":\"stuff\"}"}!
Read 2 {"version":"test","parents":["oldie"],"body":"{\"this\":\"stuff\"}"}!
Read 2 {"version":"test1","parents":["oldie","goodie"],"patches":[{"unit":"json","range":"[1]","content":"1"}]}!
Read 2 {"version":"test2","patches":[{"unit":"json","range":"[2]","content":"2"}]}!
Read 2 {"version":"test3","patches":[{"headers":{"content-length":"1","content-range":"json [3]"},"unit":"json","range":"[3]","content":"3"},{"headers":{"content-length":"1","content-range":"json [4]"},"unit":"json","range":"[4]","content":"4"}]}!
Read 1 {"version":"another!","body":"!"}!
Read 3 {"version":"another!","body":"!"}!
Read 2 {"version":"another!","body":"!"}!
```


### Debugging Advice

If the client tests fail, plug them into https://glittle.org/diff to see
what's wrong.

You can capture a request in unix with `nc -l 9000 > test-request.txt` to listen to
port 9000 while your browser initiates a request, and then capture a response
with `nc localhost 9000 < test-request.txt` to read the request from disk and send
it to a server running on port 9000.
