
var admin_pass = "xyz"
var db_folder = './braid-text-server'
var port = 60402

console.log("v6")

process.on("uncaughtException", (e) => console.log(e.stack))
process.on("unhandledRejection", (e) => console.log(e.stack))

var { handle_request } = require("./index.js")

if (!require("fs").existsSync(db_folder)) require("fs").mkdirSync(db_folder, { recursive: true })

var server = require("http").createServer(async (req, res) => {
    console.log(`${req.method} ${req.url}`)

    if (req.url.startsWith("/client-demo.html")) {
        res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-cache" })
        require("fs").createReadStream("./client-demo.html").pipe(res)
        return
    }

    if (req.url.startsWith("/client-demo-markdown.html")) {
        res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-cache" })
        require("fs").createReadStream("./client-demo-markdown.html").pipe(res)
        return
    }

    if (req.url === '/pages') {
        var pages = []
        for (let x of await require('fs').promises.readdir(db_folder)) {
            let m = x.match(/^(.*)\.\d+$/)
            if (m) pages.push(decodeURIComponent(m[1]))
        }

        res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Expose-Headers": "*"
        })
        res.end(JSON.stringify(pages))
        return
    }

    if (req.url === '/login_' + admin_pass) {
        res.writeHead(200, {
            "Content-Type": "text/plain",
            "Set-Cookie": `admin_pass=${admin_pass}; Path=/`,
        });
        res.end("Logged in successfully");
        return;
    }

    if (req.method == "PUT" || req.method == "POST" || req.method == "PATCH") {
        if (!req.headers.cookie?.includes(`admin_pass=${admin_pass}`)) {
            console.log("Blocked PUT:", { cookie: req.headers.cookie })
            res.statusCode = 401
            return res.end()
        }
    }

    handle_request(req, res, { db_folder })
})

server.listen(port, () => {
    console.log(`server started on port ${port}`)
})