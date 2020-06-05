// Create a node
const msgKey = "/chat";
const usrKey = "/usr";
const braidId = `C-${randomString(10)}`;
const node = require('node.js')({braidId});

node.default(`${msgKey}/*`, path => []);
node.default(msgKey, []);
node.default(usrKey, {});

show_debug = true;

require('websocket-client.js')({node, url: 'ws://invisible.college:3009/'});

// UI Code
let createListeners = function () {
	// Subscribe for updates to a resource
	node.get(msgKey, update_messages);
	node.get(usrKey, newVal => {
		users = newVal;
		if (!users[browserId])
			setUsername(generatedUsername);
		update_messages(messages);
	});

	//// ----- Messagebox rendering and interactability -----
	// Re-render the messagebox when the remote resource changes
	let nMessages = 0;
	let users = {};
	let messages = [];
	const messageBox = document.getElementById("react-messages");
	// Format messages
	let format_message = function(msg, i) {
		let text = msg.text;
		let user = msg.user;
		return React.createElement('div', {className:"msg", key: i},
			[React.createElement("span", {className: "user-id", key: "user"}, (user && users[user]) ? users[user] : "Anonymous"),
			 React.createElement("span", {className: "msg-text", key: "text"}, text)]);
	}
	function update_messages(newVal) {
		// Check scrolling 
		let shouldScroll = true;
		if (nMessages) {
			let furthest_scroll = document.getElementsByClassName("msg")[nMessages - 1].getBoundingClientRect().top;
			let box_bottom = messageBox.getBoundingClientRect().bottom;
			// If the last message is off the screen, we shouldn't scroll
			shouldScroll = box_bottom > furthest_scroll;
		}

		let MessageList = React.createElement('div', {className: "messageBox"}, newVal.map(format_message));
		ReactDOM.render(
			MessageList,
			messageBox,
			() => {
				if (shouldScroll)
					messageBox.scrollTop = messageBox.scrollHeight - messageBox.clientHeight;
			}
		);
		
		messages = newVal;
		nMessages = newVal.length;

	}
	//// ---- Input field handlers ----
	// Enable sending of messages
	let sendbox = document.getElementById("send-box");
	function submit() {
		if (sendbox.value.length) {
			let text = JSON.stringify([{user: browserId, text: sendbox.value || ''}]);
			node.set(msgKey, null, `[${nMessages}:${nMessages}] = ${text}`);
			sendbox.value = "";
		}
	}

	document.getElementById("send-msg").addEventListener("click", submit);
	sendbox.onkeydown = e => {
        if (e.keyCode == 13 && !e.shiftKey) {e.preventDefault(); submit()}};

    //// ---- Settings bar ----
    // Clicking on the settings icon toggles it
    let settingsBar = document.getElementById("settings-hover-container");
    let settingsToggle = document.getElementById("settings-click-toggle");
   	settingsToggle.addEventListener("click", (e) => {
   		settingsBar.classList.toggle("settings-locked");
   		e.stopPropagation();
   	});
   	// Clicking within the bar locks it open
   	settingsBar.addEventListener("click", (e) => {
   		settingsBar.classList.add("settings-locked");
   		e.stopPropagation();
   	})
   	// Clicking anywhere else closes it
   	document.body.addEventListener("click", () => {settingsBar.classList.remove("settings-locked");});
   	// Username Changing
   	let nameBox = document.getElementById("username-change");
    document.getElementById("username-btn").onclick = (e) => {
    	// Reveal an input 
    	nameBox.classList.toggle("collapsed");
    	nameBox.value = users[browserId];
    };
    nameBox.onkeydown = e => {
    	if (e.keyCode == 13) {
    		e.preventDefault();

    		// Change username
    		setUsername(nameBox.value);

    		nameBox.classList.add("collapsed");
    		nameBox.blur();
    	}
    };
    // Username stuff
	const browserId = localStorage.browserId || `B-${randomString(10)}`;
	localStorage.browserId = browserId;

	const names = ["Bob", "Alice", "Joe", "Fred", "Mary", "Linda", "Mike", "Greg", "Raf"];
	let name = names[Math.floor(Math.random() * names.length)];
	let number = Math.floor(Math.random() * 1000);
	const generatedUsername = `${name}${number}`;

	function setUsername(name) {
		let escapedId = JSON.stringify(browserId);
		let escapedName = JSON.stringify(name);
		setTimeout(() => node.set(usrKey, null, `[${escapedId}] = ${escapedName}`), 1);
	}
}

if (document.readyState === "complete" ||
   (document.readyState !== "loading" && !document.documentElement.doScroll) ) {
	createListeners();
} else {
	document.addEventListener("DOMContentLoaded", createListeners);
}
function randomString(length) {
    let result = '';
    let chars = "qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890";
    for (var i = length; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];
    return result;
}