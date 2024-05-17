# Library for serving collaborative text over HTTP using Braid

- Uses [Braid-HTTP](https://github.com/braid-org/braid-spec/blob/master/draft-toomim-httpbis-braid-http-04.txt)
- Developed in [braid.org](https://braid.org)

## Installing and Running Stand-alone Demo Server

1. Clone the repository:

```shell
git clone https://github.com/braid-org/braidjs.git
cd braidjs
cd braid-text-server
```

2. Install the dependencies using npm:

```shell
npm install
```

3. Start the server:

```shell
node server-demo.js
```

The collaborative text server should now be running and accessible at `http://localhost:60402` (or the specified port).

## Usage

Once the server is running, you can use a Braid-HTTP compatible client to connect and collaborate on text documents in real-time.

## Using the Library in Your Own Server

To use the `braid-text-server` library in your own server, follow these steps:

1. Install the library as a dependency in your project:

```shell
npm install braid-text-server
```

2. Import the `handle_request` function from the library in your server code:

```javascript
const { handle_request } = require("braid-text-server");
```

3. In your server's request handling logic, call the `handle_request` function with the appropriate arguments:

```javascript
server.on("request", (req, res) => {
  // Your server logic...

  // Call the handle_request function from braid-text-server
  handle_request(req, res, { db_folder: './your-db-folder' });
});
```

The `handle_request` function takes the following arguments:
- `req`: The incoming HTTP request object.
- `res`: The HTTP response object to send the response.
- `options`: An object containing additional options:
  - `content_type`: The content type of the text being collaborated on. Defaults to 'text/plain' if not specified.
  - `db_folder`: The folder where the collaborative text data will be stored. (This folder will be created if it doesn't exist.)

4. Make sure to set the appropriate authentication and authorization logic in your server to control access to the collaborative text functionality.

That's it! You can now use the `braid-text-server` library to add collaborative text functionality to your own server.
