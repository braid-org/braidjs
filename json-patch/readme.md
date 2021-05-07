# JSON Patch

This library patches JSON objects using the Braid range-patch format.

Using it:
```javascript
var patch = require('@braid.org/json-patch')
var json = {a: "foo", b: [1,2,3]}

// Replace the 2 with "a new string"
patch(json, '.b[3]', "a new string")

console.log(json)   // {a: "foo", b: [1, "a new string", 3]}

// Edit that string
patch(json, '.b[3][1:5]', 'n old')

console.log(json)   // {a: "foo", b: [1, "an old string", 3]}
```

This library mutates your JSON objects in-place.  If you want a copy, then
clone your object first.
