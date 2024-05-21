# Serve collaborative text over Braid-HTTP

This library provides a simple http route handler, enabling fast text synchronization over a standard protocol.

- Supports [Braid-HTTP](https://github.com/braid-org/braid-spec/blob/master/draft-toomim-httpbis-braid-http-04.txt) protocol
- Supports [Simpleton](https://braid.org/meeting-76/simpleton) merge-type
  - Enables light clients
    - As little as 50 lines of code!
    - With zero history overhead on client
  - Supports backpressure to run smoothly on constrained servers
- Supports [Diamond Types](https://github.com/josephg/diamond-types) merge-type
  - Fast / Robust / Extensively fuzz-tested 
- Developed in [braid.org](https://braid.org)

## Use the Library

Install it in your project:
```shell
npm install braid-text-server
```

Import the request handler into your code, and use it to handle HTTP requests wherever you want:

```javascript
var braid_text = require("braid-text-server")

server.on("request", (req, res) => {
  // Your server logic...

  // Whenever desired, serve braid text for this request/response:
  braid_text.serve(req, res)
})
```

## Run the Demo

This will run a collaboratively-editable wiki:

```shell
npm install
node server-demo.js
```

Now open these URLs in your browser:
  - http://localhost:8888/demo (to see the demo text)
  - http://localhost:8888/demo?editor (to edit the text)
  - http://localhost:8888/demo?markdown-editor (to edit it as markdown)

Or try opening the URL in [Braid-Chrome](https://github.com/braid-org/braid-chrome), or another Braid client, to edit it directly!

Check out the `server-demo.js` file to see examples for how to add access control, and a `/pages` endpoint to show all the edited pages.

## Full Library API

`braid_text.db_folder = './braid-text-server-db' // <-- this is the default`
  - This is where the Diamond-Types history files will be stored for each resource.
  - This folder will be created if it doesn't exist.
  - The files for a resource will all be prefixed with a url-encoding of `key` within this folder.

`braid_text.server(req, res, options)`
  - `req`: The incoming HTTP request object.
  - `res`: The HTTP response object to send the response.
  - `options`: <small style="color:lightgrey">[optional]</small> An object containing additional options:
    - `key`:  <small style="color:lightgrey">[optional]</small> ID of text resource to sync with.  Defaults to `req.url`.
    - `content_type`:  <small style="color:lightgrey">[optional]</small> The content type to tell the browser.  Defaults to 'text/plain'.
  - This is the main method of this library, and does all the work to handle Braid-HTTP `GET` and `PUT` requests concerned with a specific text resource.

`await braid_text.get(key)`
  - `key`: ID of text resource.
  - Returns the text of the resource as a string.

`await braid_text.get(key, options)`
  - `key`: ID of text resource.
  - `options`: An object containing additional options, like http headers:
    - `version`:  <small style="color:lightgrey">[optional]</small> The version to get.
    - `subscribe: cb`:  <small style="color:lightgrey">[optional]</small> Transforms `get` into a subscription that calls `cb` with each update. The function `cb` is called with the argument `{version, parents, body, patches}` with each update to the text.
    - `parents`:  <small style="color:lightgrey">[optional]</small> Array of parents — the subscription will only send newer updates than these.
    - `merge_type`: <small style="color:lightgrey">[optional]</small> When subscribing, identifies the synchronization protocol. Defaults to `simpleton`, but can be set to `dt`.
    - `peer`: <small style="color:lightgrey">[optional]</small> When subscribing, identifies this peer. Mutations will not be echoed back to the same peer that puts them, if that put also sets the same `peer` header.

  - If we are NOT subscribing, returns `{version, body}`, with the `version` being returned, and the text as `body`. If we are subscribing, this returns nothing.

`await braid_text.put(key, options)`
  - `key`: ID of text resource.
  - `options`: An object containing additional options, like http headers:
    - `version`:  <small style="color:lightgrey">[optional]</small> The version being supplied. Will be randomly generated if not supplied.
    - `parents`:  <small style="color:lightgrey">[optional]</small> Array of versions this update depends on. Defaults to whatever the most recent version is.
    - `body`: <small style="color:lightgrey">[optional]</small> Use this to completely replace the existing text with this new text.
    - `patches`: <small style="color:lightgrey">[optional]</small> Array of patches, each of the form `{unit: 'text', range: '[1:3]', content: 'hi'}`, which would replace the second and third unicode code-points in the text with `hi`.
    - `peer`: <small style="color:lightgrey">[optional]</small> Identifies this peer. This mutation will not be echoed back to `get` subscriptions that use this same `peer` header.
