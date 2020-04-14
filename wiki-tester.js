
g_debug_WS_messages = []
g_debug_WS_messages_delayed = []
debug_WS_process_messages = function () {

    // console.log('server open?: ' + !!debug_WSS.the_one)

    while (g_debug_WS_messages.length) {
        var f = g_debug_WS_messages.shift()

        // console.log('f ===> ', f)

        f()
    }
    g_debug_WS_messages = g_debug_WS_messages_delayed
    g_debug_WS_messages_delayed = []
}

debug_WSS = function () {
    return debug_WSS.the_one = {
        on_conns: [],
        on(event_type, func) {
            if (event_type == 'connection') this.on_conns.push(func)
            else throw 'bad'
        },
        ws_array: [],
        close() {
            this.ws_array.forEach(ws =>
                g_debug_WS_messages.push(() => {

                    // console.log(`SERVER CLOSING C-${ws.id}`)

                    ws.onclose && ws.onclose()
                }))
            debug_WSS.the_one = null
        }
    }
}

debug_WS = function (id) {

    // console.log(`C-${id} ATTEMPTING CONNECTING TO SERVER`)

    var self = {
        id,
        on_messages: [],
        on_closes: [],
        is_open: true,
        send(msg) {

            // console.log(`C-${self.id} SEND: ` + JSON.parse(msg).method)
            // if (!self.is_open) console.log('NOT OPEN!')
            // console.log(`C-${self.id} SEND: ` + JSON.stringify(JSON.parse(msg), null, '    '))

            this.on_messages.forEach(f =>
                g_debug_WS_messages.push(() => {

                    // console.log(`S RECV from:C-${self.id} : ` + JSON.parse(msg).method)
                    // if (!self.is_open) console.log('NOT OPEN!')
                    // console.log(`S RECV from:C-${self.id} : ` + JSON.stringify(JSON.parse(msg), null, '    '))

                    f(msg)
                }))
        },
        terminate() {
            if (!self.is_open) throw 'closing closed socket'
            self.is_open = false

            // console.log(`CLOSING C-${self.id}`)

            g_debug_WS_messages.push(() =>
                this.onclose && this.onclose())
            this.on_closes.forEach(f =>
                g_debug_WS_messages.push(() => f()))
            this.on_closes = []
            this.on_messages = []
            if (debug_WSS.the_one)
                debug_WSS.the_one.ws_array.splice(debug_WSS.the_one.ws_array.indexOf(self), 1)
        }
    }
    g_debug_WS_messages.push(() => {
        if (debug_WSS.the_one) {
            debug_WSS.the_one.ws_array.push(self)
            debug_WSS.the_one.on_conns.forEach(f => {

                // console.log(`C-${self.id} CONNECTING TO SERVER`)

                f({
                    on(event_type, func) {
                        if (event_type == 'message') self.on_messages.push(func)
                        else if (event_type == 'close') self.on_closes.push(func)
                    },
                    send(msg) {

                        // console.log(`S SEND to:C-${self.id} : ` + JSON.parse(msg).method)
                        // if (!self.is_open) console.log('NOT OPEN!')
                        // console.log(`S SEND to:C-${self.id} : ` + JSON.stringify(JSON.parse(msg), null, '    '))

                        g_debug_WS_messages.push(() => {

                            // console.log(`C-${self.id} receiving: ` + JSON.parse(msg).method)
                            // if (!self.is_open) console.log('NOT OPEN!')
                            // console.log(`C-${self.id} RECV: ` + JSON.stringify(JSON.parse(msg), null, '    '))

                            self.onmessage({data: msg})
                        })
                    }
                })
            })
            self.onopen && self.onopen()
        } else {
            self.onclose && self.onclose()
        }
    })
    return self
}

require('./random002.js')
var ds = require('./diffsync.js')
const { PerformanceObserver, performance } = require('perf_hooks');

async function main() {

    // var a = '' + require('fs').readFileSync('actions.json')
    // a = JSON.parse(a)
    // run_experiment_from_actions(a)

    // return

    var best_t = Infinity
    var best_seed = null
    var exp_time_est = 1
    var longest = 0
    var longest_seed = null
    var N = 200
    for (var i = 0; i < N; i++) {
        var seed = '12233345_a:' + i

        // N = 1
        // seed = '122333_a:9571'

        console.log('seed: ' + seed)
        var st = performance.now()
        var r = await run_experiment(seed)
            if (!r.ok && r.t < best_t) {
            best_t = r.t
            best_seed = seed
        }
        var t = performance.now() - st
        if (t > longest) {
            longest = t
            longest_seed = seed
        }
        exp_time_est = 0.9 * exp_time_est + 0.1 * t
        console.log(`exp_time_est = ${exp_time_est}, t=${t}`)
        console.log(`total time est = ${(exp_time_est * (N - i - 1))/1000/60}min`)
    }
    console.log('best_t = ' + best_t)
    console.log('best_seed = ' + best_seed)
    console.log('longest = ' + longest)
    console.log('longest_seed = ' + longest_seed)
}

async function run_experiment(rand_seed) {
    Math.randomSeed2(rand_seed)

    g_debug_WS_messages = []
    g_debug_WS_messages_delayed = []
    debug_WSS.the_one = null

    // var db_prefix = 'db_test.sqlite'
    // try { require('child_process').execSync(`rm ${db_prefix}*`) } catch (e) {}

    // var db = new (require('better-sqlite3'))(db_prefix)
    // db.pragma('journal_mode = WAL')
    // db.prepare('create table if not exists store (key text primary key, val text)').run()

    var db = {
        data: {},
        prepare(s) {
            if (s == 'select * from store where key = ?') {
                return {
                    get([key]) {
                        if (db.data[key]) return {val: db.data[key]}
                    }
                }
            } else if (s == 'replace into store (key, val) values (?, ?)') {
                return {
                    run([key, data]) {
                        db.data[key] = data
                    }
                }
            } else if (s == 'delete from store where key = ?') {
                return {
                    run([key]) {
                        delete db.data[key]
                    }
                }
            }
        }
    }

    var trials = 200
    var server = null
    var clients = []

    var log_stuff = false

    var actions = []

    for (var t = 0; t < trials; t++) {
        Date.now = () => t
        var st = performance.now()
        try {
            log_stuff && console.log('----------------------------- trial ' + t)

            if (!server && Math.random() < 0.4) {
                log_stuff && console.log('> starting server')
                actions.push({action: 'starting server', rand: Math.random.get_state()})
                server = create_server(db)
            } else if (server && Math.random() < 0.3) {
                log_stuff && console.log('> closing server')
                actions.push({action: 'closing server', rand: Math.random.get_state()})
                server.close()
                server = null
            } else {
                if (clients.length == 0 || (clients.length < 5 && Math.random() < 0.2)) {
                    log_stuff && console.log('> creating client')
                    actions.push({action: 'creating client', rand: Math.random.get_state()})
                    clients.push(create_client())
                } else {
                    let ci = Math.floor(Math.random() * clients.length)
                    let c = clients[ci]
                    if (!c.is_open && Math.random() < 0.3) {
                        log_stuff && console.log('> re-opening client')
                        actions.push({action: 're-opening client', id: c.id, rand: Math.random.get_state()})
                        c.open()
                    } else if (c.is_open && Math.random() < 0.4) {
                        if (Math.random() < 0.9) {
                            log_stuff && console.log('> closing client (temporarily)')
                            actions.push({action: 'closing client (temporarily)', id: c.id, rand: Math.random.get_state()})
                            c.close(false)
                        } else {
                            if (Math.random() < 0.5) {
                                log_stuff && console.log('> killing client with forget')
                                actions.push({action: 'killing client with forget', id: c.id, rand: Math.random.get_state()})
                                c.close(true)
                            } else {
                                log_stuff && console.log('> killing client w/o forget')
                                actions.push({action: 'killing client w/o forget', id: c.id, rand: Math.random.get_state()})
                                c.close(false)
                            }
                            clients.splice(ci, 1)
                        }
                    } else if (c.is_open) {

                        var inner_actions = []

                        for (let cii = 0; cii < clients.length; cii++) {
                            if (cii == ci || Math.random() < 0.2) {
                                let c = clients[cii]
                                let text = c.get()
                                let start = Math.floor(Math.random() * (text.length + 1))
                                let len = Math.floor(Math.random() * (text.length - start + 1))
                                let ins = String.fromCharCode(65 + Math.floor(Math.random() * 26)).repeat(Math.floor(Math.random() * 4) + (len == 0 ? 1 : 0))
                                log_stuff && console.log(`> C-${c.id} changing text ` + JSON.stringify(text) + `.splice(${start}, ${len}, ${JSON.stringify(ins)})`)
                                inner_actions.push({start, len, ins, id: c.id, rand: Math.random.get_state()})
                                c.set(start, len, ins)
                            }
                        }

                        actions.push({action: 'editing', inner_actions, rand: Math.random.get_state()})
                        
                    } else {
                        log_stuff && console.log('> doing nothing..')
                        actions.push({action: 'doing nothing..'})
                    }
                }
            }

            debug_WS_process_messages()

            log_stuff && console.log('server: ' + (server ? server.get() : 'down'))
            log_stuff && clients.forEach(c => console.log(`${c.id} client ${c.is_open ? ':' : 'X'} "${c.get()}"`))


            // if (true) {
            //     console.log('SERVER: ' + (server ? server.get_more() : 'down'))
            //     clients.forEach(c => console.log(`CLIENT ${c.id} = ${c.get_more()}`))
            // }





            if (server && clients.some(c => c.is_open)) {
                let text = clients.find(c => c.is_open).get()
                if (clients.some(c => c.is_open && c.get() != text)) {

                    require('fs').writeFileSync('actions.json', JSON.stringify(actions, null, '    '))

                    console.log('NOT THE SAME!')
                    return {ok: false, t}
                }
            }
        } catch (e) {

            // require('fs').writeFileSync('actions.json', JSON.stringify(actions, null, '    '))

            console.log('EXCEPTION', e)
            return {ok: false, t}
        }
        //actions.push({time: performance.now() - st})
    }

    // require('fs').writeFileSync('actions.json', JSON.stringify(actions, null, '    '))

    return {ok: true}
}

async function run_experiment_from_actions(actions) {
    Math.randomSeed2('hi')

    g_debug_WS_messages = []
    g_debug_WS_messages_delayed = []
    debug_WSS.the_one = null

    // var db_prefix = 'db_test.sqlite'
    // try { require('child_process').execSync(`rm ${db_prefix}*`) } catch (e) {}

    // var db = new (require('better-sqlite3'))(db_prefix)
    // db.pragma('journal_mode = WAL')
    // db.prepare('create table if not exists store (key text primary key, val text)').run()

    var db = {
        data: {},
        prepare(s) {
            if (s == 'select * from store where key = ?') {
                return {
                    get([key]) {
                        if (db.data[key]) return {val: db.data[key]}
                    }
                }
            } else if (s == 'replace into store (key, val) values (?, ?)') {
                return {
                    run([key, data]) {
                        db.data[key] = data
                    }
                }
            } else if (s == 'delete from store where key = ?') {
                return {
                    run([key]) {
                        delete db.data[key]
                    }
                }
            }
        }
    }

    var trials = 59
    var server = null
    var clients = []

    var log_stuff = true

    var t = 0
    for (var a of actions) {
        Date.now = () => t

        // console.log('a.action = ' + a.action)


        // work here
        // if (t == 6) {
        //     console.log(server.get_more())
        //     console.log('braid:', g_current_server_node.resource_at('/foo').mergeable.generate_braid(() => false))
        //     break
        // }


        try {
            log_stuff && console.log('----------------------------- trial ' + t)

            if (a.action == 'starting server') {
                log_stuff && console.log('> starting server')
                Math.random.set_state(a.rand)
                server = create_server(db)
            } else if (a.action == 'closing server') {
                log_stuff && console.log('> closing server')
                Math.random.set_state(a.rand)
                server.close()
                server = null
            } else {
                if (a.action == 'creating client') {
                    log_stuff && console.log('> creating client')
                    Math.random.set_state(a.rand)
                    clients.push(create_client())
                } else {
                    if (a.action == 're-opening client') {
                        log_stuff && console.log('> re-opening client')
                        var c = clients.find(c => c.id == a.id)
                        Math.random.set_state(a.rand)
                        c.open()
                    } else if (a.action == 'closing client (temporarily)') {
                        log_stuff && console.log('> closing client (temporarily)')
                        var c = clients.find(c => c.id == a.id)
                        Math.random.set_state(a.rand)
                        c.close(false)
                    } else if (a.action == 'killing client with forget') {
                        log_stuff && console.log('> killing client with forget')
                        var c = clients.find(c => c.id == a.id)
                        Math.random.set_state(a.rand)
                        c.close(true)
                        clients.splice(clients.findIndex(c => c.id == a.id), 1)
                    } else if (a.action == 'killing client w/o forget') {
                        log_stuff && console.log('> killing client w/o forget')
                        var c = clients.find(c => c.id == a.id)
                        Math.random.set_state(a.rand)
                        c.close(false)
                        clients.splice(clients.findIndex(c => c.id == a.id), 1)
                    } else if (a.action == 'editing') {
                        for (let inner_a of a.inner_actions) {
                            let start = inner_a.start
                            let len = inner_a.len
                            let ins = inner_a.ins
                            let c = clients.find(c => c.id == inner_a.id)
                            let text = c.get()
                            log_stuff && console.log(`> C-${c.id} changing text ` + JSON.stringify(text) + `.splice(${start}, ${len}, ${JSON.stringify(ins)})`)
                            Math.random.set_state(inner_a.rand)
                            c.set(start, len, ins)
                        }
                        Math.random.set_state(a.rand)
                    } else if (a.action == 'doing nothing..') {
                        log_stuff && console.log('> doing nothing..')
                    } else throw 'bad'
                }
            }

            debug_WS_process_messages()

            log_stuff && console.log('server: ' + (server ? server.get() : 'down'))
            log_stuff && clients.forEach(c => console.log(`${c.id} client ${c.is_open ? ':' : 'X'} "${c.get()}"`))


            if (true) {
                console.log('SERVER: ' + (typeof(g_current_server) != 'undefined' ? g_current_server.get_time() : 'not started'))
                clients.forEach(c => console.log(`CLIENT ${c.id} = ${c.get_time()}`))

                // console.log('null versions:')
                // console.log('SERVER: ' + (g_current_server ? g_current_server.get_null() : 'not started'))
                // clients.forEach(c => console.log(`CLIENT ${c.id} = ${c.get_null()}`))
            }


            if (server && clients.some(c => c.is_open)) {
                let text = clients.find(c => c.is_open).get()
                if (clients.some(c => c.is_open && c.get() != text)) {
                    console.log('NOT THE SAME!')
                    return {ok: false, t}
                }
            }
        } catch (e) {
            console.log('EXCEPTION', e)
            return {ok: false, t}
        }
        t++
    }
    return {ok: true}
}

main()

function create_server(db) {
    function create_persistent_node(key_base, get_key, set_key, del_key) {
        var a_or_b = get_key(key_base) || 'a'
    
        var d, node = null
        for (var next = 0; d = get_key(`${key_base}:${a_or_b}:${next}`); next++) {
            d = JSON.parse(d)


            // console.log('d = ', JSON.stringify(d, null, '    '))


            if (d.resources) {
                node = require('./node.js')(d)
    
                Object.entries(node.resources).forEach(resource =>
                    Object.values(resource[1].we_welcomed).forEach(pipe => {
                        pipe.remote = true
                        node.bind(resource[0], pipe)
                        node.gets_in.add(resource[0], pipe.id)
                    })
                )
    
            } else {
                if (!node) node = require('./node.js')()
                node[d.method](...d.args)
            }
        }
        if (!node) node = require('./node.js')()

        function add(x) {
            set_key(`${key_base}:${a_or_b}:${next++}`, JSON.stringify(x))
        }
    
        function prune() {
            a_or_b = (a_or_b == 'a') ? 'b' : 'a'
            for (var i = 0; get_key(`${key_base}:${a_or_b}:${i}`); i++) {}
            for (i = i - 1; i >= 0; i--) del_key(`${key_base}:${a_or_b}:${i}`)
    
            var old_next = next
            next = 0
            add(node)
            set_key(key_base, a_or_b)
    
            for (i = old_next - 1; i >= 0; i--)
                del_key(`${key_base}:${(a_or_b == 'a') ? 'b' : 'a'}:${i}`)
        }

        node.ons.push((method, args) => {
            if (Math.random() < 0.1) prune()
            add({method, args})
        })
    
        Object.entries(node.resources).forEach(([key, r]) =>
            Object.values(r.we_welcomed).forEach(pipe => {
                node.disconnected({key, origin: pipe})
            })
        )

        prune()
        node.persistent_prune = prune
        return node
    }
    
    var node = create_persistent_node('HIHI', key => {
        var x = db.prepare('select * from store where key = ?').get([key])
        return x && x.val
    }, (key, data) => {
        db.prepare('replace into store (key, val) values (?, ?)').run([key, data])
    }, key => {
        db.prepare('delete from store where key = ?').run([key])
    })

    node.on_errors.push((key, origin) => {
        // console.log('SERVER ON ERROR')
        node.unbind(key, origin)
    })

    node.fissure_lifetime = 1 // 4
    node.persistent_prune()
    
    var wss = require('./networks/websocket-server.js')(node)


    // work here
    g_current_server_node = node



    return g_current_server = {
        get() {
            //return node.resource_at('/foo').mergeable.read()
            return JSON.stringify(node.resource_at('/foo').mergeable.read()) + ' fissures: ' + Object.keys(node.resource_at('/foo').fissures).length
        },
        get_more() {
            return JSON.stringify(node.resource_at('/foo'), null, '    ')
        },
        get_fiss() {
            return JSON.stringify(node.resource_at('/foo').fissures, null, '    ')
        },
        get_time() {
            return JSON.stringify(node.resource_at('/foo').time_dag, null, '    ')
        },
        get_null() {
            return JSON.stringify(node.resource_at('/foo').mergeable.read_raw({}), null, '    ')
        },
        close() {
            wss.dead = true
            wss.close()
        }
    }
}

function create_client() {
    var page_key = '/foo'
    var update_markdown_later = () => {}
    var data_size = () => {}
    var my_on_input = () => {}
    var my_on_sel = () => {}
    var t = {value: '', selectionStart: 0, selectionEnd: 0,
        addEventListener: (_, cb) => {
            my_on_input = cb
        },
        setSelectionRange: () => {}
    }
    var stats = {innerText: ''}
    function add_selection_listener(_, cb) {
        my_on_sel = cb
    }
    var self = {
        id: null,
        is_open: true,
        get: () => {
            return t.value
        },
        get_more() {
            return JSON.stringify(node.resource_at(page_key), null, '    ')
        },
        get_fiss() {
            return JSON.stringify(node.resource_at(page_key).fissures, null, '    ')
        },
        get_time() {
            return JSON.stringify(node.resource_at(page_key).time_dag, null, '    ')
        },
        get_null() {
            return JSON.stringify(node.resource_at(page_key).mergeable.read_raw({}), null, '    ')
        },
        set: (x, del, ins) => {
            //if (x + del > t.value.length) throw 'bad'

            t.value = t.value.slice(0, x) + ins + t.value.slice(x + del)
            my_on_input()

            // work here
            if (x + ins.length <= t.value.length)
                my_on_sel(x + ins.length, x + ins.length)
            else
                my_on_sel(t.value.length, t.value.length)
        },
        close: (send_forget) => {
            if (send_forget) {
                node.forget(page_key, cb)
            }
            ws_client.disable()
            self.is_open = false
        },
        open: () => {
            ws_client.enable()
            self.is_open = true
        }
    }

    ///////////////////////////

    var prev_text = ''
    var node = require('./node.js')({id: 'C-' + Math.random().toString(36).slice(2, 12)})
    // require('./networks/websocket-client.js')({node, url: 'wss://invisible.college:1492/'})
    var ws_client = require('./networks/websocket-client.js')({node, reconnect_timeout: 10})

    self.id = node.pid

    node.ons.push((method, args) => {
        //console.log('RESOURCE: ' + JSON.stringify(node.resource_at(key).space_dag, null, '    '))
        //console.log('ABOUT TO: ' + method + ', ' + JSON.stringify(args))
    })

    var setting = 0

    function send_diff(from, to) {
        setting++
        var v = node.set(page_key, null, ds.diff_convert_to_my_format(ds.diff_main(from, to)).map(x =>
            `.text[${x[0]}:${x[0] + x[1]}] = ${JSON.stringify(x[2])}`
        ))
        setting--
    }

    function send_cursor_update(start, end) {
        // node.set(key, null, [
        //     `.cursors[${JSON.stringify(node.pid + '-start')}] = {"type": "location", "path": ".text[${start}]"}`,
        //     `.cursors[${JSON.stringify(node.pid + '-end')}] = {"type": "location", "path": ".text[${end}]"}`])

        setting++
        var v = node.set(page_key, null, [`.cursors[${JSON.stringify(node.pid)}] = {"type": "location", "path": ".text[${start}]"}`])
        setting--
    }

    var get_num = 0
    var cb = x => {
        if (setting) return

        get_num++
        if (get_num == 1) {
            console.assert(node.resource_at(page_key).weve_been_welcomed === true)

            // Initialize the object if it doesn't have a value yet
            if (!x || typeof(x) !== 'object') {
                let v = node.set(page_key, {cursors: {}, text: t.value})

            // Or if it does, then prepend it with our text, and send that
            } else {
                prev_text = t.value = t.value + x.text
                update_markdown_later()
                send_diff(x.text, t.value)
            }

            // Initialize our cursor to it
            send_cursor_update(t.selectionStart, t.selectionEnd)

            // And start sending all future updates
            t.addEventListener('input', e => {
                send_diff(prev_text, t.value)
                prev_text = t.value

                stats.innerText = 'Size: ' + data_size()
            })
            add_selection_listener(t, send_cursor_update)
        } else {
            console.assert(node.resource_at(page_key).weve_been_welcomed === true)
            prev_text = t.value = x.text
            update_markdown_later()

            // t.setSelectionRange(x.cursors[node.pid + '-start'], x.cursors[node.pid + '-end'])
            t.setSelectionRange(x.cursors[node.pid], x.cursors[node.pid])

            // debug_display.textContent = x.text.slice(0, x.cursors[node.pid + '-start'])
            //    + '^' + x.text.slice(x.cursors[node.pid + '-start'])
            //    + ' :' + x.cursors[node.pid + '-start']
        }

        stats.innerText = 'Size: ' + data_size()
    }

    node.on_errors.push((key, origin) => {
        // console.log('CLIENT ON ERROR')

        prev_text = t.value = ''
        delete node.resources[key]
        node.unbind(key, origin)

        var subscribe = ws_client.pipe.subscribed_keys[key].we_requested
        delete ws_client.pipe.subscribed_keys[key].we_requested

        ws_client.pipe.send({
            key,
            subscribe,
            method: 'get'
        })
    })

    node.get(page_key, cb)

    ///////////////////////////

    return self
}
