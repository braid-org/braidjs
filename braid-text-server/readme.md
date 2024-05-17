# Ready-to-run collaborative text server thas speaks braid

- Uses [Braid-HTTP](https://github.com/braid-org/braid-spec/blob/master/draft-toomim-httpbis-braid-http-04.txt)
- Developed in [braid.org](https://braid.org).

## Installing and Running

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
