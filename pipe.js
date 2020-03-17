// A pipe is a network connection that can get disconnected and reconnected.
//
// A pipe can send and receive.  The user supplies a `send_function` that:
//
//   • will be called from pipe.send(), and
//   • will return a result to pipe.recv().
//
// When a pipe disconnects, it will automatically send out fissures.  When it
// re-connects, it will automatically re-establish connections.
//
// Todo:
//   • Describe the connect process and connect() function
//
module.exports = require.pipe = function create_pipe({node, id, send, connect, type}) {
    assert(node && send && connect, {node,send,connect})
    id = id || u.random_id()

    // The Pipe Object!
    var pipe = {

        // A pipe holds four variables:
        id: id,
        type: type,
        connection: null,
        connecting: false,
        them: null,
        subscribed_keys: u.dict(),
        remote: true,

        // It can Send and Receive messages
        send (args) {
            var we_welcomed = args.key && node.resource_at(args.key).we_welcomed[this.id]
            log('pipe.send:', args.method, 'welcomed:', !!we_welcomed)
            assert(args.method !== 'hello')
            log('...')

            // Record new keys
            if (args.method === 'get') {
                assert(!this.connection
                       || !this.subscribed_keys[args.key]
                       || !this.subscribed_keys[args.key].we_requested,
                       'Duplicate get 1:', args,
                       {connection: this.connection,
                        subscription: this.subscribed_keys[args.key]})

                assert(args.key, node.resource_at(args.key).mergeable)

                // Initialize subscribed_keys
                this.subscribed_keys[args.key] =
                    this.subscribed_keys[args.key] || {}

                // Remember that we requested this subscription
                this.subscribed_keys[args.key].we_requested = args.subscribe

                // If this is the first message, let's try to connect the pipe.
                if ( this.connecting) return
                if (!this.connection) {
                    this.connecting = true

                    // Run the programmer's connect function
                    connect.apply(this)

                    // Don't run the send code below, since we'll send this
                    // get when the connection completes
                    return
                }
            } else if (args.method === 'forget') {
                // Record forgotten keys
                delete this.subscribed_keys[args.key].we_requested
                node.unbind(args.key, this)

            } else if (args.method === 'welcome' && !args.unack_boundary) {

            // If we haven't welcomed them yet, ignore this message
            } else if (!we_welcomed) {
                // Oh shit, I think this is a bug.  Cause if they welcomed us,
                // we wanna send them shit too... but maybe we need to start
                // by welcoming them.
                log('gooooo away', we_welcomed)
                return
            }

            // Clean out the origin... because we don't use that.
            delete args.origin

            // And now send the message
            log('pipe.send:', (this.id || node.pid), args.method,
                args.version || '')

            if (this.connection)
                send.call(this, args)
            else
                log('FAILED to send, because pipe not yet connected..')
        },
        recv (args) {
            var we_welcomed = args.key && node.resource_at(args.key).we_welcomed[this.id]
            log(`pipe.RECV:`,
                node.pid + '-' + (this.them || '?'),
                args.method,
                args.version || '')

            // The hello method is only for pipes
            if (args.method === 'hello') {
                this.connection = (this.connection < args.connection
                                   ? this.connection : args.connection)
                this.them = args.my_name_is

                // hello messages don't do anything else (they are just for
                // the pipe)
                return
            }

            if (args.method === 'welcome'
                && !we_welcomed
                /*&& !this.subscribed_keys[args.key].we_requested*/) {
                // Then we need to welcome them too
                var resource = node.resource_at(args.key)
                var versions = resource.mergeable.generate_braid(x => false)
                var fissures = Object.values(resource.fissures)
                this.send({method: 'welcome', key: args.key, versions, fissures})
                resource.we_welcomed[this.id] = {id: this.id, connection: this.connection, them: this.them}
            }

            // Remember new subscriptions from them
            if (args.method === 'get') {
                // assert(!(this.subscribed_keys[args.key]
                //          && this.subscribed_keys[args.key].they_requested),
                //        'Duplicate get 2:', args,
                //        {subscription: this.subscribed_keys[args.key]})

                // Initialize subscribed_keys
                this.subscribed_keys[args.key] =
                    this.subscribed_keys[args.key] || {}

                // Record their subscription
                this.subscribed_keys[args.key].they_requested = args.subscribe
            }

            args.origin = this
            node[args.method](args)

            if (args.method === 'get') {
                log('pipe.recv: New remote!', this.id, 'Now we have', node.remotes(args.key).length)
            }
        },

        // It can Connect and Disconnect
        connected () {
            // console.log('pipe.connect:', this.id, this.connection || '')

            if (this.connection) {
                log('pipe.connect:', this.id, 'already exists! abort!')
                return
            }

            this.connecting = false

            // Create a new connection ID
            this.connection = u.random_id()

            // Initiate connection with peer
            log('sending hello..')

            send.call(this, {method: 'hello',
                             connection: this.connection,
                             my_name_is: node.pid})

            // Send gets for all the subscribed keys again
            for (k in this.subscribed_keys) {
                // This one is getting called earlier.
                //
                // The send() function wants to make sure this isn't a
                // duplicate request, so let's delete the old one now so
                // that we can recreate it.

                var subscribe = this.subscribed_keys[k].we_requested
                delete this.subscribed_keys[k].we_requested

                this.send({
                    key: k,
                    subscribe: subscribe,
                    method: 'get',
                })
            }
        },
        disconnected () {
            for (k in this.subscribed_keys) {

                if (this.keep_alive(k))
                    // Tell the node.  It'll make fissures.
                    node.disconnected({key:k, origin: this})

                // Drop all subscriptions not marked keep_alive
                var s = this.subscribed_keys[k]
                if (!(s.we_requested   && s.we_requested.keep_alive  ))
                    delete s.we_requested
                if (!(s.they_requested && s.they_requested.keep_alive))
                    delete s.they_requested

                // If both are gone, remove the whole subscription
                if (!(s.we_requested || s.they_requested))
                    delete this.subscribed_keys[k]
            }

            this.connecting = false
            this.connection = null
            this.them = null
        },

        keep_alive (key) {
            var s = this.subscribed_keys[key]
            return ((s.we_requested && s.we_requested.keep_alive)
                    ||
                    (s.they_requested && s.they_requested.keep_alive))
        },

        printy_stuff (key) {
            return {id: this.id,
                    w: !!node.resource_at(key).we_welcomed[this.id],
                    k_a: this.keep_alive(key),
                    peer: this.them,
                    c: !!this.connection,
                    r: this.remote
                   }
        }
    }

    return pipe
}

