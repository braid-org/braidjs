# Braidjs: Synchronization in Browser + Server APIs

This contains a reference implementation in Javascript of the
[Braid protocol](https://github.com/braid-work/ietf-braid-draft), which adds
*synchronization* to HTTP.  This code also goes one step further, and
demonstrates adding synchronization to the *browser and server API*.

This implementation is not yet complete, but aims to be fully-functioning and
robust enough for production sites.

*We intentionally keep this readme short.* Read more about braid at https://braid.news!

## What's in this repository?

```
node.js            # A node implements the Abstract Braid Protocol
resource.js        # A `subscribable HTTP resource`: a URI with subscriptions
pipe.js            # A pipe connects two nodes together.  Networking happens here!
http-client.js     # Braid-HTTP network pipe for web browsers
http-server.js     # Braid-HTTP network pipe for nodejs servers
events.js          # Binding event handlers to a node
state-control.js   # Validation, access control, programmatic state on a peer
reactivity.js      # Reactive version of the abstract Braid protocol
proxy.js           # Reactive ES6 Proxy of the abstract Braid protocol
merge-algorithms/  # A variety of OT and CRDT merge-types
  sync9.js
show-and-tell/
  tests.js         # Unit tests
  vis-sim.html     # Visual demonstration of a simulated peer-to-peer network
```

Note that many of these files are still stubs.  You can find their previous
implementations in the
[invisible-college/braidjs](https://github.com/invisible-college/braidjs)
repository.

## Running the code

Run tests on the server with:

```
npm test
```

Run tests in a web browser by double-clicking on:

```
show-and-tell/vis-sim.html
```

...from your file manager, to open it in a web browser, with a `file://` URL.

## Implementation status

The high-level strategy:

1. Refactor the [statebus](https://stateb.us) implementation (see invisible-college/braidjs)
2. Refactor the [sync9](https://braid.news/sync9) implementation
3. To meet, in a unified model of synchronization in browser APIs

The statebus code is being refactored at
https://github.com/invisible-college/braidjs, according to this
[roadmap](https://braid.news/roadmap):

- [x] Rename `fetch` & `save` -> `get` & `set`
- [x] Rename `statebus` -> `braidjs`
- [x] Change JSON encoding
- [x] Remove recursion in `set`
- [x] Incorporate the [Sync9](https://braid.news/sync9/performance) pruning peer-to-peer CRDT
- [x] Disconnectable `pipes`
- [x] Event-handler bindings
- [ ] HTTP [network protocol](https://github.com/braid-work/braid-spec)
- [ ] Validation
- [ ] Disk persistence
- [ ] Reactive functions
- [ ] Cache eviction policy
- [ ] ES6 Proxy API

