
let fissure_lifetime = 1000 * 60 * 60 * 24 * 14

;(async () => {

    console.log('v26')

    require('child_process').execSync(`npm install ws`, {stdio: 'inherit'})
    require('child_process').execSync(`npm install @braidjs/antimatter@0.0.11`, {stdio: 'inherit'})
    let {antimatter} = require('@braidjs/antimatter')

    let port = 60509

    let conns = {}

    let antimatters = {}
    function ensure_antimatter(key) {
        if (!antimatters[key]?.read) {
            antimatters[key] = antimatter.create(x => {
                try {
                    console.log(`key=${key}, sending to [${x.conn}]: ` + JSON.stringify(x))
                    conns[x.conn].send(JSON.stringify(x))
                } catch (e) {
                    console.log(`key=${key}, failed to send: ` + e)
                }
            }, antimatters[key])
            antimatters[key].fissure_lifetime = fissure_lifetime
            if (antimatters[key].S == null) antimatters[key].set({range: '', content: ''})
        }
        return antimatters[key]
    }

    let files = []
    for (let filename of await require('fs/promises').readdir('.')) {
        let m = filename.match(/^antimatter_wiki\.([dw])(\d+)$/)
        if (m) files.push({t: m[1], i: 1*m[2]})
    }
    files.sort((a, b) => a.i - b.i)
    let file_i = files[files.length - 1]?.i ?? -1

    console.log('files: ', files)

    await Promise.all(files.splice(0, files.reduce((a, b, i) => b.t == 'd' ? i : a, 0)).map(x => require('fs/promises').rm(`antimatter_wiki.${x.t}${x.i}`)))

    for (let file of files) {

        console.log(`file: `, file)

        let s = await require('fs/promises').readFile(`antimatter_wiki.${file.t}${file.i}`)
        if (file.t == 'd') {
            antimatters = JSON.parse(s)
            for (let k of Object.keys(antimatters)) ensure_antimatter(k)
        } else {
            for (let line of ('' + s).split(/\n/)) {
                let x = JSON.parse(line || '{}')
                if (x.receive) {
                    try {
                        ensure_antimatter(x.key).receive(x.receive)
                    } catch (e) {}
                }
                if (x.disconnect) ensure_antimatter(x.key).disconnect(x.disconnect)
            }
        }
    }

    for (let a of Object.values(antimatters)) {
        for (let c of Object.keys(a.conns)) a.disconnect(c)
        for (let c of Object.keys(a.proto_conns)) a.disconnect(c)
    }

    let client_html = 'not loaded yet..'

    let dirty = true
    let wol_filename
    await compactor()
    async function compactor() {
        if (dirty) {
            dirty = false
            wol_filename = `antimatter_wiki.w${file_i + 2}`
            await require('fs/promises').writeFile(`antimatter_wiki.d${file_i + 1}`, JSON.stringify(antimatters))

            await Promise.all(files.map(x => require('fs/promises').rm(`antimatter_wiki.${x.t}${x.i}`)))
            files = [{t: 'd', i: file_i + 1}, {t: 'w', i: file_i + 2}]
            file_i += 2
        }
        setTimeout(compactor, 1000 * 60)

        client_html = '' + await require('fs/promises').readFile('./client.html')
        client_html = client_html.replace(/__WIKI_HOST__/, () => JSON.stringify(process.argv[2] ?? `ws://localhost:${port}`))
    }

    function write_to_log(obj) {
        require('fs').appendFileSync(wol_filename, JSON.stringify(obj) + '\n')
        dirty = true
    }

    var server = require('http').createServer(async function (req, res) {

    // var server = require('https').createServer({
    //     key: require('fs').readFileSync('./privkey.pem'),
    //     cert: require('fs').readFileSync('./fullchain.pem')
    // }, async function (req, res) {
        console.log('!!! --- ', {method: req.method, url: req.url})
        console.log(`client_html.length = ${client_html.length}`)

        res.statusCode = 200
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Headers', '*')
        res.setHeader('Access-Control-Allow-Methods', '*')
        res.end(client_html)
    })

    var wss = new (require('ws').Server)({server})
    wss.on('connection', function connection(ws, req) {
        console.log(`new connection! ${req.url}`)

        let key = decodeURIComponent(req.url.slice(1))
        let a = ensure_antimatter(key)

        let conn

        ws.on('message', async x => {
            if (x == 'ping') return ws.send('pong')

            console.log(`RECV: ${x}`)
            x = JSON.parse(x)

            if (x.conn) conns[conn = x.conn] = ws

            write_to_log({key, receive: x})
            a.receive(x)
        })
        ws.on('close', async () => {
            console.log(`close: ` + conn)
            write_to_log({key, disconnect: conn})
            a.disconnect(conn)
            delete conns[conn]
        })
    })

    server.listen(port)
    console.log(`listening on port ${port}`)
    
})()
