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
< subscribe: true
< cache-control: no-cache, no-transform
< transfer-encoding: 
< Date: Mon, 18 Sep 2023 01:59:37 GMT
< Connection: keep-alive
< Keep-Alive: timeout=5
< 
version: "test"
content-length: 16

{"this":"stuff"}

version: "another!"
content-length: 0

```
...and the connection should stay open until you hit `C-c`.


### Test the client and server together

Open a browser to:
```
http://localhost:9000/
```

You should see this in the browser:

```
We got 1 {"version":"test","body":"{\"this\":\"stuff\"}"}!
We got 2 {"version":"test","body":"{\"this\":\"stuff\"}"}!
We got 3 {"version":"test","body":"{\"this\":\"stuff\"}"}!
We got 1 {"version":"another!","body":""}!
We got 2 {"version":"another!","body":""}!
We got 3 {"version":"another!","body":""}!
```

If you kill and restart the server, the browser should wait a second,
reconnect and then display this again.


### Debugging Advice

You can capture a request in unix with `nc -l 9000 > test-request.txt` to listen to
port 9000 while your browser initiates a request, and then capture a response
with `nc localhost 9000 < test-request.txt` to read the request from disk and send
it to a server running on port 9000.
