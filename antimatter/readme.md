# antimatter: a pruning JSON CRDT.

`var {antimatter, sync9, sync8} = require('@glittle/antimatter')`

antimatter is a peer-to-peer network algorithm that keeps track of what can be pruned in a sync9 data structure, in order for peers to still be able to reconnect with each other and merge their changes. antimatter is implemented as a subclass of sync9, so an antimatter object is a sync9 object with additional methods.

sync9 is a pruneable JSON CRDT -- JSON meaning it represents an arbitrary JSON datstructure, CRDT meaning this structure can be merged with other ones, and pruneable meaning that the meta-data necessary for this merging can also be removed when it is no longer needed (whereas CRDT's often keep track of this meta-data forever).

sync8 is a pruneable sequence CRDT -- sequence meaning it represents a javascript string or array, CRDT and pruneable having the same meaning as for sync9 above. sync9 makes recursive use of sync8 structures to represent arbitrary JSON (for instance, a map is represented with a sync8 structure for each value, where the first element in the sequence is the value).

[click here to see this README side-by-side with the source code.](https://dglittle.github.io/antimatter/doc.html)

# API

# antimatter.create(send[, init])
creates and returns a new antimatter object (or adds antimatter methods and properties to `init`)
* `send`: a callback function to be called whenever this antimatter wants to send a message to a peer antimatter. the function takes two parameters: `peer`, and `message`, where `peer` is a string id of the peer to send to, and `message` is a javascript object to send to them, where ultimately we want to call `receive` on the target peer, and pass it `message` as a parameter.
* `init`: (optional) an antimatter object to start with, which we'll add any properties to that it doesn't have, and we'll add all the antimatter methods to it. this option exists so you can serialize an antimatter instance as JSON, and then restore it later.

``` js
var antimatter_instance = antimatter.create((peer, msg) => {
    websockets[peer].send(JSON.stringify(msg))
}, JSON.parse(fs.readFileSync('./antimatter.backup')))
```

# antimatter_instance.receive(message)
let this antimatter object "receive" a message from another antimatter object, presumably from its `send` callback

``` js
websocket.on('message', data => {
    antimatter_instance.receive(JSON.parse(data))
});
```

you generally do not need to mess with a message object directly, but here are the various message objects you might see:

## message `get` or `get_back`
`get` is the first message sent to a newly connected peer, and it will respond with `get_back`
``` js
{cmd: 'get', peer: 'PEER_ID', conn: 'CONN_ID'}
```

## message `forget`
used to disconnect without creating a fissure
``` js
{cmd: 'forget', peer: 'PEER_ID', conn: 'CONN_ID'}
```

## message `forget_ack`
sent in response to `forget`
``` js
{cmd: 'forget_ack', peer: 'PEER_ID', conn: 'CONN_ID'}
```

## message `disconnect`
issued locally when we detect that a peer has disconnected, in which case we'll set `fissure` to `true`; or when we are forgetting a peer (causing a disconnection), in which case we'll set `fissure` to `false`.
``` js
{cmd: 'disconnect', peer: 'PEER_ID', fissure: true or false}
```

## message `fissure`
sent to alert peers about a fissure. the fissure object contains information about the two peers involved in the fissure, the specific connection id that broke, the versions that need to be protected, and the time of the fissure (in case we want to ignore it after some time).
``` js
{
    cmd: 'fissure',
    fissure: {
        a: 'PEER_A_ID',
        b: 'PEER_B_ID',
        conn: 'CONN_ID',
        versions: {'VERSION_ID': true, ...},
        time: Date.now()
    }
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
    ]
}
```

## message local `ack`
sent in response to `set`, but not right away; a peer will first send the `set` to all its other peers, and only after they have all responded with a local `ack` will the peer send a local `ack` to the originating peer
``` js
{cmd: 'ack', seen: 'local', version: 'VERSION_ID', peer: 'PEER_ID', conn: 'CONN_ID'}
```

## message global `ack`
sent after an originating peer has received a local `ack` from all its peers, or by any peer who receives it to all its peers, so that everyone may come to know that this version has been seen by everyone in this peer group.
``` js
{cmd: 'ack', seen: 'global', version: 'VERSION_ID', peer: 'PEER_ID', conn: 'CONN_ID'}
```

## message `welcome`
sent in response to a `get`, basically contains the initial state of the document; `welcome` messages are also propogated to our peers, with the inclusion of two extra fields: `unack_boundary` and `min_leaves` (these are meant to deal with the issue of a peer disconnecting during the connection process itself, in which case we'll want to include these "unack" versions in the resulting fissure)
``` js
{
    cmd: 'welcome',
    versions: [each version looks like a set message...],
    fissures: [each fissure looks like the fissure property in a fissure message...],
    parents: {'PARENT_VERSION_ID': true,
        ...versions you must have before consuming these new versions},

    unack_boundary: {'VERSION_ID': true,
        ...mark these and their ancestors as not-globally-acknowledged,
        even if they were marked as such...},
    min_leaves: {'VERSION_ID': true,
        ...protect these and their ancestors from the unack_boundary's unacknowledging...},

    peer: 'PEER_ID', conn: 'CONN_ID'
}
```

# antimatter_instance.get(peer) or connect(peer)
connect to the given peer -- triggers this antimatter object to send a `get` message to the given peer

``` js
alice_antimatter_instance.get('bob')
```

# antimatter_instance.forget(peer)
disconnect from the given peer without creating a fissure -- we don't need to reconnect with them.. it seems.. if we do, then we need to call disconnect instead, which will create a fissure allowing us to reconnect.

``` js
alice_antimatter_instance.forget('bob')
```

# antimatter_instance.disconnect(peer)
if we detect that a peer has disconnected, let the antimatter object know by calling this method with the given peer -- this will create a fissure so we can reconnect with this peer if they come back

``` js
alice_antimatter_instance.disconnect('bob')
```

# antimatter_instance.set(...patches)
modify this antimatter object by applying the given patches. each patch looks like `{range: '.life.meaning', content: 42}`. calling this method will trigger calling the `send` callback to let our peers know about this change.

``` js
antimatter_instance.set({range: '.life.meaning', content: 42})
```

---

# sync9.create([init])
create a new sync9 object (or start with `init`, and add stuff to that).

``` js
var sync9_instance = sync9.create()
```

# sync9_instance.read()
returns an instance of the json object represented by this sync9 data-structure

``` js
console.log(sync9_instance.read())
```

# sync9_instance.generate_braid(versions)
returns an array of `set` messages that each look like this: `{version, parents, patches, sort_keys}`, such that if we pass all these messages to an antimatter's `receive` method, we'll reconstruct the data in this sync9 datastructure, assuming the recipient already has the given `versions` (which is represented as an object where each key is a version, and each value is `true`).

``` js
sync9_instance.generate_braid({alice2: true, bob3: true})
```

# sync9_instance.apply_bubbles(to_bubble)
this method helps prune away meta data and compress stuff when we have determined that certain versions can be renamed to other versions -- these renamings are expressed in `to_bubble`, where keys are versions and values are "bubbles", each bubble represented with an array of two elements, the first element is the "bottom" of the bubble, and the second element is the "top" of the bubble; "bottom" and "top" make sense when viewing versions in a directed graph with the oldest version(s) at the top, and each version pointing up to it's parents. a bubble is then a set of versions where the only arrows leaving the bubble upward are from the "top" version, and the only arrows leaving the bubble downward are from the "bottom" version. this method effectively combines all the versions in a bubble into a single version, and may allow the data structure to be compressed, since now we don't need to distinguish between certain versions that we used to need to.

``` js
sync9_instance.apply_bubbles({alice4: ['bob5', 'alice4'], bob5: ['bob5', 'alice4']})
```

# sync9_instance.add_version(version, parents, patches[, sort_keys])
the main method for modifying a sync9 data structure.
* `version`: unique string associated with this edit.
* `parents`: a set of versions that this version is aware of, represented as a map with versions as keys, and values of `true`.
* `patches`: an array of patches, where each patch is an object like this `{range: '.life.meaning', content: 42}`
* `sort_keys`: (optional) an object where each key is an index, and the value is a sort_key to use with the patch at the given index in the `patches` array -- a sort_key overrides the version for a patch for the purposes of sorting.. this can be useful after doing some pruning.

``` js
sync9_instance.add_version('alice6',
    {alice5: true, bob7: true},
    [{range: '.a.b', content: 'c'}])
```

# sync9_instance.ancestors(versions, ignore_nonexistent=false)
gather `versions` and all their ancestors into a set. `versions` is a set of versions, i.e. a map with version-keys and values of true -- we'll basically return a larger set. if `ignore_nonexistent` is `true`, then we won't throw an exception if we encounter a version that we don't have in our datastructure.

``` js
sync9_instance.ancestors({alice12: true, bob10: true})
```

# sync9_instance.get_leaves(versions)
returns a set of versions from `versions` which don't also have a child in `versions`. `versions` is itself a set of versions, represented as an object with version keys and `true` values, and the return value is represented the same way.

# sync9_instance.parse_patch(patch)
takes a patch in the form `{range, content}`, and returns an object of the form `{path: [...], [slice: [...]], [delete: true], content}`; basically calling `parse_json_path` on `patch.range`, and adding `patch.content` along for the ride.

# sync9_instance.parse_json_path(json_path)
parses the string `json_path` into an object like: `{path: [...], [slice: [...]], [delete: true]}`.
* `a.b[3]` --> `{path: ['a', 'b', 3]}`
* `a.b[3:5]` --> `{path: ['a', 'b'], slice: [3, 5]}`
* `delete a.b` --> `{path: ['a', 'b'], delete: true}`

``` js
console.log(sync9_instance.parse_json_path('a.b.c'))
```

---

# sync8.create_node(version, elems, [end_cap, sort_key])
creates a node for a sync8 sequence CRDT with the given properties. the resulting node will look like this:

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

var sync8_node = sync8.create_node('alice1', 'hello')
```

# sync8.generate_braid(root_node, version, is_anc)
reconstructs an array of splice-information which can be passed to `sync8.add_version` in order to add `version` to another sync8 instance -- the returned array looks like: `[[insert_pos, delete_count, insert_elems, sort_key], ...]`. `is_anc` is a function which accepts a version string and returns `true` if and only if the given version is an ancestor of `version` (i.e. a version which the author of `version` knew about when they created that version).

``` js
var root_node = sync8.create_node('alice1', 'hello')
console.log(sync8.generate_braid(root_node, 'alice1', x => false)) // outputs [0, 0, "hello"]
```

# sync8.apply_bubbles(root_node, to_bubble)
this method helps prune away meta data and compress stuff when we have determined that certain versions can be renamed to other versions -- these renamings are expressed in `to_bubble`, where keys are versions and values are "bubbles", each bubble represented with an array of two elements, the first element is the "bottom" of the bubble, and the second element is the "top" of the bubble. we will rename the given version to the "bottom" of the bubble. "bottom" and "top" make sense when viewing versions in a directed graph with the oldest version(s) at the top, and each version pointing up to it's parents. a bubble is then a set of versions where the only arrows leaving the bubble upward are from the "top" version, and the only arrows leaving the bubble downward are from the "bottom" version. this method effectively combines all the versions in a bubble into a single version, and may allow the data structure to be compressed, since now we don't need to distinguish between certain versions that we used to need to.

``` js
sync8.apply_bubbles(root_node, {alice4: ['bob5', 'alice4'], bob5: ['bob5', 'alice4']})
```

# sync8.get(root_node, i, is_anc)
returns the element at the `i`th position (0-based) in the sequence rooted at `root_node`, when only considering versions which result in `true` when passed to `is_anc`.

``` js
var x = sync8.get(root_node, 2, {alice1: true})
```

# sync8.set(root_node, i, v, is_anc)
sets the element at the `i`th position (0-based) in the sequence rooted at `root_node` to the value `v`, when only considering versions which result in `true` when passed to `is_anc`.

``` js
sync8.set(root_node, 2, 'x', {alice1: true})
```

# sync8.length(root_node, is_anc)
returns the length of the sequence rooted at `root_node`, when only considering versions which result in `true` when passed to `is_anc`.

``` js
console.log(sync8.length(root_node, {alice1: true}))
```

# sync8.break_node(node, break_position, end_cap, new_next)
this methods breaks apart a sync8 node into two nodes, each representing a subsequence of the sequence represented by the original node; the `node` parameter is modified into the first node, and the second node is returned. the first node represents the elements of the sequence before `break_position`, and the second node represents the rest of the elements. if `end_cap` is truthy, then the first node will have `end_cap` set -- this is generally done if the elements in the second node are being replaced. this method will add `new_next` to the first node's `nexts` array.

``` js
var node = sync8.create_node('alice1', 'hello')
// node node.elems == 'hello'

var second = sync8.break_node(node, 2)
// now node.elems   == 'he',
// and second.elems == 'llo'
```

# sync8.add_version(root_node, version, splices, [is_anc])
this is the main method of sync8, used to modify the sequence. the modification must be given a unique `version` string, and the modification itself is represented as an array of `splices`, where each splice looks like this: `[position, num_elements_to_delete, elements_to_insert, optional_sort_key]`. note that all positions are relative to the original sequence, before any splices have been applied. positions are counted by only considering nodes with versions which result in `true` when passed to `is_anc` (and are not `deleted_by` any versions which return `true` when passed to `is_anc`).

``` js
var node = sync8.create_node('alice1', 'hello')
sync8.add_version(node, 'alice2', [[5, 0, ' world']], null, v => v == 'alice1')
```

# sync8.traverse(root_node, is_anc, callback, [view_deleted, tail_callback])
traverses the subset of nodes in the tree rooted at `root_node` whos versions return true when passed to `is_anc`. for each node, `callback` is called with these parameters: `node, offset, has_nexts, prev, version, deleted`, where `node` is the current node being traversed; `offset` says how many elements we have passed so far getting here; `has_nexts` is true if some of this node's `nexts` will be traversed according to `is_anc`; `prev` is a pointer to the node whos `next` points to this one, or `null` if this is the root node; `version` is the version of this node, or this node's `prev` if our version is `null`, or that node's `prev` if it is also `null`, etc; `deleted` is true if this node is deleted according to `is_anc` (usually we skip deleted nodes when traversing, but we'll include them if `view_deleted` is `true`). `tail_callback` is an optional callback that will get called with a single parameter `node` after all of that node's children `nexts` and `next` have been traversed.

``` js
sync8.traverse(node, () => true, node => process.stdout.write(node.elems))
```
