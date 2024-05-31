# Braid-HTTP

This polyfill library implements the [Braid-HTTP v04 protocol](https://github.com/braid-org/braid-spec/blob/master/draft-toomim-httpbis-braid-http-04.txt) in Javascript.  It gives browsers a `braid_fetch()` drop-in replacement for the `fetch()` API, and gives nodejs an `http` plugin, allowing them to speak Braid in a simple way.

Developed in [braid.org](https://braid.org).


## Installing

Browsers:

```html
<script src="https://unpkg.com/braid-http/braid-http-client.js"></script>
<script>
  // To live on the cutting edge, you can now replace the browser's fetch() if desired:
  // window.fetch = braid_fetch
</script>
```

Node.js:

```shell
npm install braid-http
```

```javascript
// Import with require()
require('braid-http').fetch       // A polyfill for require('node-fetch')
require('braid-http').http_client // A polyfill for require('http') clients
require('braid-http').http_server // A polyfill for require('http') servers

// Or as es6 module
import {fetch, http_client, http_server} from 'braid-http'
```

## Using it in Browsers

This library adds a `{subscribe: true}` option to `fetch()`, and lets you
access the result of a subscription with two new fields on the fetch response:

- `response.subscribe( update => ... )`
- `response.subscription`: an iterator that can be used with `for await`

### Example Subscription with Promises

Here is an example of subscribing to a Braid resource using promises:

```javascript
fetch('https://braid.org/chat', {subscribe: true}).then(
    res => res.subscribe(
        (update) => {
            console.log('We got a new update!', update)
            // {
            //   version: ["me"],
            //   parents: ["mom", "dad"],
            //   patches: [{unit: "json", range: ".foo", content: "3"}]
            //   body:    "3"
            // }
            //
            // Note that `update` will contain either patches *or* body
        }
    )
)
```

If you want automatic reconnections, add two error handlers like this:

```javascript
function connect() {
    fetch('https://braid.org/chat', {subscribe: true}).then(
        res => res.subscribe(
            (update) => {
                console.log('We got a new update!', update)
                // Do something with the update
            },
            e => setTimeout(connect, 1000)
        )
    ).catch(e => setTimeout(connect, 1000))
}
connect()
```

### Example Subscription with Async/Await

```javascript
async function connect () {
    try {
        (await fetch('/chat', {subscribe: true})).subscribe(
            (update) => {
                // We got a new update!
            },
            () => setTimeout(connect, 1000)
        )
    } catch (e) {
        setTimeout(connect, 1000)
    }
}
```

### Example Subscription with `for await`

```javascript
async function connect () {
    try {
        var subscription_iterator = fetch('/chat', {subscribe: true}).subscription
        for await (var update of subscription_iterator) {
            // Updates might come in the form of patches:
            if (update.patches)
                chat = apply_patches(update.patches, chat)

            // Or complete snapshots:
            else
                // Beware the server doesn't send these yet.
                chat = JSON.parse(update.body)

            render_stuff()
        }
    } catch (e) {
        console.log('Reconnecting...')
        setTimeout(connect, 4000)
    }
}
```

## Using it in Nodejs

### Example Nodejs server with `require('http')`

Braidify adds these fields and methods to requests and responses:
- `req.subscribe`
- `req.startSubscription({onClose: cb})`
- `await req.parseUpdate()`
- `res.sendUpdate()`

Use it like this:

```javascript
var braidify = require('braid-http').http_server
// or:
import {http_server as braidify} from 'braid-http'

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
        res.sendUpdate({
            version: ['greg'],
            body: JSON.stringify({greg: 'greg'})
        })
    }
).listen(9935)
```

### Example Nodejs server with `require('express')`

With `express`, you can simply call `app.use(braidify)` to get braid features
added to every request and response.

```javascript
var braidify = require('braid-http').http_server
// or:
import {http_server as braidify} from 'braid-http'

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
    res.sendUpdate({
        version: ['greg'],
        parents: ['gr','eg'],
        body: JSON.stringify({greg: 'greg'})
    })

    // Or you can send patches like this:
    // res.sendUpdate({
    //     version: ['greg'],
    //     parents: ['gr','eg'],
    //     patches: [{range: '.greg', unit: 'json', content: '"greg"'}]
    // })
})

require('http').createServer(app).listen(8583)
```



### Example Nodejs client with `require('http')`

```javascript
// Use this line if necessary for self-signed certs
// process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0

var https = require('braid-http').http_client(require('https'))
// or:
// import braid_http from 'braid-http'
// https = braid_http.http_client(require('https'))

https.get(
   'https://braid.org/chat',
   {subscribe: true},
   (res) => {
      res.on('update', (update) => {
          console.log('well we got one', update)
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
            res.on('update', (update) => {
                // {
                //   version: ["me"],
                //   parents: ["mom", "dad"],
                //   patches: [{unit: "json", range: ".foo", content: "3"}]
                //   body:    "3"
                // }
                //   // Update will contain either patches *or* body, but not both
                console.log('We got a new update!', update)
            })

            res.on('end',   e => setTimeout(connect, 1000))
            res.on('error', e => setTimeout(connect, 1000))
        })
}
connect()
```


### Example Nodejs client with `fetch()`

```javascript
var fetch = require('braid-http').fetch
// or:
import {fetch} from 'braid-http'

// process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0

fetch('https://localhost:3009/chat',
      {subscribe: true}).andThen(
          x => console.log('Got ', x)
      )
```

Note: the current version of `node-fetch` doesn't properly throw errors when a
response connection dies, and thus you cannot attach a `.catch()` handler to
automatically reconnect.  (See
[issue #980](https://github.com/node-fetch/node-fetch/issues/980) and
[#753](https://github.com/node-fetch/node-fetch/issues/753).)  We recommend
using the `http` library (below) for requests on nodejs instead.
