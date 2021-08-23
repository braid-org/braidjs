
var {antimatter} = require('./index.js')

var A = antimatter.create((peer, x) => {
    B.receive(x)
})

var B = antimatter.create((peer, x) => {
    A.receive(x)
})


A.set([{range: '', content: 55}])

console.log(JSON.stringify(A, null, '    '))



// sync8.create_node = (version, elems, end_cap, sort_key)
// var S = sync8.create_node('root', 'hi')
// console.log(JSON.stringify(S, null, '    '))

// // sync8.add_version = (S, version, splices, sort_key, is_anc)
// sync8.add_version(S, 'a', [[1, 0, 'AA'], [2, 0, 'BB']], null, x => x != 'a')
// // sync8.add_version(S, 'a', [[1, 0, 'AA'], [2, 0, 'BB']], null, x => true)

// console.log(JSON.stringify(S, null, '    '))

// console.log(`sync8.length = ` + sync8.length(S))
// console.log(`sync8.length = ` + sync8.length(S, x => x == 'a'))



// var S = sync8.create_node('root', 'hello world!')
// sync8.add_version(S, 'v2', [[6, 5, 'globe']], null, x => x != 'v2')
// var x = sync8.generate_braid(S, 'v2', x => x != 'v2')
// console.log(JSON.stringify(x))



// var S = sync8.create_node('root', 'hello world!')
// sync8.add_version(S, 'v2', [[6, 5, 'globe']], null, x => x != 'v2')
// console.log(JSON.stringify(S)) // {"version":"v2","sort_key":"root","elems":"hello globe!","deleted_by":{},"nexts":[],"next":null}
// sync8.apply_bubbles(S, {'root': ['v2']})
// console.log(JSON.stringify(S)) // {"version":"v2","sort_key":"root","elems":"hello globe!","deleted_by":{},"nexts":[],"next":null}






// var S = sync8.create_node('root', 'hello world!')
// sync8.add_version(S, 'v2', [[6, 5, 'globe']], null, x => x != 'v2')
// console.log(JSON.stringify(S)) // {"version":"v2","sort_key":"root","elems":"hello globe!","deleted_by":{},"nexts":[],"next":null}
// sync8.apply_bubbles(S, {'root': ['v2']})
// console.log(JSON.stringify(S)) // {"version":"v2","sort_key":"root","elems":"hello globe!","deleted_by":{},"nexts":[],"next":null}






// var S = sync8.create_node('root', 'hello world!')
// sync8.break_node(S, 2)
// console.log(JSON.stringify(S))



// sync8.generate_braid = (S, version, is_anc)
// var x = sync8.generate_braid(S, 'root', () => true)
// console.log(JSON.stringify(x, null, '    '))


