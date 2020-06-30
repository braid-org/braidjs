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

You can run the chat server with:

```
cd demos/chat
node chat-server.js
```

You can run the wiki server with:
```
node demos/wiki/wiki-server.js
```

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

This will run through a bunch of trials, each initialized with a different
random seed.  What if trial 68 fails?  You can run that single trial with:

```
npm test solo 68
```

This will also print out full debugging information for that trial, so that
you can see what caused the failure.
