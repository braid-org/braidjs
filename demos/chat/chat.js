// Create a node
const msgKey = "/chat";
const usrKey = "/usr";
const browserId = localStorage.browserId || 'B-'+randomString();
const escapedId = JSON.stringify(browserId);
localStorage.browserId = browserId;

const node = require('braid.js')({pid: 'C-'+randomString()});
node.fissure_lifetime = 1000 * 60 * 60 * 8 // Fissures can only last 8 hours...

node.default(`${msgKey}/*`, path => []);
node.default(msgKey, []);
node.default(usrKey, {});

show_debug = true;
g_show_protocol_errors = true;
const params = new URLSearchParams(window.location.search);
const protocol = params.get("protocol") === 'http' ? 'http' : 'ws';
const is_secure = window.location.protocol === 'https:';
const braid_url = `${protocol}${is_secure ? 's' : ''}://${window.location.host}/`
var socket = require(protocol == 'http' ? 'http1-client.js' : 'websocket-client.js')({node, url: braid_url});

// UI Code
let createListeners = function () {

    // Local copy of variables
    let users = {};
    let messages = [];
    // How many milliseconds each keypress flags us as typing for
    const typingTimeout = 30000;
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
        // Display typing indicators
    }
    node.get(usrKey, usrKey_cb);

    window.addEventListener('beforeunload', function () {
        node.forget(msgKey, update_messages)
        node.forget(usrKey, usrKey_cb)
    })
    
    //// ----- Messagebox rendering and interactability -----
    const messageBox = document.getElementById("react-messages");
    function render_username(userId) {
        return (userId && users[userId]) ? users[userId].displayname : "Anonymous";
    }
    // Message formatting
    function format_section(section, index) {
        if (typeof(section) == "string" || !section.type)
            return React.createElement("span", {className: "msg-plain-text", key: index}, section);
        if (section.type == "usr")
            return React.createElement("span", {className: "msg-user-ref", key: index}, `@${render_username(section.user)}`);
        return React.createElement("span", {className: "msg-plain-text", key: index}, section);
    }
    function format_header(msg) {
        let now = new Date();
        let msgDate = new Date(msg.time);
        let timestamp = now.getDate() == msgDate.getDate() ?
            msgDate.toLocaleTimeString() : msgDate.toLocaleDateString();

        let username = render_username(msg.user);
        return [React.createElement("span", {className: "user-id", key:"username"}, username),
                React.createElement("span", {className: "timestamp", key: "time"}, timestamp)];
    }
    function format_message(msg, i, msgs) {
        let collapse = i && (msgs[i-1].user == msg.user) && (msg.time - msgs[i-1].time < 1200000);
        // Parse the message
        
        let renderedMessage = msg.body.map(format_section);
        if (collapse) {
            return React.createElement('div', {className:"msg msg-collapse", key: i},
                React.createElement("div", {className: "msg-body", key: "text"}, renderedMessage));
        } else {
            let renderedHeader = format_header(msg);
            return React.createElement('div', {className:"msg", key: i},
                [React.createElement("div", {className: "msg-header", key: "head"}, renderedHeader),
                 React.createElement("div", {className: "msg-body", key: "text"}, renderedMessage)]);
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
            should_scroll = box_bottom > furthest_scroll;
        }
        let MessageList = React.createElement('div', {className: "messageBox", key: "messages"}, newVal.map(format_message));
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
    // Enable sending of messages
    let sendbox = document.getElementById("send-box");
    function submit() {
        if (!sendbox.value.length)
            return;
        // Preprocess outgoing message
        let messageParts = sendbox.value.split(/(@\w+)/ig);
        // Now, the odd-numbered indices contain the split tokens
        for (let i = 1; i < messageParts.length; i+= 2) {
            let x = messageParts[i];
            let name = x.substring(1, x.length);
            let nameId = Object.keys(users).find(key => users[key] == name);
            if (nameId)
                messageParts[i] = {type: "usr", user: nameId};
        }
        let sendTime = new Date().getTime();
        let messageBody = JSON.stringify([{user: browserId, time: sendTime, body: messageParts}]);
        setTimeout(() => node.setPatch(msgKey, `[-0:-0] = ${messageBody}`));
        sendbox.value = "";
        // Remove typing indicator
        setTyping(false);
    }
    let typingTimeoutId;
    function setTyping(typing) {
        if (!users.hasOwnProperty(browserId))
            return;
        clearTimeout(typingTimeoutId);
        let alreadyTyping = users[browserId].typing;
        // Don't want to spam 
        if (alreadyTyping != typing) {
            node.setPatch(usrKey, `[${escapedId}].typing = ${typing}`);
            users[browserId].typing = typing;
        }
        if (typing)
            typingTimeoutId = setTimeout(() => node.setPatch(usrKey, `[${escapedId}].typing = false`), typingTimeout);
    }

    document.getElementById("send-msg").addEventListener("click", submit);
    sendbox.addEventListener("keydown", e => {
        if (e.keyCode == 13 && !e.shiftKey) {e.preventDefault(); submit()}
    });
    sendbox.addEventListener("input", e => setTyping(sendbox.value.length > 0));

    //// ---- Settings bar ----
    // Clicking on the settings icon toggles it
    // Username Changing
    let nameBox = document.getElementById("username-change");

    nameBox.onchange = e => {
        e.preventDefault();
        let newName = nameBox.value.replace(/\W/g, '');
        // Change username
        nameBox.value = newName;
        setUsername(newName);
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