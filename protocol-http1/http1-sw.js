importScripts('/braid-bundle.js', '/localforage.js');
const braid = require('braid.js');
const store = require('store.js');
const httpClient = require("http1-client.js");
const dbName = 'braid';
// Initialize localForage
localforage.config({
    driver: localforage.INDEXEDDB,
    name: dbName
});
const braidTable = localforage.createInstance({
    name: dbName,
    storeName: 'http1-sw'
})
const clientTable = localforage.createInstance({
    name: dbName,
    storeName: 'client'
})
const Braid = store(braid(), {
    get: (...args) => braidTable.getItem(...args),
    set: (...args) => braidTable.setItem(...args),
    del: (...args) => braidTable.removeItem(...args),
    list_keys: (...args) => braidTable.keys(...args)
});
// This has to wait until activate!
const Socket = Braid.then(node => httpClient({ node: node, url: location.origin }));

self.addEventListener('install', (event) => {
    self.skipWaiting().then(clients.claim);
});

self.addEventListener('activate', (event) => {
    // Probably make a new db and restart any open braid connections?
    // For now, we'll claim clients and start the network connection
});

self.addEventListener("message", (event) => {
    // event.data, event.origin, event.source

    let msg = event.data;
    event.waitUntil(Promise.all([Socket, Braid])
        .then(sn => {
            let sock = sn[0],
                node = sn[1];
            // A key to be used in the DB for keeping track of subscribed keys
            const subKey = `${event.source.id}:${msg.key}`;
            switch (msg.method) {
                case "get":
                    console.log("Making GET", msg);
                    let sendNewData = (val) => {
                        // Send back postMessages asynchronously
                        setTimeout(() => {
                            event.source.postMessage({ key: msg.key, value: val });
                        })
                    };
                    // event.waitUntil (Socket's GET is finished).
                    node.get(msg.key, sendNewData);
                    // Node.get will have created a pipe on the callback sendNewData.
                    // We want to use our DB to remember the mapping
                    // event.source.id + msg.key => sendNewData.pipe.id.
                    event.waitUntil(
                        clientTable.setItem(subKey, sendNewData.pipe.id)
                    );
                    break;
                case "set":
                    console.log("Making SET", msg)
                    // event.waitUntil (socket's set is done)
                    node.set(msg.key, null, msg.patches);
                    break;
                case "forget":
                    // We don't want the serviceworker to be killed until this is done
                    event.waitUntil(
                        // Get the ID assigned to the subscription callback
                        clientTable.getItem(subKey)
                        // Forget the key
                        .then(subId => {
                            node.forget(msg.key, {pipe: {id: subId}});
                            // And remove the ID
                            return clientTable.removeItem(subKey);
                        })
                    )
                    break;
            }
        })
    )
})

/* For now, we DON'T want to cache, since we're editing things frequently.

// Cache static resources
self.addEventListener('fetch', (event) => {

    // When a controlled client tries to request a resource
    event.respondWith(
        // See if we've cached it
        caches.match(event.request).then((resp) => {
            // If so, send it back, otherwise fetch it
            return resp || fetch(event.request).then((response) => {
                // And then open the cache
                let clone = response.clone();
                caches.open('braid-http1').then((cache) => {
                    // And cache the new resource
                    cache.put(event.request, clone);
                });
                // Then send it back
                return response;
            });
        })
    );
});
*/