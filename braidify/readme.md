# Braidify

Easily add the [Braid Protocol](https://braid.org) to existing Javascript.

- [npm package](https://www.npmjs.com/package/braidify) now available for testing
- Edit the source via the [braidjs](https://github.com/braid-org/braidjs) monorepo
- Reference implementation for [Braid-HTTP 03](https://github.com/braid-org/braid-spec/blob/master/draft-toomim-httpbis-braid-http-03.txt) specification

### Purpose

Whereas [Braid](https://braid.org) is *"a few simple extensions to HTTP that
add synchronization"*; the `braidify` library is *"a few simple extensions to
HTTP libraries that add Braid synchronization"*.

Braidify currently supports Braid in the following libraries:

```javascript
require('braidify').fetch     // Browser fetch() API and require('node-fetch')
require('braidify').http      // Nodejs require('http') and require('https')
```

We would love to support your favorite library, too.

Let's see how to use it:

### Browser `fetch()`

```html
<script src="http-client.js"></script>
<script>
    fetch(
        'https://braid.org/chat',
        {subscribe: {keep_alive: true}},
    ).andThen(version => {
        console.log('We got a new version!', version)
        // {
        //   version: "me",
        //   parents: ["mom", "dad"],
        //   patches: [{unit: "json", range: ".foo", content: "3"}]
        //   body:    "3"
        // }
        //   // Version will contain either patches *or* body
    })
</script>
```

And if you want automatic reconnections:

```javascript
function connect() {
    fetch(
        'https://braid.org/chat',
        {subscribe: {keep_alive: true}},
    ).andThen(version => {
        console.log('We got a new version!', version)
        // {
        //   version: "me",
        //   parents: ["mom", "dad"],
        //   patches: [{unit: "json", range: ".foo", content: "3"}]
        //   body:    "3"
        // }
        //   // Version will contain either patches *or* body
    }).catch(e => setTimeout(connect, 1000))
}
connect()
```

You can also use `for await`:

```javascript
async function connect () {
    try {
        for await (var v of fetch('/chat', {subscribe: {keep_alive: true}})) {
            // Updates might come in the form of patches:
            if (v.patches)
                chat = apply_patches(v.patches, chat)

            // Or complete versions:
            else
                // Beware the server doesn't send these yet.
                chat = JSON.parse(v.body)

            render_stuff()
        }
    } catch (e) {
        console.log('Reconnecting...')
        setTimeout(connect, 4000)
    }
}
```


## Nodejs client with `fetch()`

```javascript
var fetch = require('braidify').fetch
// or:
import {fetch} from 'braidify'

// process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0

fetch('https://localhost:3009/chat',
      {subscribe: {keep_alive: true}}).andThen(
          x => console.log('Got ', x)
      )
```

Note: the current version of `node-fetch` doesn't properly throw errors when a
response connection dies, and thus you cannot attach a `.catch()` handler to
automatically reconnect.  (See
[issue #980](https://github.com/node-fetch/node-fetch/issues/980) and
[#753](https://github.com/node-fetch/node-fetch/issues/753).)  We recommend
using the `http` library (below) for requests on nodejs instead.

## Nodejs client with `require('http')`

```javascript
// Use this line if necessary for self-signed certs
// process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0

var https = require('braidify').http(require('https'))
// or:
// import braidify from 'braidify'
// https = braidify.http(require('https'))

https.get(
   'https://braid.org/chat',
   {subscribe: true},
   (res) => {
      res.on('version', (version) => {
          console.log('well we got one', version)
      })
   }
)
```

To get auto-reconnections use:

```javascript
function connect () {
    https.get(
        'https://braid.org/chat',
        {subscribe: true},
        (res) => {
            res.on('version', (version) => {
                // {
                //   version: "me",
                //   parents: ["mom", "dad"],
                //   patches: [{unit: "json", range: ".foo", content: "3"}]
                //   body:    "3"
                // }
                //   // Version will contain either patches *or* body, but not both
                console.log('We got a new version!', version)
            })

            res.on('end',   e => setTimeout(connect, 1000))
            res.on('error', e => setTimeout(connect, 1000))
        })
}
connect()
```


## Nodejs server using `require('express')`

On the server using express:

```javascript
var braidify = require('braidify').http_server
// or:
import {http_server as braidify} from 'braidify'

// Braidify will give you these fields and methods:
// - req.subscribe
// - req.startSubscription({onClose: cb})
// - res.sendVersion()
// - await req.patches()

var app = require('express')()

app.use(braidify)    // Add braid stuff to req and res

app.get('/', (req, res) => {
    // Now use it
    if (req.subscribe)
        res.startSubscription({ onClose: _=> null })
        // startSubscription automatically sets statusCode = 209
    else
        res.statusCode = 200

    // Send the current version
    res.sendVersion({
        version: 'greg',
        parents: ['gr','eg'],
        body: JSON.stringify({greg: 'greg'})
    })

    // Or you can send patches like this:
    // res.sendVersion({
    //     version: 'greg',
    //     parents: ['gr','eg'],
    //     patches: [{range: '.greg', unit: 'json', content: '"greg"'}]
    // })
})

require('http').createServer(app).listen(8583)
```

## Nodejs server with `require('http')`

On the server using regular `require('http')`:

```javascript
var braidify = require('braidify').http_server
// or:
import {http_server as braidify} from 'braidify'

require('http').createServer(
    (req, res) => {
        // Add braid stuff to req and res
        braidify(req, res)

        // Now use it
        if (req.subscribe)
            res.startSubscription({ onClose: _=> null })
            // startSubscription automatically sets statusCode = 209
        else
            res.statusCode = 200

        // Send the current version
        res.sendVersion({
            version: 'greg',
            body: JSON.stringify({greg: 'greg'})
        })
    }
).listen(9935)
```
