# antimatter: an algorithm that prunes CRDT/OT history

[Antimatter](https://braid.org/antimatter) is the world's first peer-to-peer synchronization algorithm that can prune its history in a network where peers disconnect, reconnect, and merge offline edits.  Antimatter supports arbitrary simultaneous edits, from arbitrary peers, under arbitrary network delays and partitions, and guarantees full CRDT/OT consistency, while pruning unnecessary history within each partitioned subnet, and across subnets once they reconnect.  In steady state, it prunes down to zero overhead.  This lets you put synchronizing data structures in more parts of your software, without worrying about memory overhead.

This package implements an antimatter peer composed of three objects:

```js
var {sequence, json, antimatter} = require('@braidjs/antimatter')
```
- `sequence` is a pruneable sequence CRDT — sequence meaning it represents a javascript string or array, CRDT meaning this structure can be merged with other ones, and pruneable meaning that it supports an operation to remove meta-data when it is no longer needed (whereas CRDT's often keep track of this meta-data forever).
- `json` is a pruneable JSON CRDT — JSON meaning it represents an arbitrary JSON datstructure, and CRDT and pruneable having the same meaning as for `sequence` above.  `json` makes recursive use of `sequence` structures to represent arbitrary JSON (for instance, a map is represented with a `sequence` structure for each value, where the first element in the sequence is the value).
- `antimatter` subclasses the `json` CRDT object, and adds antimatter algorithm methods to it so that it can communicate with other peers to learn which history can be pruned, and tells the `json` object to prune it.

The Antimatter Algorithm was invented by Michael Toomim and Greg Little in the
[Invisible College](https://invisible.college/).

[Click here to see this README side-by-side with the source code.](https://braid-org.github.io/braidjs/antimatter/doc.html)

# API

# antimatter.create(send[, init])
creates and returns a new antimatter object (or adds antimatter methods and properties to `init`)
* `send`: a callback function to be called whenever this antimatter wants to send a message over a connection registered with `get` or `connect`. the sole parameter to this function is a JSONafiable object that hopes to be passed to the `receive` method on the antimatter object at the other end of the connection specified in the `conn` key.
* `init`: (optional) an antimatter object to start with, which we'll add any properties to that it doesn't have, and we'll add all the antimatter methods to it. this option exists so you can serialize an antimatter instance as JSON, and then restore it later.

``` js
var antimatter_instance = antimatter.create(msg => {
    websockets[msg.conn].send(JSON.stringify(msg))
}, JSON.parse(fs.readFileSync('./antimatter.backup')))
```

# antimatter_instance.receive(message)
let this antimatter object "receive" a message from another antimatter object, presumably from its `send` callback

``` js
websocket.on('message', data => {
    antimatter_instance.receive(JSON.parse(data))
});
```

you generally do not need to mess with a message object directly, but below are the various message objects you might see, categorized by their `cmd` entry. note that each object also contains a `conn` entry with the id of the connection the message is sent over

## message `get`
`get` is the first message sent over a connection, and the peer at the other end will respond with `welcome`
``` js
{cmd: 'get', peer: 'SENDER_ID', conn: 'CONN_ID'}
```

## message `forget`
used to disconnect without creating a fissure, presumably meaning the sending peer doesn't plan to make any edits while they're disconnected
``` js
{cmd: 'forget', conn: 'CONN_ID'}
```

## message forget `ack`
sent in response to `forget`.. so they know we forgot them
``` js
{cmd: 'ack', forget: true, conn: 'CONN_ID'}
```

## message `disconnect`
issued locally when we detect that a peer has disconnected, in which case we'll set `fissure` to `true`; or when we are forgetting a peer, in which case we'll set `fissure` to `false`, since we don't plan to reconnect with them
``` js
{cmd: 'disconnect', fissure: true or false, conn: 'CONN_ID'}
```

## message `fissure`
sent to alert peers about a fissure. the `fissure` entry contains information about the two peers involved in the fissure, the specific connection id that broke, the `versions` that need to be protected, and the `time` of the fissure (in case we want to ignore it after some time). it is also possible to send multiple `fissures` in an array
``` js
{
    cmd: 'fissure',
    fissure: { // or fissures: [{...}, {...}, ...],
        a: 'PEER_A_ID',
        b: 'PEER_B_ID',
        conn: 'CONN_ID',
        versions: {'VERSION_ID': true, ...},
        time: Date.now()
    },
    conn: 'CONN_ID'
}
```

## message `set`
sent to alert peers about a change in the document. the change is represented as a version, with a unique id, a set of parent versions (the most recent versions known before adding this version), and an array of patches, where the offsets in the patches do not take into account the application of other patches in the same array.
``` js
{
    cmd: 'set',
    version: 'VERSION_ID',
    parents: {'PARENT_VERSION_ID': true, ...},
    patches: [
        {range: '.json.path.a.b', content: 42}, ...
    ],
    conn: 'CONN_ID'
}
```

## message local `ack`
sent in response to `set`, but not right away; a peer will first send the `set` over all its other connections, and only after they have all responded with a local `ack` — and we didn't see a `fissure` message while waiting — will the peer send a local `ack` over the originating connection
``` js
{cmd: 'ack', seen: 'local', version: 'VERSION_ID', conn: 'CONN_ID'}
```

## message global `ack`
sent after an originating peer has received a local `ack` over all its connections, or after any peer receives a global `ack`, so that everyone may come to know that this version has been seen by everyone in this peer group.
``` js
{cmd: 'ack', seen: 'global', version: 'VERSION_ID', conn: 'CONN_ID'}
```

## message `welcome`
sent in response to a `get`, basically contains the initial state of the document; incoming `welcome` messages are also propagated over all our other connections (but only with information that was new to us, so that the propagation will eventually stop). when sent in response to a `get` (rather than being propogated), we include a `peer` entry with the id of the sending peer, so they know who we are, and to trigger them to send us their own `welcome` message
``` js
{
    cmd: 'welcome',
    versions: [each version looks like a set message...],
    fissures: [each fissure looks as it would in a fissure message...],
    parents: {'PARENT_VERSION_ID': true,
        ...versions you must have before consuming these new versions},
    [ peer: 'SENDER_ID', ] // if sent in response to a get
    conn: 'CONN_ID'
}
```

# antimatter_instance.get(conn) or connect(conn)
register a new connection with id `conn` — triggers this antimatter object to send a `get` message over the given connection

``` js
alice_antimatter_instance.get('connection_to_bob')
```

# antimatter_instance.forget(conn)
disconnect the given connection without creating a fissure — we don't need to reconnect with them.. it seems.. if we do, then we need to call `disconnect` instead, which will create a fissure allowing us to reconnect

``` js
alice_antimatter_instance.forget('connection_to_bob')
```

# antimatter_instance.disconnect(conn)
if we detect that a connection has closed, let the antimatter object know by calling this method with the given connection id — this will create a fissure so we can reconnect with whoever was on the other end of the connection later on

``` js
alice_antimatter_instance.disconnect('connection_to_bob')
```

# antimatter_instance.set(...patches)
modify this antimatter object by applying the given patches. each patch looks like `{range: '.life.meaning', content: 42}`. calling this method will trigger calling the `send` callback to let our peers know about this change.

``` js
antimatter_instance.set({range: '.life.meaning', content: 42})
```

---

# json.create([init])
create a new `json` crdt object (or start with `init`, and add stuff to that).

``` js
var json_instance = json.create()
```

# json_instance.read()
returns an instance of the `json` object represented by this json data-structure

``` js
console.log(json_instance.read())
```

# json_instance.generate_braid(versions)
returns an array of `set` messages that each look like this: `{version, parents, patches, sort_keys}`, such that if we pass all these messages to `antimatter.receive()`, we'll reconstruct the data in this `json` datastructure, assuming the recipient already has the given `versions` (which is represented as an object where each key is a version, and each value is `true`).

``` js
json_instance.generate_braid({alice2: true, bob3: true})
```

# json_instance.apply_bubbles(to_bubble)
this method helps prune away meta data and compress stuff when we have determined that certain versions can be renamed to other versions — these renamings are expressed in `to_bubble`, where keys are versions and values are "bubbles", each bubble represented with an array of two elements, the first element is the "bottom" of the bubble, and the second element is the "top" of the bubble; "bottom" and "top" make sense when viewing versions in a directed graph with the oldest version(s) at the top, and each version pointing up to it's parents. a bubble is then a set of versions where the only arrows leaving the bubble upward are from the "top" version, and the only arrows leaving the bubble downward are from the "bottom" version. this method effectively combines all the versions in a bubble into a single version, and may allow the data structure to be compressed, since now we don't need to distinguish between certain versions that we used to need to.

``` js
json_instance.apply_bubbles({alice4: ['bob5', 'alice4'], bob5: ['bob5', 'alice4']})
```

# json_instance.add_version(version, parents, patches[, sort_keys])
the main method for modifying a `json` data structure.
* `version`: unique string associated with this edit.
* `parents`: a set of versions that this version is aware of, represented as a map with versions as keys, and values of `true`.
* `patches`: an array of patches, where each patch is an object like this `{range: '.life.meaning', content: 42}`
* `sort_keys`: (optional) an object where each key is an index, and the value is a sort_key to use with the patch at the given index in the `patches` array — a sort_key overrides the version for a patch for the purposes of sorting.. this can be useful after doing some pruning.

``` js
json_instance.add_version('alice6',
    {alice5: true, bob7: true},
    [{range: '.a.b', content: 'c'}])
```

# json_instance.ancestors(versions, ignore_nonexistent=false)
gather `versions` and all their ancestors into a set. `versions` is a set of versions, i.e. a map with version-keys and values of true — we'll basically return a larger set. if `ignore_nonexistent` is `true`, then we won't throw an exception if we encounter a version that we don't have in our datastructure.

``` js
json_instance.ancestors({alice12: true, bob10: true})
```

# json_instance.get_leaves(versions)
returns a set of versions from `versions` which don't also have a child in `versions`. `versions` is itself a set of versions, represented as an object with version keys and `true` values, and the return value is represented the same way.

# json_instance.parse_patch(patch)
takes a patch in the form `{range, content}`, and returns an object of the form `{path: [...], [slice: [...]], [delete: true], content}`; basically calling `parse_json_path` on `patch.range`, and adding `patch.content` along for the ride.

# json_instance.parse_json_path(json_path)
parses the string `json_path` into an object like: `{path: [...], [slice: [...]], [delete: true]}`.
* `a.b[3]` --> `{path: ['a', 'b', 3]}`
* `a.b[3:5]` --> `{path: ['a', 'b'], slice: [3, 5]}`
* `delete a.b` --> `{path: ['a', 'b'], delete: true}`

``` js
console.log(json_instance.parse_json_path('a.b.c'))
```

---

# sequence.create_node(version, elems, [end_cap, sort_key])
creates a node for a `sequence` sequence CRDT with the given properties. the resulting node will look like this:

``` js
{
    version, // globally unique string
    elems, // a string or array representing actual data elements of the underlying sequence
    end_cap, // this is useful for dealing with replace operations
    sort_key, // version to pretend this is for the purposes of sorting
    deleted_by : {}, // if this node gets deleted, we'll mark it here
    nexts : [], // array of nodes following this one
    next : null // final node following this one (after all the nexts)
}

var sequence_node = sequence.create_node('alice1', 'hello')
```

# sequence.generate_braid(root_node, version, is_anc)
reconstructs an array of splice-information which can be passed to `sequence.add_version` in order to add `version` to another `sequence` instance — the returned array looks like: `[[insert_pos, delete_count, insert_elems, sort_key], ...]`. `is_anc` is a function which accepts a version string and returns `true` if and only if the given version is an ancestor of `version` (i.e. a version which the author of `version` knew about when they created that version).

``` js
var root_node = sequence.create_node('alice1', 'hello')
console.log(sequence.generate_braid(root_node, 'alice1', x => false)) // outputs [0, 0, "hello"]
```

# sequence.apply_bubbles(root_node, to_bubble)
this method helps prune away meta data and compress stuff when we have determined that certain versions can be renamed to other versions — these renamings are expressed in `to_bubble`, where keys are versions and values are "bubbles", each bubble represented with an array of two elements, the first element is the "bottom" of the bubble, and the second element is the "top" of the bubble. we will rename the given version to the "bottom" of the bubble. "bottom" and "top" make sense when viewing versions in a directed graph with the oldest version(s) at the top, and each version pointing up to it's parents. a bubble is then a set of versions where the only arrows leaving the bubble upward are from the "top" version, and the only arrows leaving the bubble downward are from the "bottom" version. this method effectively combines all the versions in a bubble into a single version, and may allow the data structure to be compressed, since now we don't need to distinguish between certain versions that we used to need to.

``` js
sequence.apply_bubbles(root_node, {alice4: ['bob5', 'alice4'], bob5: ['bob5', 'alice4']})
```

# sequence.get(root_node, i, is_anc)
returns the element at the `i`th position (0-based) in the `sequence` rooted at `root_node`, when only considering versions which result in `true` when passed to `is_anc`.

``` js
var x = sequence.get(root_node, 2, {alice1: true})
```

# sequence.set(root_node, i, v, is_anc)
sets the element at the `i`th position (0-based) in the `sequence` rooted at `root_node` to the value `v`, when only considering versions which result in `true` when passed to `is_anc`.

``` js
sequence.set(root_node, 2, 'x', {alice1: true})
```

# sequence.length(root_node, is_anc)
returns the length of the `sequence` rooted at `root_node`, when only considering versions which result in `true` when passed to `is_anc`.

``` js
console.log(sequence.length(root_node, {alice1: true}))
```

# sequence.break_node(node, break_position, end_cap, new_next)
this methods breaks apart a `sequence` node into two nodes, each representing a subsequence of the sequence represented by the original node; the `node` parameter is modified into the first node, and the second node is returned. the first node represents the elements of the sequence before `break_position`, and the second node represents the rest of the elements. if `end_cap` is truthy, then the first node will have `end_cap` set — this is generally done if the elements in the second node are being replaced. this method will add `new_next` to the first node's `nexts` array.

``` js
var node = sequence.create_node('alice1', 'hello')
// node node.elems == 'hello'

var second = sequence.break_node(node, 2)
// now node.elems   == 'he',
// and second.elems == 'llo'
```

# sequence.add_version(root_node, version, splices, [is_anc])
this is the main method of `sequence`, used to modify the sequence. the modification must be given a unique `version` string, and the modification itself is represented as an array of `splices`, where each splice looks like this: `[position, num_elements_to_delete, elements_to_insert, optional_sort_key]`. note that all positions are relative to the original sequence, before any splices have been applied. positions are counted by only considering nodes with versions which result in `true` when passed to `is_anc` (and are not `deleted_by` any versions which return `true` when passed to `is_anc`).

``` js
var node = sequence.create_node('alice1', 'hello')
sequence.add_version(node, 'alice2', [[5, 0, ' world']], null, v => v == 'alice1')
```

# sequence.traverse(root_node, is_anc, callback, [view_deleted, tail_callback])
traverses the subset of nodes in the tree rooted at `root_node` whos versions return true when passed to `is_anc`. for each node, `callback` is called with these parameters: `node, offset, has_nexts, prev, version, deleted`, where `node` is the current node being traversed; `offset` says how many elements we have passed so far getting here; `has_nexts` is true if some of this node's `nexts` will be traversed according to `is_anc`; `prev` is a pointer to the node whos `next` points to this one, or `null` if this is the root node; `version` is the version of this node, or this node's `prev` if our version is `null`, or that node's `prev` if it is also `null`, etc; `deleted` is true if this node is deleted according to `is_anc` (usually we skip deleted nodes when traversing, but we'll include them if `view_deleted` is `true`). `tail_callback` is an optional callback that will get called with a single parameter `node` after all of that node's children `nexts` and `next` have been traversed.

``` js
sequence.traverse(node, () => true, node => process.stdout.write(node.elems))
```
