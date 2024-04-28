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

// Test case: Delete a field in an object
patch(json, ".a", undefined)
console.log(json)
assert.deepEqual(json, { b: [1, "an old thing", 99, 3] })

// Test case: Set a field in a nested object
json = { a: { c: "bar" }, b: [1, 2, 3] }
patch(json, ".a.c", "baz")
console.log(json)
assert.deepEqual(json, { a: { c: "baz" }, b: [1, 2, 3] })

// Test case: Splice an array with negative index
patch(json, ".b[-1:-0]", [4, 5])
console.log(json)
assert.deepEqual(json, { a: { c: "baz" }, b: [1, 2, 4, 5] })

// Test case: append stuff to the array
patch(json, ".b[-0:-0]", [9, 8])
console.log(json)
assert.deepEqual(json, { a: { c: "baz" }, b: [1, 2, 4, 5, 9, 8] })

// Test case: Set a value in a deeply nested object
json = { a: { c: { d: { e: "foo" } } }, b: [1, 2, 3] }
patch(json, ".a.c.d.e", "bar")
console.log(json)
assert.deepEqual(json, { a: { c: { d: { e: "bar" } } }, b: [1, 2, 3] })

console.log("All tests passed!")
