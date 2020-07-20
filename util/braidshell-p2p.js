var util = require('utilities.js');
var store = require('store.js');

const states = {
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
const signalTypes = {
    // The leader has submitted their letter of resignation.
    // The leader is not going to handle events during the election.
    // This means we have to cache incoming events.
    LEADER_UNLOADING: "leader-unloading",
    // The election is starting.
    START_ELECTION: "start-election",
    // The leader sends a 1-way ping, letting clients know it's alive.
    LEADER_ALIVE: "ping",
    // A command sent by a client to the leader.
    COMMAND: "command",
    // The leader has received new state from the remote peer.
    STATE: "state"
};
const channelName = "braid-leadertab";
const pingInterval = 250;

const dbName = "braid-db";
// This table the state of the braid
const dbNetworkStore = "braid-network";
// This table is just a mutex
const dbElectionStore = "election";
// This table stores subscriptions to things
const dbSubscriptionStore = "subscriptions";

module.exports = require["braidshell-p2p"] = function(url) {
    // Our leaderId, probably not actually needed.
    const id = util.random_id();
    // Timeout handle for leader activity
    let leader_alive_id;
    // The channel over which we will broadcast state and commands
    const channel = new BroadcastChannel(channelName);
    function sendRaw(obj) {
        // Make sure we send something at most `pingInterval` ms from now
        if (state === states.ELECTED || state === states.LEADER) {
            clearTimeout(leader_alive_id);
            leader_alive_id = setTimeout(() => sendRaw({type: signalTypes.LEADER_ALIVE}), pingInterval);
        }
        channel.postMessage(obj);
    }
    // Buffer for commands received during leader initialization
    const command_queue = [];
    // Until we're sure who the leader is, we want to buffer things.
    let state = states.ELECTING;
    // Try to open the DB
    const dbPromise = idb.openDB(dbName, 3, { upgrade(db) {
        if (!db.objectStoreNames.contains(dbNetworkStore))
            db.createObjectStore(dbNetworkStore);
        if (!db.objectStoreNames.contains(dbElectionStore))
            db.createObjectStore(dbElectionStore);
        if (!db.objectStoreNames.contains(dbSubscriptionStore)) {
            let subs = db.createObjectStore(dbSubscriptionStore, {keyPath: 'key'});
            subs.createIndex('count', 'count', {unique: false});
        }
    }})
    // Try to become the leader ASAP
    dbPromise.then(becomeLeader());

    // Stuff for the leader
    let node;
    let socket;
    const remote_get_handlers = {};

    /** 
     * Route an incoming message to various handlers
     */
    channel.addEventListener('message', (event) => {
        // Reset the leader_alive timer
        if (state === states.CLIENT || state === states.ELECTING) {
            clearTimeout(leader_alive_id);
            leader_alive_id = setTimeout(startElection, pingInterval*2);
        }
        switch (event.data.type) {
            // If the 
            case signalTypes.LEADER_UNLOADING:
                // If multiple elections get called really fast
                if (state === states.CLIENT)
                    state = states.ELECTING;
                break;
            case signalTypes.START_ELECTION:
                if (state === states.ELECTING)
                    becomeLeader();
                break;
            case signalTypes.COMMAND:
                if (state !== states.CLIENT)
                    handleCommand(event.data);
                break;
            case signalTypes.STATE:
                // Output the new state
                recvState(event.data);
                break;
            case signalTypes.LEADER_ALIVE:
                break;
            default:
                console.warn("Unknown signal type in message", event.data);
        }
    })
    /**
     * When the leader tab is closed, it will inform other clients and start an election
     */
    async function startElection() {
        sendRaw({type: signalTypes.LEADER_UNLOADING});
        // Unset the leader
        const db = await dbPromise;
        try {
            await db.delete(dbElectionStore, "leader");
        } catch (e) {
            console.error("Failed to delete leader", e);Object.values(resource.fissures).forEach(f => {
            Object.keys(f.versions).forEach(v => {
                if (!resource.time_dag[v]) return
                tag(v, v)
                maintain[v] = true
            })
        })
        }
        // Start an election
        sendRaw({type: signalTypes.START_ELECTION});
    }
    self.addEventListener('beforeunload', async () => {
        // If this tab is the leader
        if (state === states.LEADER || state === states.ELECTED) {
            // TODO: Is there a way to make sure the browser doesn't shut down the JS thread
            // before we've had a chance to call for an election?
            await startElection();
        }
        // Also, unload listeners on the chat should get fired before this one.
        // Unsubscribe to the broadcast channel
        //channel.close()
        // Make sure this tab won't try to do anything.
        state = states.CLIENT;
    })
    /**
     * Using the electionstore as a mutex, attempt to set ourselves as the leader.
     * On success, prepare the leader responsibilities.
     * On failure, make ourselves a client.
     */
    async function becomeLeader() {
        // Try to set ourselves as the leader
        try {
            const db = await dbPromise;
            const tx = db.transaction(dbElectionStore, "readwrite");
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
            // We can also forget the command queue.
            command_queue.length = 0;
            // Finally, start checking the elected leader for inactivity
            clearTimeout(leader_alive_id);
            leader_alive_id = setTimeout(startElection, pingInterval*2);
            return;
        }
        // If we get here, then we successfully added our id to the store, making us the leader.
        state = states.ELECTED;
        // Tell clients we're alive
        sendRaw({type: signalTypes.LEADER_ALIVE});
        // Create a node
        node = require("braid.js")();
        // Fast forward the node using the db
        await store(node, {
            async get(key) {
                return (await dbPromise).get(dbNetworkStore, key);
            },
            async set(key, data) {
                return (await dbPromise).put(dbNetworkStore, data, key);
            },
            async del(key) {
                return (await dbPromise).delete(dbNetworkStore, key);
            },
            async list_keys() {
                return (await dbPromise).getAllKeys(dbNetworkStore);
            }
        });
        // Connect the node to the db
        socket = require(url.startsWith("http") ? 'http-client.js' : 'websocket-client.js')({node, url});
        // Resend any GETs
        /*(await 
            (await dbPromise) // Get the DB
            .transaction(dbSubscriptionStore, "readonly") // Open a read-only transaction
            .store.index("count") // Get the subscriptionStore, and open the index by count
        .getAll(IDBKeyRange.lowerBound(0, true))) // Get all entries with nonzero count
        .forEach(({key}) => 
            remote_get_handlers[key] = subscribe(key)); */

        // Now we're done, so we can start leading.
        state = states.LEADER;
        
        while (command_queue.length)
            handleCommand(command_queue.shift());
    }
    /**
     * Create a subscription to a remote key, and send the results over the broacast channel.
     */
    function subscribe(key) {
        if (node.incoming_subscriptions.count(key))
            return console.warn("We tried to resub to", key);
        function cb(val) {
            // Whenever we get a new version of key
            let outMessage = {type: signalTypes.STATE, key, val};
            // Send it to everyone else
            sendRaw(outMessage);
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
        if (state === states.ELECTING || state === states.ELECTED) {
            command_queue.push(command);
            return;
        }
        // Have the node receive the command
        switch (command.method) {
            case "get":
                // Get a handle on the db
                dbPromise.then(async db => {
                    const tx = db.transaction(dbSubscriptionStore, "readwrite");
                    // Get the current sub object, or create it if it doesn't exist
                    let sub = await tx.store.get(command.key) || {key: command.key, count: 0};
                    // If this is the first subscription, send the actual subscription.
                    if (sub.count++ === 0)
                        remote_get_handlers[id] = subscribe(command.key);
                    // Otherwise, rebroadcast the current state for the new client.
                    else
                        sendRaw({
                            type: signalTypes.STATE,
                            key: command.key,
                            val: node.resource_at(command.key).mergeable.read()
                        })
                    // Count this subscription
                    return Promise.all([
                        tx.store.put(sub),
                        tx.done
                    ]);
                })
                break;
            case "set":
                node.setPatch(command.key, command.patch);
                break;
            case "forget":
                // This is going to look very similar to the "get" code
                // Get a handle on the db
                dbPromise.then(async db => {
                    const tx = db.transaction(dbSubscriptionStore, "readwrite");
                    // Get the current sub object, or create it if it doesn't exist
                    let sub = await tx.store.get(command.key);
                    if (!sub || sub.count <= 0)
                        throw "Someone tried to forget a key that we're not subscribed to"
                    // Remove this subscription
                    // If this was the last subscription, forget it.
                    let id = remote_get_handlers[command.key];
                    if (--sub.count === 0)
                        node.forget(command.key, {pipe: {id}});
                    
                    return Promise.all([
                        tx.store.put(sub),
                        tx.done
                    ]);
                })
                break;
            default:
                console.log("Can't handle message", command);
        }
    }

    /**
     * Send a command when requested by the local frontend.
     */
    function send(message) {
        message.type = signalTypes.COMMAND;
        // Unless we're definitely the leader, broadcast stuff
        if (state === states.CLIENT || state === states.ELECTING);
            sendRaw(message)
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
    // Bind the shell methods
    let braidShell = {};
    let local_get_handlers = {};
    
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
        //send({method: "default", key, value: val});
    }
    return braidShell;
};