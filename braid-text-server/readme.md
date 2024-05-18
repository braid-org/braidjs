# Serve collaborative text over Braid-HTTP

This library provides a simple http route handler, enabling fast text synchronization over a standard protocol.

- Supports [Braid-HTTP](https://github.com/braid-org/braid-spec/blob/master/draft-toomim-httpbis-braid-http-04.txt) protocol
- Uses [Simpleton merge algorithm](https://braid.org/meeting-76/simpleton)
  - Enables light clients (as little as 50 lines of code!)
  - No history requirement for clients
  - Supports backpressure to run smoothly on constrained servers
- Which itself uses [Diamond Types CRDT](https://github.com/josephg/diamond-types)
  - Fast / Robust / Extensively fuzz-tested 
- Developed in [braid.org](https://braid.org)

## Use the Library

Install it in your project:
```shell
npm install braid-text-server
```

Import the request handler into your code, and use it to handle HTTP requests wherever you want:

```javascript
var serve_braid_text = require("braid-text-server")

server.on("request", (req, res) => {
  // Your server logic...

  // Whenever desired, serve braid text for this request/response:
  serve_braid_text(req, res, { db_folder: './your-db-folder' })
})
```

The `serve_braid_text` function takes the following arguments:
- `req`: The incoming HTTP request object.
- `res`: The HTTP response object to send the response.
- `options`: An object containing additional options:
  - `key`: Resource key; defaults to `req.url`
  - `content_type`: The content type of the text being collaborated on. Defaults to 'text/plain' if not specified.
  - `db_folder`: The folder where the Diamond-Types history files will be stored for each resource.
    - This folder will be created if it doesn't exist.
    - The files for a resource will all be prefixed with a url-encoding of `key` within this folder.

## Run the Demo

We made a handy demo in this repo for you to follow along with, too.

```shell
npm install
node server-demo.js
```

Now you can open these URLs in browser:
  - http://localhost:8888/demo (to see the demo text)
  - http://localhost:8888/demo?editor (to edit the text)
  - http://localhost:8888/demo?markdown-editor (to edit it as markdown)

Or try opening the URL in [Braid-Chrome](https://github.com/braid-org/braid-chrome), or another Braid client, to edit it directly!

Check out the `server-demo.js` file to see examples for how to add access control, and a `/pages` endpoint to show all the currently used `key`s.
