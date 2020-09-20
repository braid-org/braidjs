var fs = require('fs')
var path = require('path')
var ws = require('ws')
require('dotenv').config()

// When we have the npm version, this can be improved
var lib_path = "../../"

// Bundler doesn't actually return anything, but calling it with require
// generates the braid-bundle.js
require(path.join(lib_path, './util/braid-bundler.js'))
var sqlite = require(path.join(lib_path, './util/sqlite-store.js'))
var store = require(path.join(lib_path, './util/store.js'))
var braid = require(path.join(lib_path, './braid.js'))
var braid_websocket_server = require(path.join(lib_path, './protocol-websocket/websocket-server.js'))
var braid_http_server = require(path.join(lib_path, './protocol-http1/http1-server.js'))
var webpush = require("web-push")

if (process.env.MAIL_TO
    && process.env.WEB_PUSH_PUBLIC
    && process.env.WEB_PUSH_PRIVATE)
    webpush.setVapidDetails(
        process.env.MAIL_TO,  // Needs email address to send from
        process.env.WEB_PUSH_PUBLIC,
        process.env.WEB_PUSH_PRIVATE
    )

var port = 3009

// Static files to serve over HTTP
var known_files = {
	'/braid-bundle.js': {
		path: path.join(lib_path, `/builds/braid-bundle.js`),
		mime: 'text/javascript'
	},
	'/braidchat': {
		path: path.join('.', '/chat.html'),
		mime: 'text/html'
	},
	'/settings': {
		path: path.join('.', '/settings.html'),
		mime: 'text/html'
	},
	'/chat.js': {
		path: path.join('.', '/chat.js'),
		mime: 'text/javascript'
	},
	'/chat.css': {
		path: path.join('.', '/chat.css'),
		mime: 'text/css'
	},
	'/mobile.css': {
		path: path.join('.', '/mobile.css'),
		mime: 'text/css'
	},
	'/favicon.ico': {
		path: path.join('.', '/favicon.ico'),
		mime: 'image/x-icon'
	},
	'/white-airplane.png': {
		path: path.join('.', '/white-airplane.png'),
		mime: 'image/png'
	},
	'/black-airplane.png': {
		path: path.join('.', '/black-airplane.png'),
		mime: 'image/png'
	},
	'/settings.css': {
		path: path.join('.', '/settings.css'),
		mime: 'text/css'
	},
	'/client.js': {
		path: path.join('.', '/client.js'),
		mime: 'text/javascript'
	},
	'/worker.js': {
		path: path.join('.', '/worker.js'),
		mime: 'text/javascript'
	},
	'/icon.png': {
		path: path.join('.', '/icon.png'),
		mime: 'image/png'
	}
}
// Keys that braid knows about, and their default values.
var known_keys = {
	'/usr': {},
	'/chat': []
}

let endpoints = [] //list of devices connected to webpush notifications
let last_sent = {}

async function get_body(req) {
	var body = ''
	await req.on('data', function(data) {
		body += data
		console.log('Partial body: ' + body)
	})
	return body
}

// A simple method to serve one of the known files
async function serve_file(req, res) {
	if (req.method == 'POST') {
		console.log('POST to: ' + req.url)
		let body = await get_body(req)
		let json_body = JSON.parse(body)

		if (req.url === '/subscribe') {
			if (!endpoints.includes(body)) {
				console.log("Adding new endpoint")
				endpoints.push(body)
			}
			var payload = JSON.stringify({ title: 'Test Notification on chat' })
			// Sends a test notification
			webpush
				.sendNotification(json_body, payload)
				.catch(err => console.error(err))
		} else if (req.url === '/token') {
			console.log("Saving token")
			save_token(json_body['token'])
		} else if (req.url === '/message') {
			console.log("New message (sent as post request)")
			let notifications = build_mobile_notifications('user', 'basic notification')
			send_mobile_notifications(notifications)
		}
		res.writeHead(201, {'Content-Type': 'text/html'})
		res.end()
	} else {
		if (known_keys.hasOwnProperty(req.url))
			return braid_callback(req, res)
		var req_path = new URL(req.url, `http://${req.headers.host}`)
		var f = known_files[req_path.pathname]
		if (f) {
			res.writeHead(200, headers = { 'content-type': f.mime })
			fs.createReadStream(f.path).pipe(res)
		} else {
			res.writeHead(404)
			res.end()
		}
	}
}


var send_push_notifications = () => {
	let send_to = []
	for (let i = 0; i < endpoints.length; i++)
	  send_to.push(JSON.parse(endpoints[i]))

	var payload = JSON.stringify({
        title: 'New message on BraidChat',
        click_action: 'https://invisible.college/chat/',
        body: "BraidChat",
        icon: "https://ibb.co/p4wKfsR"
    })
    console.log("Sending message: " + JSON.stringify(payload));

	for (let i = 0; i < send_to.length; i++) {
	  send_to[i]['click_action'] = 'https://invisible.college/chat/'
	  console.log("sending webpush to user")
	  webpush
		.sendNotification(send_to[i], payload)
		.catch(err => console.error(err));
	}
}



// Create either an http or https server, depending on the existence of ssl certs
var server =
    (fs.existsSync('certs/private-key') && fs.existsSync('certs/certificate'))
    ? require('https').createServer(
        { key: fs.readFileSync('certs/private-key'),
		  cert: fs.readFileSync('certs/certificate') },
        serve_file)
    : require('http').createServer(serve_file)

// Setup the braid sqlite store at a local db
var db = sqlite('db.sqlite')
var node = braid({pid: 'server-' + Math.random().toString(36).slice(2,5)})
node.fissure_lifetime = 1000 * 60 * 60 * 24 // Fissures expire after 24 hours

var braid_callback = braid_http_server(node)
store(node, db).then(node => {
	// Unsubscribe on error
	// Maybe not needed
	node.on_errors.push((key, origin) => node.unbind(key, origin))

	// For any of the default keys, if we have no versions for them, set an initial version.
	Object.keys(known_keys)
		.filter(k => Object.keys(node.resource_at(k).current_version).length == 0)
		.forEach(k => node.set(k, known_keys[k]))
	Object.keys(known_keys)
		.forEach(k => node.get(k))

	var wss = new ws.Server({ server })
	braid_websocket_server(node, { port, wss })

	console.log('Keys at startup: ' + JSON.stringify(Object.keys(node.resources)))
	server.listen(port)
})


//App notifications
var notification_node = require("../../braid.js")()
notification_node.websocket_client({url:'wss://invisible.college:3009'})
notification_node.get('/usr', add_users)
notification_node.get('/chat', update_messages)
var { Expo } = require("expo-server-sdk")
let expo = new Expo()

function update_messages(new_val) {
    let message = new_val[new_val.length -1]
    console.log(JSON.stringify(message))
    console.log(message['body'])
    if (last_sent != message['body']) {
	    //web notifications
	    send_push_notifications()
	    //mobile notifications
	    let notifications = build_mobile_notifications(get_name(message), message['body'])
	    send_mobile_notifications(notifications)
        last_sent = message['body']
        console.log("Sent message")
    } else
        console.log("Didn't send push notification:" +  message['body'])
}

let saved_users = {}
function add_users(user_dict){
	saved_users = JSON.parse(JSON.stringify(user_dict))   //new json object here
}

function get_name(message){
	let name = saved_users[message['user']]
	if (name == undefined)
		name = "unknown"
	else
		name = name['displayname']

	return name
}

let saved_push_tokens = []
function save_token(token) {
	console.log(token.value, saved_push_tokens)
	console.log(JSON.stringify(token))
    var exists = saved_push_tokens.find(t => t === token.value)
    if (!exists) {
        console.log("new device saved for push notifications")
        saved_push_tokens.push(token.value)
    } else
      console.log("Device was already saved")
}

//creates the mobile notifications. One for every device
var build_mobile_notifications = ( user, message ) => {
    if (message === undefined) {
        console.log("message is undefined")
        return undefined
    }
    console.log("Sending push notification", {message, user},
                "to", saved_push_tokens.length, 'devices.')
    let notifications = []
    let index = -1
    for (let push_token of saved_push_tokens) {
		console.log("sending to device:" + push_token)
		index++
		if (!Expo.isExpoPushToken(push_token)) {
		    console.error(`Push token ${push_token} is not a valid Expo push token`)
		    continue
		}
		notifications.push({
			to: push_token,
			sound: "default",
			title: user,
			body: message,
			data: { message }
		})
	}
	return notifications
}

//Sends the notification list 
var send_mobile_notifications = (notifications) => {
    if (!notifications || notifications.length == 0) {
	    console.log("no devices linked")
	    return
    } else {
        console.log("sending notifications:" + JSON.stringify(notifications[0]))

        if (typeof expo.chunkPushNotifications !== 'function') {
            console.error('Expo error! Can\'t send notification! Fooey.')
            return
        }
        let chunks = expo.chunkPushNotifications(notifications)
        
        (async () => {
            for (let chunk of chunks) {
                try {
                    let receipts = await expo.sendPushNotificationsAsync(chunk)
                    console.log(receipts)
                } catch (error) {
                    console.log("Error: sendPushNotificationsAsync")
                    console.error(error)
                }
            }
        })()
    }
}
