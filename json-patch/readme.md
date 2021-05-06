# JSON Patch

This library patches JSON objects using the Braid range-patch format.

Using it:
```
var patch = require('@braid.org/json-patch')
var json = {a: "foo", b: [1,2,3]}
patch(json, '.b[3]', 99)

console.log(json)
// {a: "foo", b: [1, 99, 3]}
```