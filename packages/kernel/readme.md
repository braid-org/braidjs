# A prototype Braid Kernel

An abstraction for distributed state.

## Status

We've built some cool algorithms in here, but it isn't cleaned up for release
yet.  Mike is working on it!

## Running the code
If you have nodejs installed, then set it up with:
```
npm install
```

### Chat demo
You can run the chat server with:

```
cd demos/sync9-chat
node chat-server.js
```

Then open a web browser to `http://localhost:3009/braidchat` (for a websocket connection) or `.../braidchat?protocol=http` for a backwards-compatible http/1.1 connection.

### Wiki demo

You can run the wiki server with:
```
node demos/wiki/wiki-server.js
```
And then open `http://localhost:3009/<any-path-here>`.

### Seeing the guts

For any command, you can tell it to print out all network traffic in a table
by adding the command-line argument `--network` to it, like this:

```
node chat-server.js --network
```

Then you'll see something like this:

```
ws: server --> C-j2lm GET     {"key":"/usr","parents":null,"subscribe":{"keep_alive":true}}
ws: server --> C-j2lm WELCOME {"key":"/usr","versions":[{"version":null,"parents":{},"changes":[" = {\"B-0bnyC1mdA9\":\"FirefoxHTTP\"}"]}
ws: C-j2lm --> server WELCOME {"key":"/chat","versions":[],"fissures":[],"parents":null}
ws: C-j2lm --> server WELCOME {"key":"/usr","versions":[],"fissures":[],"parents":null}
ws: C-j2lm --> server SET     {"key":"/usr","patches":["[\"B-0bnyC1mdA9\"] = \"FrefoxHTTP\""],"version":"bz2gyet9cv6","parents":{"66mn2f0vco8":true}}
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

