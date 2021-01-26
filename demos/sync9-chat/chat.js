// Create a node
var browser_id = localStorage.browser_id || localStorage.browserId || 'B-' + Math.random().toString(36).slice(2)
var escaped_id = JSON.stringify(browser_id)
var use_leadertab = false
var use_invisible_server = true
localStorage.browser_id = browser_id

var node
if (!use_leadertab)
    node = require('braid.js')({
        pid: (localStorage.username &&
              localStorage.username + '-' + Math.random().toString(36).slice(2,6))
    })

print_network = true;
g_show_protocol_errors = true;
var params = new URLSearchParams(window.location.search);
var protocol = (params.get("protocol") === 'http' ? 'http' : 'ws') + (window.location.protocol === 'https:' ? 's' : '')
var braid_url = `${protocol}://${window.location.host}/`

console.log('protocol is ' + protocol)

if (use_invisible_server)
    braid_url = 'wss://invisible.college:3009/'
if (!use_leadertab)
    var socket = require(protocol == 'https' ? 'http-client-old.js' : 'websocket-client.js')({node, url: braid_url})


// UI Code
let create_listeners = function () {
    if (use_leadertab)
        node = require('leadertab-shell.js')(braid_url)
    node.fissure_lifetime = 1000 * 60 * 60 * 24 // Fissures expire after 24 hours

    node.default('/chat', [])
    node.default('/usr',  {})

    // Local copy of variables
    let users = {}
    let messages = []
    // How many milliseconds each keypress flags us as typing for
    var typing_timeout = 30000
    // How often to send live typing updates.
    var live_type_update_freq = 50

    // Subscribe for updates to a resource
    node.get('/chat', update_messages)
    node.get('/usr',  update_users)

    window.addEventListener('beforeunload', function () {
	    set_not_typing()
        node.forget('/chat', update_messages)
        node.forget('/usr',  update_users)
        node.close && node.close()
    })
    
    //// ----- Messagebox rendering and interactability -----
    var message_box = document.getElementById("react-messages")
    function render_username(user_id) {
        return (user_id && users[user_id]) ? users[user_id].displayname : "Anonymous"
    }

    function format_header (msg) {
        let timestamp = "Live"
        if (msg.time) {
            now = new Date()
            msg_date = new Date(msg.time)
            timestamp = now.getDate() === msg_date.getDate()
                ? msg_date.toLocaleTimeString()
                : msg_date.toLocaleDateString()
        }

        let username = render_username(msg.user)
        return [React.createElement("span", {className: "user-id", key:"username"}, username),
                React.createElement("span", {className: "timestamp", key: "time"}, timestamp)]
    }
    function format_message(msg, i, msgs, extra_classes) {
        let collapse = i && (msgs[i-1].user == msg.user) && (msg.time - msgs[i-1].time < 1200000)
        // Parse the message
        let body = React.createElement("div", {className: "msg-body", key: "text"}, msg.body)
        let class_list = (extra_classes || []).concat(collapse ? ["msg"] : ["msg", "msg-collapse"]).join(' ')
        if (collapse) {
            return React.createElement('div', {className: class_list, key: i}, body)
        } else {
            let rendered_header = format_header(msg)
            return React.createElement('div', {className: class_list, key: i},
                [React.createElement("div", {className: "msg-header", key: "head"}, rendered_header),
                 body])
        }
    }
    var typing_text_element = document.getElementById("typing-text")
    var typing_box = document.getElementById("typing")
    function draw_typing_indicator(names) {
        var n = names.length
        typing_box.classList.toggle("hidden", n == 0)
        let typing_names
        switch (n) {
            case 0:
                return
            case 1:
                typing_names = names[0]
                break
            case 2: 
                typing_names = `${names[0]} and ${names[1]}`
                break
            case 3:
            case 4:
            case 5:
                names[n-1] = 'and ' + names[n-1]
                typing_names = names.join(", ")
                break
            default:
                typing_names = "Several people"
        }
        typing_text_element.textContent = `${typing_names} ${(n > 1) ? "are" : "is"} typing...`
    }
    function update_users (new_users) {
        users = new_users
        if (!users.hasOwnProperty(browser_id)) {
            set_username(generate_username())
            return
        }
        name_box.value = users[browser_id].displayname
        update_messages(messages)
    }
    function update_messages(new_val) {
        // Check scrolling 
        let should_scroll = true
        let n_messages = messages.length
        if (n_messages) {
            let furthest_scroll = document.getElementsByClassName("msg")[n_messages - 1].getBoundingClientRect().top
            let box_bottom = message_box.getBoundingClientRect().bottom
            // If the last message is off the screen, we shouldn't scroll
            should_scroll = box_bottom > furthest_scroll
        }
        let message_elements = new_val.map(format_message)

        var live_classes = ["live"]
        Object.entries(users).forEach(user => {
            if (user[1].typing && user[0] != browser_id) {
                let msg = {user: user[0], body: user[1].typing}
                message_elements.push(format_message(msg, null, null, live_classes))
            }
        })

        let message_list = React.createElement('div', {className: "messageBox", key: "messages"}, message_elements)
        ReactDOM.render(
            message_list,
            message_box,
            () => {
                if (should_scroll)
                    message_box.scrollTop = message_box.scrollHeight - message_box.clientHeight
            }
        )
        messages = new_val

        // Update the typing indicator
        let whos_typing = Object.entries(users)
            .filter(user => user[1].typing && user[0] != browser_id)
            .map(user => user[1].displayname)
        draw_typing_indicator(whos_typing)
    }
    //// ---- Input field handlers ----
    function reset_text(){
        let grid_container = document.getElementById("grid-container")
        let header_size = 40
        if (screen.width < 800)
            header_size = '100'

        grid_container.style.gridTemplateRows = `${header_size}px auto 85px 1.5em`

        var message_view = document.getElementById("react-messages")
        message_view.scrollTop = message_view.scrollHeight
    }
    // Enable sending of messages
    let sendbox = document.getElementById("send-box")
    function submit() {
        if (!sendbox.value.length)
            return
        // Preprocess outgoing message
        let send_time = new Date().getTime()
        let message_body = JSON.stringify([{
            user: browser_id,
            time: send_time,
            body: sendbox.value
        }])
        node.setPatch('/chat', `[-0:-0] = ${message_body}`)
        reset_text()
        sendbox.value = ""
        // Remove typing indicator
        set_not_typing()
    }
    
    let typing_timeout_id
    let typing = false
    setInterval(update_typing, live_type_update_freq)
    function set_typing(text) {
        // Refresh the AFK timeout
        typing = true
        clearTimeout(typing_timeout_id)
        typing_timeout_id = setTimeout(set_not_typing, typing_timeout)
    }
    function set_not_typing () {
        if (!users.hasOwnProperty(browser_id))
            return
        if (users[browser_id].typing)
            node.setPatch('/usr', `[${escaped_id}].typing = false`)
        users[browser_id].typing = false
        typing = false
    }
    function update_typing() {
        if (!users.hasOwnProperty(browser_id))
            return
        let last_check = users[browser_id].typing
        let check = sendbox.value
        // If the user has changed the textbox since last tick, and the local
        // UI typing hasn't timed out
        if (typing && last_check != check) {
            node.setPatch('/usr', `[${escaped_id}].typing = ${JSON.stringify(check)}`)
            users[browser_id].typing = check
        }
    }

    document.getElementById("send-msg").addEventListener("click", submit)
    sendbox.addEventListener("keydown", e => {
        if (e.keyCode == 13 && !e.shiftKey) {
            e.preventDefault()
            submit()
        }
    })
    sendbox.addEventListener("input", e => {
        if (sendbox.value.length > 0)
            set_typing()
        else
            set_not_typing()
    })

    // Username Changing
    let name_box = document.getElementById("username-change")

    name_box.onchange = e => {
        e.preventDefault()
        let new_name = name_box.value.replace(/\W/g, '')
        // Change username
        name_box.value = new_name
        set_username(new_name)

        let expo_token = document.getElementById("expo-token")
        if (expo_token.value !== "")
            console.log("Mobile device found with expoToken:" + expo_token.value)
        else
            console.log("Not using app")
    }

    function generate_username () {
        // Username generation stuff
        var names = ["Bob", "Alice", "Joe", "Fred", "Mary", "Linda", "Mike", "Greg", "Raf"]
        let name = names[Math.floor(Math.random() * names.length)]
        let number = Math.floor(Math.random() * 1000)
        return `${name}${number}`
    }
    function set_username (name) {
        localStorage.username = name
        let escaped_name = JSON.stringify(name)
        var patch = users.hasOwnProperty(browser_id) 
            ? `[${escaped_id}].displayname = ${escaped_name}`
            : `[${escaped_id}] = {"displayname": ${escaped_name}}`
            
        node.setPatch('/usr', patch)
    }
}

if (document.readyState === "complete" ||
    (document.readyState !== "loading" && !document.documentElement.doScroll))
    create_listeners()
else
    document.addEventListener("DOMContentLoaded", create_listeners)

// Update statistics ever N seconds
function update_stats () {
    var resource = node.resource_at('/usr')
    var versions = node.versions('/usr')

    // Compute how many versions are fully acknowledged
    var acked = 0
    versions.forEach(v => { if (!resource.acks_in_process[v]) acked++ })

    // And count the fissures
    var fissures           = node.fissures('/usr')
    var unmatched_fissures = node.unmatched_fissures('/usr')

    // Count how many obsolete versions are fizzed
    var fizzed_vers = new Set([])
    fissures.forEach(f => (f.versions || []).forEach(v => fizzed_vers.add(v)))
    var obsoletes = 0
    for (v of fizzed_vers)
        if (!resource.time_dag[v])
            obsoletes++

    document.getElementById('stats').innerHTML =
        `Acked Versions: ${acked}/${versions.length}<br>`
        + `Unmatched Fissures: ${unmatched_fissures.length}/${fissures.length}`
        + (obsoletes ? `<br>Obsolete Fizzed Versions: ${obsoletes}` : '')
}
node.ons.push(() => setTimeout(update_stats))  // In a settimeout so it runs
update_stats()                                 // after, not before processing
                                               // the message
