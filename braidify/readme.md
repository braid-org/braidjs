# Braidify Library

Easily adds Braid to existing Javascript libraries.

- [npm package](https://www.npmjs.com/package/braidify) now available for testing
- Source is in [braidjs](https://github.com/braid-org/braidjs) repo
- Reference implementation. Meets Braid-HTTP 03.

Today it has wrappers for the following HTTP libraries:

```
require('braidify').fetch       # Browser fetch() API and require('node-fetch')
require('braidify').http        # Nodejs require('http') and require('https')
``

And we'd love to add Braid support to any other http API you like.

Let's look at some examples:

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
        for await (var v of fetch(new URL(path, window.location.href), {subscribe: {keep_alive: true}})) {

            console.log('Connected!', v)

            curr_version[path] = v.version

            // When we receive updates, they might come in the form of patches:
            if (v.patches)
                chat = apply_patches(v.patches, chat)

            // Or a complete version:
            else
                // Beware the server doesn't send these yet.
                chat = JSON.parse(v.body)

            render()
        }
    } catch (e) {
        console.log('Reconnecting...')
        setTimeout(connect, 4000)
    }
}
q```

Feedback
 - `andThen` -> `subscribe` or `onVersion`
 - Could be good to do `fetch().then().andThen()` to know when the initial response is ready
 - Could add a middle-lever helper to handler the fetch().then() stream, rather than the high-level .andThen thing
    - This is like a getVersions() or getUpdates() function
 - Want a script tag that doesn't modify fetch()
 - Promises allow multiple listeners to attach `.then()`s. Does andThen allow this?

## Nodejs client with `fetch()`

```
var fetch = require('braidify').fetch
// process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0

function connect () {
    fetch('https://localhost:3009/chat',
          {subscribe: {keep_alive: true}}).andThen(
              x => console.log('Got ', x)
              //x => {throw new Error('hi')}
          ).catch(e => {
              console.error('Reconnecting!', e);
              setTimeout(connect, 1000)
          })
}
connect()
```

## Nodejs client with `require('http')`

```javascript
// Use this line if necessary for self-signed certs
// process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0

var https = require('braidjs').http(require('https'))
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
Feedback
 - `.http` isn't consistent with `'https'`. Maybe try a different name.
 - Unease about extending existing APIs but rather separate APIs that can be helpers

## Nodejs server using `require('express')`

On the server using express:

```javascript
var braidify = require('braidjs').http

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
var braidify = require('braidjs').http

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
