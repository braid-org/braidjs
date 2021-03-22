# The Braidjs Monorepo

By versioning our code together, it is easier to interoperate.

  - Each top-level folder is a project.  Add yours!
  - Now you can make breaking changes (like a protocol change), without
    breaking anyone -- you can upgrade other people's code directly.

This is not my code.  This is *our* code.

### Projects

Add yours today!

 - `braidify`: [A reference implementation of the Braid Protocol](https://github.com/braid-org/braidjs/tree/master/braidify)
 - `kernel`: [A prototype Braid Kernel](https://github.com/braid-org/braidjs/tree/master/kernel)
 - `sync9`: [A CRDT that supports pruning history](https://github.com/braid-org/braidjs/tree/master/sync9)
 - `util`: [A set of common utilities](https://github.com/braid-org/braidjs/tree/master/util)

Read more about braid at https://braid.org!

### Faq

Q. Wait... can a single repo support multiple NPM packages?

  - A. Yep!  Just create a `package.json` in your project's root folder, and
    then run `npm publish` from it.
