# The Braidjs Monorepo

Makes it easy to interoperate!

  - Each project has a top-level folder.
  - If you make a breaking change (like a protocol change), then upgrade the
    relevant code in other people's projects directly.

Npm still works fine.  Just put a `package.json` to your project folder, `cd`
to it, and run `npm publish`.


### Projects

Add yours to the list!

 - `braidify`: [A reference implementation of the Braid Protocol](braidjs/tree/master/braidify)
 - `kernel`: [A prototype Braid Kernel](braidjs/tree/master/kernel)
 - `sync9`: [A CRDT that supports pruning history](braidjs/tree/master/sync9)
 - `util`: [A set of common utilities](braidjs/tree/master/util)

Read more about braid at https://braid.org!

