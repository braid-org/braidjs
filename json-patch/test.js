var assert = require('assert')

var patch = require('.')
var json = {a: "foo", b: [1,2,3]}

// Replace 2 with 99
patch(json, '.b[1]', 99)

console.log(json)
assert.deepEqual(json, {a: "foo", b: [1, 99, 3]})

// Insert a string
patch(json, '.b[1:1]', "a new thing")

console.log(json)
assert.deepEqual(json, {a: "foo", b: [1, "a new thing", 99, 3]})

// Splice that string
patch(json, '.b[1][1:5]', "n old")

console.log(json)
assert.deepEqual(json, {a: "foo", b: [1, "an old thing", 99, 3]})
