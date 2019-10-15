// Example implementation of a `peer` object in Javascript.
// 
// This peer implements the abstract braid protocol.  It demonstrates:
// 
//  - Subscriptions to state between other peers
//  - Acknowledgments for both `seen` and `valid`
//  - Connections and disconnects
//  - Pruning old history under its merge type
