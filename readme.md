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
http-client.js      # Implements the Braid HTTP protocol in web browsers
http-server.js      # Implements the Braid HTTP protocol in nodejs servers
state-control.js    # Implements support for validation, access control, programmatic state on a peer
reactivity.js       # Implements a reactive version of the abstract Braid protocol
proxy.js            # Implements a reactive ES6 Proxy of the abstract Braid protocol
merge-algos/        # Implementations for OT and CRDT merge-types
  /sync9.js
tests.js
```

## Contributing

Be sure to run tests before committing, with:

```
npm test
```
