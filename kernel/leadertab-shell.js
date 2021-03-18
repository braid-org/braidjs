var util = require('utilities.js');
var store = require('store.js');

const states = {
    // Don't process incoming commands and don't send outgoing ones
    DISABLED: 0,
    // The leader exists and it is not us.
    // We should send any activity to the leader.
    CLIENT: 1, 
    // There is no leader.
    // We should try to become the leader, and save anything we get until then.
    // We should also broadcast anything we do before then.
    ELECTING: 2, 
    // We have become the leader, but we aren't ready to send things to the server yet.
    // We should get the connection ready, and save anything we get until then.
    ELECTED: 3,
    // We are the leader.
    // We should apply incoming commands and broadcast new state.
    LEADER: 4
};
const signal_types = {
    // The leader has submitted their letter of resignation.
    // The leader is not going to handle events during the election.
    // This means we have to cache incoming events.
    LEADER_UNLOADING: "leader-unloading",
    // The election is starting.
    START_ELECTION: "start-election",
    // Any client can send a PING to the leader
    PING: "ping",
    // Only the leader responds to a ping, and it responds with a pong.
    PONG: "pong",
    // A command sent by a client to the leader.
    COMMAND: "command",
    // The leader has received new state from the remote peer.
    STATE: "state"
};
const channel_name = "braid-leadertab";
// We can basically make this as low as we want.
// Since the leader tab has a websocket open (if alive), it can instantly respond to our ping
// and it doesn't use timers.
const ping_timeout = 200;

const db_name = "braid-db";
// This table the state of the braid
const db_network_store = "braid-network";
// This table is just a mutex
const db_election_store = "election";
// Every subscribed key gets a localstorage entry of the form prefix_key
// This var is the prefix used (with the separator attached)
const ls_sub_prefix = "braidsub" + "_";

module.exports = require["leadertab-shell"] = function(url) {
    // Our leaderId, probably not actually needed.
    const id = util.random_id();
    // Timeout handle for leader activity
    let leader_alive_id;
    // The channel over which we will broadcast state and commands
    const channel = new BroadcastChannel(channel_name);
    // Buffer for commands received during leader initialization
    let command_queue = [];
    // Until we're sure who the leader is, we want to buffer things.
    let state = states.ELECTING;
    // Try to open the DB
    const dbPromise = idb.openDB(db_name, 4, { upgrade(db) {
        if (!db.objectStoreNames.contains(db_network_store))
            db.createObjectStore(db_network_store);
        if (!db.objectStoreNames.contains(db_election_store))
            db.createObjectStore(db_election_store);
    }})
    // Try to become the leader ASAP
    dbPromise.then(becomeLeader());

    // Stuff for the leader
    let node;
    let socket;
    // The pipe.id for each registered subscription callback
    // This is a local variable because when the connection is migrated, subscriptions
    // will be recreated with new IDs.

    // The pipe created in websocket-client.js is capable of managing subscriptions,
    // but to use it we'd have to store the pipe in the db.
    // TODO: Storing the pipe in the db might actually be good
    let remote_get_handlers = {};
    let local_defaults = {};

    /** 
     * Route an incoming message to various handlers
     */
    channel.addEventListener('message', (event) => {
        if (state === states.DISABLED)
            return;
        
        switch (event.data.type) {
            // Communication about braid objects
            case signal_types.COMMAND:
                if (state !== states.CLIENT)
                    handleCommand(event.data);
                break;
            case signal_types.STATE:
                recvState(event.data);
                break;
            // Leader-alive verification
            case signal_types.PING:
                if (state === states.LEADER || state === states.ELECTED)
                    channel.postMessage({type: signal_types.PONG})
                break;
            case signal_types.PONG:
                clearTimeout(leader_alive_id);
                break;
            // Leader changing
            case signal_types.LEADER_UNLOADING:
                state = states.ELECTING;
                break;
            case signal_types.START_ELECTION:
                if (state === states.ELECTING)
                    becomeLeader();
                break;
            default:
                console.warn("Unknown signal type in message", event.data);
        }
    })
    /**
     * When the leader tab is closed, it will inform other clients and start an election
     */
    async function startElection(local_eligible) {
        channel.postMessage({type: signal_types.LEADER_UNLOADING});
        if (local_eligible)
            state = states.ELECTING;
        // Unset the leader
        const db = await dbPromise;
        try {
            await db.delete(db_election_store, "leader");
        } catch (e) {
            console.error("Failed to delete leader. \nThis is most likely because someone else managed to do it first.");
            console.error(e);
        }
        // Start an election
        channel.postMessage({type: signal_types.START_ELECTION});
        if (local_eligible)
            becomeLeader();
    }
    function resign() {
        // If this tab is the leader, it should trigger an election
        if (state === states.LEADER || state === states.ELECTED) {
            // TODO: Is there a way to make sure the browser doesn't shut down the JS thread
            // before we've had a chance to call for an election?
            startElection();
        }

        // The only case in which we'll have a socket and not be the leader
        // is if we were the leader and we were impeached for inactivity
        if (socket)
            socket.disable();
        state = states.DISABLED;
    }
    /**
     * Using the electionstore as a mutex, attempt to set ourselves as the leader.
     * On success, prepare the leader responsibilities.
     * On failure, make ourselves a client.
     */
    async function becomeLeader() {
        console.log("Trying to become leader...")
        // Try to set ourselves as the leader
        try {
            const db = await dbPromise;
            const tx = db.transaction(db_election_store, "readwrite");
            // This promise will reject if leaderKey is already set.
            await Promise.all([
                tx.store.add(id, "leader"),
                tx.done
            ]);
        } catch (e) {
            // If we get a constrainterror or aborterror, that means the above promise rejected.
            if (e.name !== 'ConstraintError' && e.name !== 'AbortError')
                console.error(e);
            // So we're a client.
            state = states.CLIENT;
            console.log("We're a client.")
            // We can also forget the command queue.
            command_queue.length = 0;
            // Finally, check the leader for activity.
            pingLeader();
            return;
        }
        console.log("We became the leader.")
        // If we get here, then we successfully added our id to the store, making us the leader.
        state = states.ELECTED;
        // Create a node
        node = braidShell.node = require("braid.js")();
        // Fast forward the node using the db
        await store(node, {
            async get(key) {
                return (await dbPromise).get(db_network_store, key);
            },
            async set(key, data) {
                return (await dbPromise).put(db_network_store, data, key);
            },
            async del(key) {
                return (await dbPromise).delete(db_network_store, key);
            },
            async list_keys() {
                return (await dbPromise).getAllKeys(db_network_store);
            }
        });
        Object.entries(local_defaults)
            .map(([key, value]) => node.default(key, value))
        
        // Connect the node to the network
        socket = require(url.startsWith("http") ? 'http-client.js' : 'websocket-client.js')({node, url});
        socket.addEventListener("connect", () => {
            // Resend GETs that we might have lost while migrating
            Object.keys(localStorage)
            .filter(k => k.startsWith(ls_sub_prefix))
            .forEach(storage_key => {
                let braid_key = storage_key.substring(ls_sub_prefix.length);
                // see https://stackoverflow.com/q/12862624
                if ((+localStorage.getItem(storage_key)) > 0)
                    remote_get_handlers[braid_key] = subscribe(braid_key)
            })

            // Now we're done, so we can start leading.
            state = states.LEADER;
            // Do anything that we might have queued up during the election.
            while (command_queue.length)
                handleCommand(command_queue.shift());
        });
        socket.enable();
    }

    /**
     * Create a subscription to a remote key, and send the results over the broacast channel.
     */
    function subscribe(key) {
        if (remote_get_handlers.hasOwnProperty(key))
            throw `Attempted double-subscription of ${key}`
        function cb(val) {
            // Whenever we get a new version of key
            let outMessage = {type: signal_types.STATE, key, val};
            // Send it to everyone else
            channel.postMessage(outMessage);
            // Receive it ourselves
            recvState(outMessage);
        };
        node.get(key, cb);
        return cb.pipe.id;
    }
    /**
     * Apply commands send over the broadcast channel to the node.
     */
    function handleCommand(command) {
        // During the election, we don't know who will end up as the leader.
        // If it could be us, we want to enqueue messages, and process or discard them later.
        if (state === states.ELECTING || state === states.ELECTED) {
            command_queue.push(command);
            return;
        }
        // Have the node receive the command
        switch (command.method) {
            case "get": {
                let ls_sub_key = ls_sub_prefix + command.key
                // Localstorage returns null for unknown properties
                // and +null == 0
                let sub_count = +localStorage.getItem(ls_sub_key);
                if (sub_count++ === 0)
                    remote_get_handlers[command.key] = subscribe(command.key);
                else 
                    channel.postMessage({
                        type: signal_types.STATE,
                        key: command.key,
                        val: node.resource_at(command.key).mergeable.read()
                    })
                localStorage.setItem(ls_sub_key, sub_count);
                break;
            }
            case "set":
                node.setPatch(command.key, command.patch);
                break;
            case "forget": {
                // This is going to look very similar to the "get" code
                let ls_sub_key = ls_sub_prefix + command.key
                let sub_count = +localStorage.getItem(ls_sub_key);
                if (sub_count <= 0)
                    throw `Can't unsub from ${command.key} because we aren't subscribed to it`
                
                let id = remote_get_handlers[command.key];
                // If this was the last sub, send the forget upstream
                if (--sub_count === 0) {
                    node.forget(command.key, {pipe: {id}});
                    delete remote_get_handlers[command.key];
                }
                localStorage.setItem(ls_sub_key, sub_count)
                break;
            }
            default:
                console.warn("Can't handle message", command);
        }
    }

    /**
     * Send a command when requested by the local frontend.
     */
    function send(message) {
        message.type = signal_types.COMMAND;
        // Unless we're definitely the leader, broadcast stuff
        if (state === states.CLIENT || state === states.ELECTING)
            channel.postMessage(message);
        if (state !== states.CLIENT)
            handleCommand(message);
    }
    /**
     * Inform the frontend of new state
     */
    function recvState(message) {
        if (local_get_handlers.hasOwnProperty(message.key))
            local_get_handlers[message.key].forEach(f => f(message.val));
    }
    /**
     * Ping the leader to make sure it's alive
     */
    function pingLeader(time) {
        if ((state !== states.CLIENT  && state !== states.ELECTING)
            || document.visibilityState !== "visible")
            return;
        clearTimeout(leader_alive_id);
        channel.postMessage({type: signal_types.PING});
        // Start the election, and tell this tab that it's a candidate
        leader_alive_id = setTimeout(() => startElection(true), time || ping_timeout);
    }
    document.addEventListener("visibilitychange", () => pingLeader(), false);
    // Bind the shell methods
    let braidShell = {};
    let local_get_handlers = {};
    
    braidShell.ping = pingLeader;
    // It is the responsibility of the programmer to call close() before the page unloads!
    braidShell.close = resign;
    // Allow the frontend to get the state
    braidShell.getState = () => state;

    braidShell.get = (key, cb) => {
        // TODO
        if (!cb)
            throw "callback is required when using leadertab"
        cb.id = util.random_id();
        // Add callback
        if (local_get_handlers[key])
            local_get_handlers[key].push(cb);
        else {
            local_get_handlers[key] = [cb];
            send({method: "get", key: key})
        }
    };
    braidShell.set = (key, value) => {
        send({method: "set", key, patch: [`= ${JSON.stringify(value)}`]});
    };
    braidShell.setPatch = (key, patch) => {
        send({method: "set", key, patch});
    };
    braidShell.forget = (key, cb) => {
        let index = local_get_handlers[key].findIndex(e => e.id === cb.id);
        if (index == -1)
            return;
        local_get_handlers[key].splice(index, 1);
        if (local_get_handlers[key].length == 0)
            send({method: "forget", key});
    };
    braidShell.default = (key, val) => {
        local_defaults[key] = val;
        if ((state === states.LEADER || state === states.ELECTED) && node)
            node.default(key, val);
    }
    return braidShell;
};