# antimatter: an algorithm that prunes CRDT/OT history

[Antimatter](https://braid.org/antimatter) is the world's first peer-to-peer synchronization algorithm that can prune its history in a network where peers disconnect, reconnect, and merge offline edits.  Antimatter supports arbitrary simultaneous edits, from arbitrary peers, under arbitrary network delays and partitions, and guarantees full CRDT/OT consistency, while pruning unnecessary history within each partitioned subnet, and across subnets once they reconnect.  In steady state, it prunes down to zero overhead.  This lets you put synchronizing data structures in more parts of your software, without worrying about memory overhead.

This package implements an antimatter peer composed of three objects:

```js
var {create_antimatter_crdt, create_json_crdt, sequence_crdt} = require('@braidjs/antimatter')
```

- *antimatter_crdt*: created using `create_antimatter_crdt`, this object is a json_crdt with antimatter algorithm methods added to it so that it can communicate with other peers to learn which history can be pruned, and tells the underlying json_crdt object to prune it.
- *json_crdt*: created using `create_json_crdt`, this object is a pruneable JSON CRDT — "JSON" meaning it represents an arbitrary JSON datstructure, and "CRDT" and "pruneable" having the same meaning as for sequence_crdt below. The json_crdt makes recursive use of sequence_crdt structures to represent arbitrary JSON (for instance, a map is represented with a sequence_crdt structure for each value, where the first element in the sequence is the value).
- *sequence_crdt*: methods to manipulate a pruneable sequence CRDT — "sequence" meaning it represents a javascript string or array, "CRDT" meaning this structure can be merged with other ones, and "pruneable" meaning that it supports an operation to remove meta-data when it is no longer needed (whereas CRDT's often keep track of this meta-data forever).

The Antimatter Algorithm was invented by Michael Toomim and Greg Little in the
[Braid Project](https://braid.org) of [Invisible College](https://invisible.college/).

[Click here to see more details, and the API side-by-side with the source code.](https://braid.org/antimatter)
