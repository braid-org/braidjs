# The Braidjs Monorepo

Makes it easy to interoperate!

  - Each project has a top-level folder.
  - If you make a breaking change (like a protocol change), then upgrade the
    relevant code in other people's projects directly.  Everything in this
    repo is versioned together!

Npm still works fine.  Just put a `package.json` to your project folder, `cd`
to it, and run `npm publish`.


### Projects

Add yours to the list!

 - `braidify`: [A reference implementation of the Braid Protocol](/braid-org/braidjs/tree/master/braidify)
 - `kernel`: [A prototype Braid Kernel](/braid-org/braidjs/tree/master/kernel)
 - `sync9`: [A CRDT that supports pruning history](/braid-org/braidjs/tree/master/sync9)
 - `util`: [A set of common utilities](braid-org/braidjs/tree/master/util)

Read more about braid at https://braid.org!

