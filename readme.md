# The Braidjs Monorepo

By versioning our code together with yarn workspaces, it becomes easier to interoperate.

  - Shared libraries are stored in packages/*.  Add yours!
  - Applications are stored in apps/*.  Add yours!
  - Now you can make breaking changes (like a protocol change), without
    actually *breaking* anything—upgrade all the relevant code, across
    multiple projects, at once!

This is not my code.  This is *our* code.

### Usage:

 - Clone the Repo: `git clone git@github.com:braid-org/braidjs.git`
 - Install the dependencies: `cd braidjs; yarn`
 - Run an app: `yarn workspace @braidjs/sync9-chat start`

### Apps

A set of Braidjs demo applications using the core packages:

 - `blog3`
 - `chat`
 - `simple`: 
 - `sync9-chat`
 - `wiki`

Add yours today!

### Packages

Braidjs core packages:

 - `antimatter`: [An implementation of the Antimatter Algorithm](https://github.com/braid-org/braidjs/tree/master/antimatter)
 - `braidify`: [A reference implementation of the Braid Protocol](https://github.com/braid-org/braidjs/tree/master/braidify)
 - `kernel`: [A prototype Braid Kernel](https://github.com/braid-org/braidjs/tree/master/kernel)
 - `sync9`: [A CRDT that supports pruning history](https://github.com/braid-org/braidjs/tree/master/sync9)
 - `util`: [A set of common utilities](https://github.com/braid-org/braidjs/tree/master/util)

Add yours today!

Read more about braid at https://braid.org!

### Faq

Q. Wait... can a single repo support multiple NPM packages?

  - A. Yep!  Just create a `package.json` in your project's root folder, and
    then run `npm publish` from it.
