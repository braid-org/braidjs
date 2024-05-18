# Library for serving collaborative text over HTTP using Braid

- Uses [Braid-HTTP](https://github.com/braid-org/braid-spec/blob/master/draft-toomim-httpbis-braid-http-04.txt)
- Developed in [braid.org](https://braid.org)

## Use the Library

Install it in your project:
```shell
npm install braid-text-server
```

Import the request handler:

```javascript
var serve_braid_text = require("braid-text-server")
```

Use it to handle requests in your HTTP server:

server.on("request", (req, res) => {
  // Your server logic...

  // Whenever ready, serve braid text for this request/response:
  serve_braid_text(req, res, { db_folder: './your-db-folder' })
})
```

The `serve_braid_text` function takes the following arguments:
- `req`: The incoming HTTP request object.
- `res`: The HTTP response object to send the response.
- `options`: An object containing additional options:
  - `content_type`: The content type of the text being collaborated on. Defaults to 'text/plain' if not specified.
  - `db_folder`: The folder where the collaborative text data will be stored. (This folder will be created if it doesn't exist.)


## Run the Demo

We made a handy demo in this repo for you to follow along with, too.

```shell
npm install
node server-demo.js
```

Now you can open these URLs in browser:
  - http://localhost:60402 (to see the demo text)
  - http://localhost:60402/editor (to edit the text)
  - http://localhost:60402/markdown-editor (to edit it as markdown)

Or try opening the URL in [Braid-Chrome](https://github.com/braid-org/braid-chrome), or another Braid client, to edit it directly!
