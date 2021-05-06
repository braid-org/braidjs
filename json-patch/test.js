var assert = require('assert')

var patch = require('.')
var json = {a: "foo", b: [1,2,3]}
patch(json, '.b[1]', 99)

assert.deepEqual(json, {a: "foo", b: [1, 99, 3]})
