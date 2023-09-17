# To Test Braid-HTTP

Run the server with:

```
node server.js
```

### Test server from command-line




### Test client from the server

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

You can capture a request in unix with `nc -l 9000 > request.txt` to listen to
port 9000 while your browser initiates a request, and then capture a response
with `nc localhost 9000 < request.txt` to read the request from disk and send
it to a server running on port 9000.
