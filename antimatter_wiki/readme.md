# MOVED TO https://github.com/braid-org/antimatter_wiki

# Antimatter Wiki

A collaborative wiki based on the [Antimatter Algorithm](https://braid.org/antimatter).

To use:

```bash
npm install @braidjs/antimatter_wiki
```

Then put this into an app.js:

```javascript
var port = 60509, domain = 'localhost:60509', ws_scheme

require('@braidjs/antimatter_wiki').serve({
    port: 60509,
    domain: 'localhost:60509',
    ws_prefix: 'wss://'          // Or 'ws://' for insecure websocket
})
```

And run it with `node app.js`.
