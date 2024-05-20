//var admin_pass = "fake_password"
var db_folder = './db_folder'
var port = 8888

var braid_text = require("./index.js")
braid_text.db_folder = db_folder

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

    // Create some initial text for new documents
    if (await braid_text.get(req.url) === undefined) {
        await braid_text.put(req.url, {body: 'This is a fresh blank document, ready for you to edit.' })
    }

    // Now serve the collaborative text!
    braid_text.serve(req, res)
})

server.listen(port, () => {
    console.log(`server started on port ${port}`)
})
