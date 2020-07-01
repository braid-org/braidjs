# Braidjs: Synchronization in Javascript

This contains a reference implementation in Javascript of the
[Braid protocol](https://github.com/braid-work/ietf-braid-draft), which adds
*synchronization* to HTTP.

This implementation is not yet complete, but aims to be fully-functioning and
robust enough for production sites.

Read more about braid at https://braid.news!



## Running the code
If you have nodejs installed, then set it up with:
```
npm install
```

### Chat demo
You can run the chat server with:

```
cd demos/chat
node chat-server.js
```

Then open a web browser to `http://localhost:3009/chat.html`.

### Wiki demo

You can run the wiki server with:
```
node demos/wiki/wiki-server.js
```
And then open `http://localhost:3009/<any-path-here>`.

### Seeing the guts

For any command, you can tell it to print out all network traffic in a table
by adding the command-line argument `network` to it, like this:

```
node chat-server.js network
```

Then you'll see something like this:

```
ws: hub Sends HELLO   ?    {"method":"hello","connection":"1k5kiyu5jrr","my_name_is":"hub"}
ws: hub Sends HELLO   ?    {"method":"hello","connection":"h84e6dcy9ai","my_name_is":"hub"}
ws: C1  sends HELLO   ?    {"method":"hello","connection":"lpdym7xf6u9","my_name_is":"C1"}
ws: C1  sends GET     ?    {"key":"my_key","subscribe":{"keep_alive":true},"method":"get","parents":null}
ws: C1  recvs HELLO   hub  {"method":"hello","connection":"1k5kiyu5jrr","my_name_is":"hub"}
ws: C2  sends HELLO   ?    {"method":"hello","connection":"lkg3g6sbg6","my_name_is":"C2"}
ws: C2  sends GET     ?    {"key":"my_key","subscribe":{"keep_alive":true},"method":"get","parents":null}
```

## Running tests:

```
npm test
```

If you want to see what it's doing, print out the network traffic with:

```
npm test network
```

What if one of the trials crashes?  To debug it, re-run that particular trial
with:

```
npm test solo 68
```

This will re-run trial 68, and print out debugging info so you can find the
problem and fix it.

You can also configure parameters to test at the top of `test/tests.js`.