var default_fissure_lifetime = 1000 * 60 * 60 * 24 * 14  // 14 days
var fs = require('fs')
var fs_p = require('fs/promises')

function serve({port, domain, fissure_lifetime = default_fissure_lifetime}) {
    console.log('v28')

    let {antimatter} = require('@braidjs/antimatter')


    if (!fs.existsSync('./db')) fs.mkdirSync('./db')

    let conns = {}

    let antimatters = {}
    async function ensure_antimatter(key) {
        console.log('finding db at ', JSON.stringify(key))
        if (!antimatters[key]) antimatters[key] = new Promise(async done => {
            let dir = `./db/${encodeURIComponent(key)}`
            if (!fs.existsSync(dir))
                fs.mkdirSync(dir)

            let files = []
            for (let filename of await fs_p.readdir(dir)) {
                let m = filename.match(/^([dw])(\d+)$/)
                if (m) files.push({t: m[1], i: 1*m[2]})
            }
            files.sort((a, b) => a.i - b.i)
            let file_i = files[files.length - 1]?.i ?? -1
        
            console.log('files: ', files)
        
            await Promise.all(files.splice(0, files.reduce((a, b, i) => b.t == 'd' ? i : a, 0)).map(x => fs_p.rm(`${dir}/${x.t}${x.i}`)))

            let a

            function create_antimatter(prev) {
                let a = antimatter.create(x => {
                    try {
                        console.log(`key=${key}, sending to [${x.conn}]: ` + JSON.stringify(x).slice(0, 100))
                        conns[x.conn].send(JSON.stringify(x))
                    } catch (e) {
                        console.log(`key=${key}, failed to send: ` + e)
                    }
                }, prev)
                a.fissure_lifetime = fissure_lifetime
                if (a.S == null) a.set({range: '', content: ''})
                return a
            }

            for (let file of files) {
                console.log(`file: `, file)
        
                let s = await fs_p.readFile(`${dir}/${file.t}${file.i}`)
                if (file.t == 'd') {
                    a = create_antimatter(JSON.parse(s))
                } else {
                    for (let line of ('' + s).split(/\n/)) {
                        let x = JSON.parse(line || '{}')
                        if (x.receive) {
                            try {
                                a.receive(x.receive)
                            } catch (e) {}
                        }
                        if (x.disconnect) a.disconnect(x.disconnect)
                    }
                }
            }

            if (!a) a = create_antimatter()
        
            for (let c of Object.keys(a.conns)) a.disconnect(c)
            for (let c of Object.keys(a.proto_conns)) a.disconnect(c)
        
            let dirty = true
            let wol_filename
            await compactor()
            async function compactor() {
                if (dirty) {
                    dirty = false
                    wol_filename = `${dir}/w${file_i + 2}`
                    await fs_p.writeFile(`${dir}/d${file_i + 1}`, JSON.stringify(a))
        
                    await Promise.all(files.map(x => fs_p.rm(`${dir}/${x.t}${x.i}`)))
                    files = [{t: 'd', i: file_i + 1}, {t: 'w', i: file_i + 2}]
                    file_i += 2
                }
                setTimeout(compactor, 1000 * 60)
            }

            a.write_to_log = (obj) => {
                fs.appendFileSync(wol_filename, JSON.stringify(obj) + '\n')
                dirty = true
            }

            done(a)
        })
        return await antimatters[key]
    }

    function respond_with_client (req, res) {
        var client_html = fs.readFileSync('node_modules/@braidjs/antimatter_wiki/client.html')
        client_html = '' + client_html
        client_html = client_html.replace(/__WIKI_HOST__/, `ws://${domain}`)
        var etag = require('crypto').createHash('md5').update(client_html).digest('hex')
        if (req.headers['if-none-match'] === etag) {
            res.writeHead(304)
            res.end()
        } else {
            res.writeHead(200, {
                'Content-Type': 'text/html',
                'Cache-Control': 'public, max-age=31536000',
                'ETag': etag,
            })
            res.end(client_html)
        }
    }

    var server = require('http').createServer(async function (req, res) {
        console.log('GET: ', {method: req.method, url: req.url})
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Headers', '*')
        res.setHeader('Access-Control-Allow-Methods', '*')
        respond_with_client(req, res)
    })

    var wss = new (require('ws').Server)({server})
    wss.on('connection', async (ws, req) => {
        console.log(`new connection! ${req.url}`)

        let key = decodeURIComponent(req.url.slice(1))
        if (key === '' || key[0] === '_')
            key = '_' + key
        let a = await ensure_antimatter(key)

        let conn
        let pong = true

        ping()
        function ping() {
            if (ws.readyState > 1) return
            if (!pong) {
                console.log(`ping timeout! conn ${conn} key=${key}`)
                ws.terminate()
                return
            }
            pong = false
            ws.send('ping')
            setTimeout(ping, 12000)
        }

        ws.on('message', async x => {
            pong = true
            if (x == 'pong') return
            if (x == 'ping') return ws.send('pong')

            console.log(`RECV: ${x.slice(0, 100)}`)
            x = JSON.parse(x)

            if (x.conn) conns[conn = x.conn] = ws

            a.write_to_log({receive: x})
            a.receive(x)
        })
        ws.on('close', async () => {
            if (!conn) return

            console.log(`close: ` + conn)
            a.write_to_log({disconnect: conn})
            a.disconnect(conn)
            delete conns[conn]
        })
    })

    server.listen(port)
    console.log(`listening on port ${port}`)
    
}

module.exports = {serve}