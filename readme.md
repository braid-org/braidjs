# The Braidjs Monorepo

Makes it easy to interoperate!

  - Each project has a top-level folder.
  - If you make a breaking change (like a protocol change), then upgrade the
    relevant code in other people's projects directly.  Everything in this
    repo is versioned together!

### Interoperating Projects

Add yours today!

 - `braidify`: [A reference implementation of the Braid Protocol](https://github.com/braid-org/braidjs/tree/master/braidify)
 - `kernel`: [A prototype Braid Kernel](https://github.com/braid-org/braidjs/tree/master/kernel)
 - `sync9`: [A CRDT that supports pruning history](https://github.com/braid-org/braidjs/tree/master/sync9)
 - `util`: [A set of common utilities](https://github.com/braid-org/braidjs/tree/master/util)

Read more about braid at https://braid.org!

### Faq

Q. Can I still publish my project as a NPM package?

  - A. Yeah.  Just create a `package.json` in your project's root folder, run
    `npm publish`.
