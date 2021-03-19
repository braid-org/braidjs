# The Braidjs Monorepo

You can add your projects to this repo.

  - Every project gets its own top-level folder.
  - We encourage code re-use across projects.
    - We recommend giving your project a unique name.
    - Then you can use grep to find all the places people re-use your code.
    - If you make a backwards-compatible change (e.g. new protocol feature),
      you can then upgrade all the code in the projects that depend on your
      change, for the authors.
  - When you're ready to make a npm package, just add a `package.json` to your
    project folder, and run `npm publish` in there.

### Projects

Add your project, and make it easy to share code!

 - `braidify`: [A reference implementation of the Braid Protocol](braidjs/tree/master/braidify)
 - `kernel`: [A prototype Braid Kernel](braidjs/tree/master/kernel)
 - `sync9`: [A CRDT that supports pruning history](braidjs/tree/master/sync9)

Read more about braid at https://braid.org!

