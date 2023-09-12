# package.json notes

This package is bundled as both a commonjs and es6-compatible NPM bundle. The
factor that enables this dual packaging is the "exports" key in the package.json
file:

## exports

- `require`: When this package is in a commonjs environment (e.g. default nodejs) 
  the ./index.js file will be the thing that is 'require'd.
- `import`: When this package is in an es6 environment (e.g. bundler, modern nodejs,
  modern browser) the ./index.mjs will be the thing 'import'ed.

## dependencies


  
- `node-fetch`: When the http-client protocol is used, node-fetch supplies 'fetch'
  for a nodejs client
- `node-web-streams`: Although node-fetch is mostly isomorphic, its internal stream
  is not the same as a web stream reader; we need it to have the same API.
- `spdy`: This gives us http2.0 connection multiplexing with a 'natural http module
  interface'. (http1.1 provides a max of 6 open conns)

## Development Notes

For code that is intended to run in all environments (e.g. browser, node) and
potentially pass through a bundler step, the following guidelines are helpful:

- Use single-value module.exports in files, and named exports in wrappers.
- If using globals, it's also important to use module.exports; for example: 
 
```
function braid_fetch(...) { ... }

if (typeof module !== 'undefined' && module.exports) {
    module.exports = braid_fetch
}
```

For a complete list of reasons for the madness, and to learn more about the method
we've used to build this package, see https://redfin.engineering/node-modules-at-war-why-commonjs-and-es-modules-cant-get-along-9617135eeca1

Because we `require` certain libraries that are meant to be used in a nodejs environment only, we also need to provide a hint to bundlers that are targeting a browser environment NOT to load those libraries. This is what the `browser` field in `package.json` is for:

```
  "browser": {
    "node-web-streams": false,
    "node-fetch": false,
    "abort-controller": false
  }
```

If we don't hint that these libraries should not be loaded in the browser, bundled code that depends on braidjs libraries will fail in the browser.

See also https://github.com/defunctzombie/package-browser-field-spec.
