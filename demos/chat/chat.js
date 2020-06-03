// Create a node
const key = "/chat";

const id = localStorage.braidId || `C-${Math.random().toString(36).substring(0, 10)}`;
if (!localStorage.braidId)
	localStorage.braidId = id;

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
	let md = function(msg, i) {
		let text = msg.text;
		let user = msg.user;
		return React.createElement('div', {className:"msg", key: i},
			[React.createElement("span", {className: "userID"}, user),
			 React.createElement("span", {className: "msgText"}, text)]);
	}
	function update_messages(newVal) {
		nMessages = newVal.length;
		let MessageList = React.createElement('div', {className: "messageBox"},
			newVal.map(md)
		);
		ReactDOM.render(
			MessageList,
			messageBox
		);
		// Check scrolling 
	}
	// Enable sending of messages
	let sendbox = document.getElementById("send-box");
	function submit() {
		let text = JSON.stringify([{"user": id, "text": sendbox.value || ''}]);
		node.set(key, null, `[${nMessages}:${nMessages}] = ${text}`);
		sendbox.value = "";
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