# Braidjs

This is a reference implementation in Javascript of the
[Braid protocol](https://github.com/braid-work/ietf-braid-draft), which adds
*synchronization* to HTTP.

This implementation is not yet complete, but aims to be fully-functioning and
robust enough for production sites.

*We intentionally keep this readme short.* Read more about braid at https://braid.news!


## What's in this repository?

```
braid-peer.js       # Implements the abstract Braid protocol on a `peer` object in Javascript
http-client.js      # Implements the Braid HTTP protocol to web browsers
http-server.js      # Implements the Braid HTTP protocol in nodejs servers
state-control.js    # Supports validation, access control, programmatic state on a peer
reactivity.js       # Supports a reactive programming on a peer
proxy.js            # Implements a Braid peer as ES6 Proxy
merge-algos/        # Implementations for OT and CRDT merge-types
  /sync9.js
tests.js
```

## Contributing

Be sure to run tests before committing, with:

```
npm test
```
