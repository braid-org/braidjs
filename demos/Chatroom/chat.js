// Create a node
const key = "/chat";
const id = 'C-' + Math.random().toString(36).substr(10);
const node = require('node.js')({id});

node.default(key + '/*', (path) => ['Top post for '+ path]);
node.default(key, ['Top post!']);

require('websocket-client.js')({node, url: 'wss://invisible.college:3007/'});

// UI Code
$(() => {
	var chat_messages = [];
	node.get(key, (val) => {console.log(val); chat_messages = val; update_messages()});

	sendbox = $("#send-box");
	function submit() {
		text = JSON.stringify([sendbox.val() || '']);
		n = chat_messages.length;
		node.set(key, null, `[${n}:${n}] = ${text}`);
		sendbox.val("");
	}
	$("#send-msg").click(submit);
	sendbox.keydown((e) => {if (e.keyCode == 13 && !e.shiftKey) {e.preventDefault(); submit()}});

	messagebox = $("#messages");
	function update_messages() {
		messagebox.html("")
		chat_messages.forEach((s) => {
			newmsg = $("<div></div>");
			newmsg.text(s)
			messagebox.append(newmsg);
		})
	}
})


/**get = bus.fetch
set = bus.save
key = '/chat'
dom.BODY = =>
  chat = get(key)
  submit = =>
    n = chat.val.length
    node.set(key, null,
             "[#{n}:#{n}] = " + JSON.stringify([get('local').new_text || '']))
    bus.save({key: 'local', new_text: ''})

  DIV {},
    H2('messages'),
    for msg in chat.val
      DIV msg
    TEXTAREA
      id:  'the input!'
      key: 'the input!'
      value: get('local').new_text
      onChange: (e) =>
        set({key: 'local', new_text: e.target.value})
      onKeyDown: (e) => if e.keyCode == 13 then setTimeout(submit)
    BUTTON
      onClick: submit
      'Send'
dom.BODY.up = -> document.getElementById('the input!').focus()

bus('/*').to_fetch = (key, t) => node.get(key, (val) => t.done({key, val}))
bus('/*').to_save  = (obj, t) => node.set(obj.key, obj.val)
**/