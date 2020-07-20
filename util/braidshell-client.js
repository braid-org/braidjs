var util = require('utilities.js');

module.exports = require["braidshell-client"] = function(swUrl) {
    if (!navigator.serviceWorker) {
        // We probably also want to hook up the braid here
        return require('braid.js')();
    }
    navigator.serviceWorker.register(swUrl).then(reg => reg.update());

    let get_handlers = {};
    let resources = {};
    navigator.serviceWorker.addEventListener('message', event => {
        // event.data === "{key:\"some-key\",value:\"some-value\"}"
        let msg = event.data;
        resources[msg.key] = msg.value;
        get_handlers[msg.key] && 
            get_handlers[msg.key].forEach(
                x => setTimeout(
                    _ => x(msg.value)
                )
            )
    });

    
    function send(message) {
        navigator.serviceWorker.ready.then(registration => {
            registration.active.postMessage(message);
        });
    }

    let braidShell = {};
    
    braidShell.get = (key, cb) => {
        if (!cb)
            throw "callback is required when using sw"
        cb.id = util.random_id();
        // Add callback
        if (get_handlers[key])
            get_handlers[key].push(cb);
        else {
            get_handlers[key] = [cb];
            send({method: "get", key: key})
        }
    };
    braidShell.set = (key, value) => {
        send({method: "set", key, patches: [`= ${JSON.stringify(value)}`]});
    };
    braidShell.setPatch = (key, patches) => {
        if (typeof patches === 'string')
            patches = [patches];
        send({method: "set", key, patches: patches});
    };
    braidShell.forget = (key, cb) => {
        let index = get_handlers[key].findIndex(e => e.id === cb.id);
        if (index == -1)
            return;
        get_handlers[key].splice(index, 1);
        if (get_handlers.length === 0)
            send({method: "forget", key});
    };
    braidShell.default = (key, val) => {
        //send({method: "default", key, value: val});
    }
    return braidShell;
};