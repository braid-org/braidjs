# Braidjs

Braidjs is a reference implementation in Javascript of the
[Braid protocol](https://github.com/braid-work/ietf-braid-draft), which adds
*synchronization* to HTTP.

This implementation is not yet complete, but aims to be fully-functioning and
robust enough for production sites.

*We intentionally keep this readme short.* Read more about braid at https://braid.news!


## What's in this repository?

```
braid-peer.js       # A Braid Peer in Javascript
http-client.js      # Extends a web browser into a Braid HTTP client
http-server.js      # Extends a nodejs server into a Braid HTTP server
state-control.js    # Validation, access control, programmatic state on a peer
reactivity.js       # Support for reactive programming environment
proxy.js            # A Braid Peer as ES6 Proxy
merge-algos/        # OT and CRDT implementations
  /sync9.js
tests.js
```

## Contributing

Be sure to run tests before committing, with:

```
npm test
```
