//var admin_pass = "fake_password"
var db_folder = './braid-text-server'
var port = 8888

var serve_braid_text = require("./index.js")

var server = require("http").createServer(async (req, res) => {
    console.log(`${req.method} ${req.url}`)

    if (req.url.endsWith("?editor")) {
        res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-cache" })
        require("fs").createReadStream("./editor.html").pipe(res)
        return
    }

    if (req.url.endsWith("?markdown-editor")) {
        res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-cache" })
        require("fs").createReadStream("./editor-markdown.html").pipe(res)
        return
    }

    // TODO: uncomment out the code below to add /pages endpoint,
    // which displays all the currently used keys
    // 
    // if (req.url === '/pages') {
    //     var pages = new Set()
    //     for (let x of await require('fs').promises.readdir(db_folder)) {
    //         let m = x.match(/^(.*)\.\d+$/)
    //         if (m) pages.add(decodeURIComponent(m[1]))
    //     }
    //     res.writeHead(200, {
    //         "Content-Type": "application/json",
    //         "Access-Control-Allow-Origin": "*",
    //         "Access-Control-Allow-Methods": "*",
    //         "Access-Control-Allow-Headers": "*",
    //         "Access-Control-Expose-Headers": "*"
    //     })
    //     res.end(JSON.stringify([...pages.keys()]))
    //     return
    // }

    // TODO: uncomment and change admin_pass above,
    // and uncomment out the code below to add basic access control
    // 
    // if (req.url === '/login_' + admin_pass) {
    //     res.writeHead(200, {
    //         "Content-Type": "text/plain",
    //         "Set-Cookie": `admin_pass=${admin_pass}; Path=/`,
    //     });
    //     res.end("Logged in successfully");
    //     return;
    // }
    //
    // if (req.method == "PUT" || req.method == "POST" || req.method == "PATCH") {
    //     if (!req.headers.cookie?.includes(`admin_pass=${admin_pass}`)) {
    //         console.log("Blocked PUT:", { cookie: req.headers.cookie })
    //         res.statusCode = 401
    //         return res.end()
    //     }
    // }

    // Now serve the collaborative text!
    serve_braid_text(req, res, {db_folder})
})

server.listen(port, () => {
    console.log(`server started on port ${port}`)
})
