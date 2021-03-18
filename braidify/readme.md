# Braidify



## Using it

On the server using express:

```javascript
var braidify = require('./protocols/http/http-server')

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

On the server using regular `require('http')`:

```javascript
var braidify = require('./protocols/http/http-server')

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

In a browser client:

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
        //   // Version will contain either patches *or* body, but not both
    })
</script>
```

And if you want automatic reconnections, you can use:

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
        //   // Version will contain either patches *or* body, but not both
    }).catch(e => setTimeout(connect, 1000))
}
connect()
```

On nodejs as a client:

```javascript
// Use this line if necessary for self-signed certs
// process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0

var https = require('braidjs').braidify.http.client(require('https'))
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
