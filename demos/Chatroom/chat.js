// Create a node
const key = "/chat";
const id = `C-${Math.random().toString(36).substr(10)}`;
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
	function update_messages(newVal) {
		nMessages = newVal.length;
		let MessageList = React.createElement('div', {className: "messageBox"},
			newVal.map((msg, i) =>
				React.createElement('div', {className:"msg", key: i}, msg)
			)
		);
		ReactDOM.render(
			MessageList,
			messageBox
		);
	}
	// Enable sending of messages
	let sendbox = document.getElementById("send-box");
	function submit() {
		let text = JSON.stringify([sendbox.value || '']);
		node.set(key, null, `[${nMessages}:${nMessages}] = ${text}`);
		sendbox.val("");
	}
	document.getElementById("send-box").addEventListener("click", submit);
	sendbox.addEventListener("keyDown", e => {if (e.keyCode == 13 && !e.shiftKey) {e.preventDefault(); submit()}});
}

if (document.readyState === "complete" ||
   (document.readyState !== "loading" && !document.documentElement.doScroll) ) {
	createListeners();
} else {
	document.addEventListener("DOMContentLoaded", createListeners);
}