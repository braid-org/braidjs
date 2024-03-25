console.log("v9")

process.on("uncaughtException", (e) => console.log(e.stack))
process.on("unhandledRejection", (e) => console.log(e.stack))

let simpleton_handle = require("./simpleton_lib.js").handle

var port = 61870

let cpu_usage = 0
if (true) {
    require("child_process").execSync(`npm install os-utils`, {
        stdio: "inherit",
    })

    var os = require("os-utils")
    os.cpuUsage((x) => (cpu_usage = x))
    setInterval(() => {
        os.cpuUsage((x) => (cpu_usage = x))
    }, 1000)
}

const server = require("http2").createSecureServer(
    {
        key: require("fs").readFileSync("./privkey.pem"),
        cert: require("fs").readFileSync("./fullchain.pem"),
        allowHTTP1: true,
    },
    async (req, res) => {
        let silent = req.url == "//time"

        if (!silent)
            console.log(
                `${req.method} ${req.url} v:${
                    req.headers["Version"] || req.headers["version"] || ""
                }`
            )

        res.setHeader("Access-Control-Allow-Origin", "*")
        res.setHeader("Access-Control-Allow-Methods", "*")
        res.setHeader("Access-Control-Allow-Headers", "*")
        res.statusCode = 200

        if (!silent) console.log("req.headers: " + JSON.stringify(req.headers))

        if (req.method == "OPTIONS") {
            return res.end("ok")
        }

        if (req.method == "GET" && req.url == `//time`) {
            res.setHeader("Content-Type", "application/json")
            return res.end(JSON.stringify({ time: Date.now(), cpu_usage }))
        }

        return simpleton_handle(req.url, req, res)
    }
)

server.listen(port, () => {
    console.log(`server started on port ${port}`)
})
