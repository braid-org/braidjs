# Braidjs

This is a reference implementation in Javascript of the
[Braid protocol](https://github.com/braid-work/ietf-braid-draft), which adds
*synchronization* to HTTP.

This implementation is not yet complete, but aims to be fully-functioning and
robust enough for production sites.

*We intentionally keep this readme short.* Read more about braid at https://braid.news!


## What's in this repository?

```
resource.js        # Implements the abstract Braid protocol in a `subscribable resource`, in Javascript
                   #   - Demonstrates subscriptions, acknowledgements, and coordinated p2p pruning of history
http-client.js     # Implements the Braid HTTP protocol in web browsers
http-server.js     # Implements the Braid HTTP protocol in nodejs servers
state-control.js   # Implements support for validation, access control, programmatic state on a peer
reactivity.js      # Implements a reactive version of the abstract Braid protocol
proxy.js           # Implements a reactive ES6 Proxy of the abstract Braid protocol
merge-algorithms/  # Implementations for OT and CRDT merge-types
  sync9.js
show-and-tell/
  tests.js         # Unit tests
  vis-sim.html     # Visual demonstration of a simulated peer-to-peer network
```

## Roadmap to release

At the high level, we are:

1. Refactoring the [statebus](https://stateb.us) implementation
2. And the [sync9](https://braid.news/sync9) implementation
3. So that they meet together, within a new browser API, using concepts (e.g. merge-type) from the Braid protocol.

The statebus code is being refactored at https://github.com/invisible-college/braidjs, according to this [roadmap](https://braid.news/roadmap):
- [x] Rename `fetch` & `save` -> `get` & `set`
- [x] Rename `statebus` -> `braidjs`
- [x] Change JSON encoding
- [x] Remove recursion in `set`
- [ ] Incorporate the [Sync9](https://braid.news/sync9/performance) pruning peer-to-peer CRDT
  - [ ] Disk persistence
- [ ] New [API](https://braid.news/roadmap/new-api)
  - [ ] Add [cache eviction policy](https://en.wikipedia.org/wiki/Cache_replacement_policies#Most_recently_used_(MRU))
- [ ] New [network protocol](https://braid.news/protocol)
- [ ] New ES6 Proxy implementation
- [ ] Rename `key` -> `link`

Mike is currently working on refactoring Sync9 and improving its spec.  He
expects this part to be complete by the end of December.

## Contributing

Be sure to run tests before committing, with:

```
npm test
```
