// Create a node
const msgKey = "/chat";
const usrKey = "/usr";
const browserId = localStorage.browserId || 'B-'+randomString();
const escapedId = JSON.stringify(browserId);
const use_leadertab = false
const use_invisible_server = false
localStorage.browserId = browserId;

var node;
if (!use_leadertab)
    node = require('braid.js')()

print_network = true;
g_show_protocol_errors = true;
const params = new URLSearchParams(window.location.search);
const protocol = (params.get("protocol") === 'http' ? 'http' : 'ws') + (window.location.protocol === 'https:' ? 's' : '')
var braid_url = `${protocol}://${window.location.host}/`

console.log('protocol is ' + protocol)

if (use_invisible_server)
    braid_url = `${protocol}://invisible.college:3010/`
if (!use_leadertab)
    var socket = require(protocol == 'https' ? 'http1-client.js' : 'websocket-client.js')({node, url: braid_url});


// UI Code
let createListeners = function () {
    if (use_leadertab)
        node = require('leadertab-shell.js')(braid_url);
    node.fissure_lifetime = 1000 * 60 * 60 * .5 // Fissures expire after 30 minutes

    node.default(`${msgKey}/*`, path => []);
    node.default(msgKey, []);
    node.default(usrKey, {});

    // Local copy of variables
    let users = {};
    let messages = [];
    // How many milliseconds each keypress flags us as typing for
    const typingTimeout = 30000;
    // How often to send live typing updates.
    const liveTypeUpdateFreq = 50;
    // Subscribe for updates to a resource
    node.get(msgKey, update_messages);
    let usrKey_cb = newVal => {
        users = newVal;
        if (!users.hasOwnProperty(browserId)) {
            setUsername(generatedUsername);
            return;
        }
        nameBox.value = users[browserId].displayname;
        update_messages(messages);
    }
    node.get(usrKey, usrKey_cb);

    window.addEventListener('beforeunload', function () {
	    setNotTyping();
        node.forget(msgKey, update_messages);
        node.forget(usrKey, usrKey_cb);
        node.close();
    })
    
    //// ----- Messagebox rendering and interactability -----
    const messageBox = document.getElementById("react-messages");
    function render_username(userId) {
        return (userId && users[userId]) ? users[userId].displayname : "Anonymous";
    }

    function format_header(msg) {
        let timestamp = "Live";
        if (msg.time) {
            now = new Date();
            msgDate = new Date(msg.time);
            timestamp = now.getDate() == msgDate.getDate() ?
                msgDate.toLocaleTimeString() : msgDate.toLocaleDateString();
        }

        let username = render_username(msg.user);
        return [React.createElement("span", {className: "user-id", key:"username"}, username),
                React.createElement("span", {className: "timestamp", key: "time"}, timestamp)];
    }
    function format_message(msg, i, msgs, extra_classes) {
        let collapse = i && (msgs[i-1].user == msg.user) && (msg.time - msgs[i-1].time < 1200000);
        // Parse the message
        let body = React.createElement("div", {className: "msg-body", key: "text"}, msg.body);
        let classList = (extra_classes || []).concat(collapse ? ["msg"] : ["msg", "msg-collapse"]).join(' ');
        if (collapse) {
            return React.createElement('div', {className: classList, key: i}, body);
        } else {
            let renderedHeader = format_header(msg);
            return React.createElement('div', {className: classList, key: i},
                [React.createElement("div", {className: "msg-header", key: "head"}, renderedHeader),
                 body]);
        }
    }
    const typingTextElement = document.getElementById("typing-text");
    const typingBox = document.getElementById("typing");
    function draw_typing_indicator(names) {
        const n = names.length;
        typingBox.classList.toggle("hidden", n == 0);
        let typing_names;
        switch (n) {
            case 0:
                return;
            case 1:
                typing_names = names[0];
                break;
            case 2: 
                typing_names = `${names[0]} and ${names[1]}`;
                break;
            case 3:
            case 4:
            case 5:
                names[n-1] = 'and ' + names[n-1];
                typing_names = names.join(", ");
                break;
            default:
                typing_names = "Several people"
        }
        typingTextElement.textContent = `${typing_names} ${(n > 1) ? "are" : "is"} typing...`;
    }
    function update_messages(newVal) {
        // Check scrolling 
        let shouldScroll = true;
        let n_messages = messages.length;
        if (n_messages) {
            let furthest_scroll = document.getElementsByClassName("msg")[n_messages - 1].getBoundingClientRect().top;
            let box_bottom = messageBox.getBoundingClientRect().bottom;
            // If the last message is off the screen, we shouldn't scroll
            shouldScroll = box_bottom > furthest_scroll;
        }
        let message_elements = newVal.map(format_message);

        const live_classes = ["live"]
        Object.entries(users).forEach(user => {
            if (user[1].typing && user[0] != browserId) {
                let msg = {user: user[0], body: user[1].typing};
                message_elements.push(format_message(msg, null, null, live_classes));
            }
        })

        let MessageList = React.createElement('div', {className: "messageBox", key: "messages"}, message_elements);
        ReactDOM.render(
            MessageList,
            messageBox,
            () => {
                if (shouldScroll)
                    messageBox.scrollTop = messageBox.scrollHeight - messageBox.clientHeight;
            }
        );
        messages = newVal;

        // Update the typing indicator
        let whos_typing = Object.entries(users)
            .filter(user => user[1].typing && user[0] != browserId)
            .map(user => user[1].displayname);
        draw_typing_indicator(whos_typing);
    }
    //// ---- Input field handlers ----
    function resetText(){
        let gridContainer = document.getElementById("grid-container");
        let headerSize = 40
        if(screen.width < 800){
            headerSize = '100';
        }
        gridContainer.style.gridTemplateRows = `${headerSize}px auto 85px 1.5em`

        var message_view = document.getElementById("react-messages");
        message_view.scrollTop = message_view.scrollHeight;
    }
    // Enable sending of messages
    let sendbox = document.getElementById("send-box");
    function submit() {
        if (!sendbox.value.length)
            return;
        // Preprocess outgoing message
        let sendTime = new Date().getTime();
        let messageBody = JSON.stringify([{user: browserId, time: sendTime, body: sendbox.value}]);
        setTimeout(() => node.setPatch(msgKey, `[-0:-0] = ${messageBody}`));
        resetText();
        sendbox.value = "";
        // Remove typing indicator
        setNotTyping();
    }
    
    let typingTimeoutId;
    let typing = false;
    setInterval(updateTyping, liveTypeUpdateFreq);
    function setTyping(text) {
        // Refresh the AFK timeout
        typing = true;
        clearTimeout(typingTimeoutId);
        typingTimeoutId = setTimeout(setNotTyping, typingTimeout);
    };
    function setNotTyping() {
        if (!users.hasOwnProperty(browserId))
            return;
        if (users[browserId].typing)
            node.setPatch(usrKey, `[${escapedId}].typing = false`);
        users[browserId].typing = false;
        typing = false;
    };
    function updateTyping() {
        if (!users.hasOwnProperty(browserId))
            return;
        let lastCheck = users[browserId].typing;
        let check = sendbox.value;
        // If the user has changed the textbox since last tick, and the local UI typing hasn't timed out
        if (typing && lastCheck != check) {
            node.setPatch(usrKey, `[${escapedId}].typing = ${JSON.stringify(check)}`);
            users[browserId].typing = check;
        }
    };

    document.getElementById("send-msg").addEventListener("click", submit);
    sendbox.addEventListener("keydown", e => {
        if (e.keyCode == 13 && !e.shiftKey) {
            e.preventDefault();
            submit();
        }
    });
    sendbox.addEventListener("input", e => {
        if (sendbox.value.length > 0)
            setTyping();
        else
            setNotTyping();
    });

    // Username Changing
    let nameBox = document.getElementById("username-change");

    nameBox.onchange = e => {
        e.preventDefault();
        let newName = nameBox.value.replace(/\W/g, '');
        // Change username
        nameBox.value = newName;
        setUsername(newName);

        let expoToken = document.getElementById("expo-token");
        if(expoToken.value !== ""){
            console.log("Mobile device found with expoToken:" + expoToken.value)
        }else{
            console.log("Not using app")
        }

    };
    // Username generation stuff
    const names = ["Bob", "Alice", "Joe", "Fred", "Mary", "Linda", "Mike", "Greg", "Raf"];
    let name = names[Math.floor(Math.random() * names.length)];
    let number = Math.floor(Math.random() * 1000);
    const generatedUsername = `${name}${number}`;

    function setUsername(name) {
        let escapedName = JSON.stringify(name);
        const patch = users.hasOwnProperty(browserId) 
            ? `[${escapedId}].displayname = ${escapedName}`
            : `[${escapedId}] = {"displayname": ${escapedName}}`;
            
        setTimeout(() => node.setPatch(usrKey, patch), 1);
    }
}

if (document.readyState === "complete" ||
   (document.readyState !== "loading" && !document.documentElement.doScroll) ) {
    createListeners();
} else {
    document.addEventListener("DOMContentLoaded", createListeners);
}

function randomString () { return Math.random().toString(36).slice(2) }
