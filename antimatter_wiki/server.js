
let fissure_lifetime = 1000 * 60 * 60 * 24 * 14

process.on('uncaughtException', console.log)
process.on('unhandledRejection', console.log)

;(async () => {
    console.log('v28')

    require('child_process').execSync(`npm install ws`, {stdio: 'inherit'})
    require('child_process').execSync(`npm install @braidjs/antimatter@0.0.12`, {stdio: 'inherit'})
    let {antimatter} = require('@braidjs/antimatter')

    let port = 60509

    if (!require('fs').existsSync('./antimatter_wiki_db')) require('fs').mkdirSync('./antimatter_wiki_db')

    let conns = {}

    let antimatters = {}
    async function ensure_antimatter(key) {
        if (!antimatters[key]) antimatters[key] = new Promise(async done => {
            let dir = `./antimatter_wiki_db/${encodeURIComponent(key)}`
            if (!require('fs').existsSync(dir)) await require('fs/promises').mkdir(dir)

            let files = []
            for (let filename of await require('fs/promises').readdir(dir)) {
                let m = filename.match(/^([dw])(\d+)$/)
                if (m) files.push({t: m[1], i: 1*m[2]})
            }
            files.sort((a, b) => a.i - b.i)
            let file_i = files[files.length - 1]?.i ?? -1
        
            console.log('files: ', files)
        
            await Promise.all(files.splice(0, files.reduce((a, b, i) => b.t == 'd' ? i : a, 0)).map(x => require('fs/promises').rm(`${dir}/${x.t}${x.i}`)))

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
        
                let s = await require('fs/promises').readFile(`${dir}/${file.t}${file.i}`)
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
                    await require('fs/promises').writeFile(`${dir}/d${file_i + 1}`, JSON.stringify(a))
        
                    await Promise.all(files.map(x => require('fs/promises').rm(`${dir}/${x.t}${x.i}`)))
                    files = [{t: 'd', i: file_i + 1}, {t: 'w', i: file_i + 2}]
                    file_i += 2
                }
                setTimeout(compactor, 1000 * 60)
            }

            a.write_to_log = (obj) => {
                require('fs').appendFileSync(wol_filename, JSON.stringify(obj) + '\n')
                dirty = true
            }

            done(a)
        })
        return await antimatters[key]
    }

    await client_html_loader()
    async function client_html_loader() {
        client_html = '' + await require('fs/promises').readFile('./client.html')
        client_html = client_html.replace(/__WIKI_HOST__/, () => JSON.stringify(process.argv[2] ?? `ws://localhost:${port}`))

        setTimeout(client_html_loader, 1000 * 60)
    }

    var server = require('http').createServer(async function (req, res) {
        console.log('!!! --- ', {method: req.method, url: req.url})
        console.log(`client_html.length = ${client_html.length}`)

        res.statusCode = 200
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Headers', '*')
        res.setHeader('Access-Control-Allow-Methods', '*')
        res.end(client_html)
    })

    var wss = new (require('ws').Server)({server})
    wss.on('connection', async (ws, req) => {
        console.log(`new connection! ${req.url}`)

        let key = decodeURIComponent(req.url.slice(1))
        let a = await ensure_antimatter(key)

        let conn
        let last_ping = Date.now()

        check_ping()
        function check_ping() {
            if (ws.readyState > 1) return
            if (Date.now() - last_ping > 1000 * 12) {
                console.log(`ping timeout! conn ${conn} key=${key} (${Date.now() - last_ping})`)
                ws.terminate()
                return
            }
            setTimeout(check_ping, 1000)
        }

        ws.on('message', async x => {
            if (x == 'ping') {
                // console.log(`got ping for conn ${conn} key=${key}`)
                last_ping = Date.now()
                ws.send('pong')
                return
            }

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
    
})()
