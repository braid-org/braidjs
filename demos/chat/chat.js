// Create a node
const key = "/chat";

const id = `C-${Math.random().toString(36).substring(0, 10)}`;
// Pick Username
let username = localStorage.username;
if (!username) {
	// Pick a random username
	const names = ["Bob", "Alice", "Joe", "Fred", "Mary", "Linda", "Mike", "Greg", "Raf"];
	let name = names[Math.floor(Math.random() * names.length)];
	let number = Math.floor(Math.random() * 100000);
	username = `${name}${number}`;
	localStorage.username = username;
}

const node = require('node.js')({id});

node.default(`${key}/*`, path => [`Top post for ${path}`]);
node.default(key, ['Top post!']);

require('websocket-client.js')({node, url: 'wss://invisible.college:3007/'});

// UI Code
let createListeners = function () {
	// Subscribe for updates to a resource
	node.get(key, update_messages);
	// Re-render the messagebox when the remote resource changes
	let nMessages = 0;
	let messageBox = document.getElementById("react-messages");
	// Format messages
	let format_message = function(msg, i) {
		let text = msg.text;
		let user = msg.user;
		return React.createElement('div', {className:"msg", key: i},
			[React.createElement("span", {className: "user-id", key: "user"}, user),
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
		
		nMessages = newVal.length;

	}
	// Enable sending of messages
	let sendbox = document.getElementById("send-box");
	function submit() {
		if (sendbox.value.length) {
			let text = JSON.stringify([{user: username, text: sendbox.value || ''}]);
			node.set(key, null, `[${nMessages}:${nMessages}] = ${text}`);
			sendbox.value = "";
		}
	}
	document.getElementById("send-msg").addEventListener("click", submit);
	sendbox.onkeydown = e => {
        if (e.keyCode == 13 && !e.shiftKey) {e.preventDefault(); submit()}};
}

if (document.readyState === "complete" ||
   (document.readyState !== "loading" && !document.documentElement.doScroll) ) {
	createListeners();
} else {
	document.addEventListener("DOMContentLoaded", createListeners);
}