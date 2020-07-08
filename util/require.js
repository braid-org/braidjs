// These 8 lines let browsers import modules with require().
function require (thing) {
    thing = thing.split('/')
    thing = thing[thing.length-1].slice(0,-3)
    console.assert(require[thing], `require("${thing}") failed because <script src="${thing}"> is not working.`)
    return require[thing]
}
global = self
module = {exports: {}}
