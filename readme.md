# Braidjs: Synchronization in a Browser + Server API

This contains a reference implementation in Javascript of the
[Braid protocol](https://github.com/braid-work/ietf-braid-draft), which adds
*synchronization* to HTTP.  This repo also goes one step further, and
demonstrates adding synchronization to the *browser and server API*.

This implementation is not yet complete, but aims to be fully-functioning and
robust enough for production sites.

*We intentionally keep this readme short.* Read more about braid at https://braid.news!


## What's in this repository?

```
resource.js        # A `subscribable HTTP resource`: a URI with subscriptions
http-client.js     # Braid-HTTP networking for web browsers
http-server.js     # Braid-HTTP networking for nodejs servers
state-control.js   # Validation, access control, programmatic state on a peer
reactivity.js      # Reactive version of the abstract Braid protocol
proxy.js           # Reactive ES6 Proxy of the abstract Braid protocol
merge-algorithms/  # A variety of OT and CRDT merge-types
  sync9.js
show-and-tell/
  tests.js         # Unit tests
  vis-sim.html     # Visual demonstration of a simulated peer-to-peer network
```

## Implementation status

The high-level strategy:

1. Refactor the [statebus](https://stateb.us) implementation
2. Refactor the [sync9](https://braid.news/sync9) implementation
3. To meet, in a unified model of synchronization in browser APIs

The statebus code is being refactored at
https://github.com/invisible-college/braidjs, according to this
[roadmap](https://braid.news/roadmap):

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

Mike is currently refactoring Sync9 in the `refactor-sync9` branch of this
repository.  He expects to complete this step before January.

## Contributing

Be sure to run tests before committing, with:

```
npm test
```
