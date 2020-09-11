const fs = require('fs');
const path = require('path');
const ws = require('ws');
require('dotenv').config();

// When we have the npm version, this can be improved
const lib_path = "../../";

// Bundler doesn't actually return anything, but calling it with require
//   generates the braid-bundle.js
require(path.join(lib_path, './util/braid-bundler.js'));
const sqlite = require(path.join(lib_path, './util/sqlite-store.js'));
const store = require(path.join(lib_path, './util/store.js'));
const braid = require(path.join(lib_path, './braid.js'));
const braidWebsocketServer = require(path.join(lib_path, './protocol-websocket/websocket-server.js'));
const braidHttpServer = require(path.join(lib_path, './protocol-http1/http1-server.js'));
const webpush = require("web-push");

if (process.env.MAIL_TO
    && process.env.WEB_PUSH_PUBLIC
    && process.env.WEB_PUSH_PRIVATE)
    webpush.setVapidDetails(
        process.env.MAIL_TO,  // Needs email address to send from
        process.env.WEB_PUSH_PUBLIC,
        process.env.WEB_PUSH_PRIVATE
    );

const port = 3010;
//global.g_show_protocol_errors = true;
//global.print_network = true
//global.show_debug = true;

// Static files we want to serve over http
//  and where to find them on disk, and their mime types
const knownFiles = {
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
};
// Keys that braid knows about, and their default values.
const knownKeys = {
	'/usr': {},
	'/chat': []
};

let endpoints = [] //list of devices connected to webpush notifications
let lastSent = {}

async function getBody(req) {
	var body = ''
	await req.on('data', function(data) {
		body += data
		console.log('Partial body: ' + body)
	})
	return body
}
// A simple method to serve one of the known files
async function serveFile(req, res) {
	if(req.method == 'POST'){
		console.log('POST to: ' + req.url)
		let body = await getBody(req)
		let json_body = JSON.parse(body)

		if(req.url === '/subscribe')
		{
			if(!endpoints.includes(body)){
				console.log("Adding new endpoint");
				endpoints.push(body)
			}
			const payload = JSON.stringify({ title: 'Test Notification on chat' });
			// Sends a test notification
			webpush
				.sendNotification(json_body, payload)
				.catch(err => console.error(err));
		}else if(req.url === '/token'){
			console.log("Saving token")
			saveToken(json_body['token'])
		}else if(req.url === '/message'){
			console.log("New message (sent as post request)")
			let notifications = buildMobileNotifications('user', 'basic notification')
			sendMobileNotifications(notifications)
		}
		res.writeHead(201, {'Content-Type': 'text/html'})
		res.end();
	}else{
		if (knownKeys.hasOwnProperty(req.url))
			return braidCallback(req, res);
		const reqPath = new URL(req.url, `http://${req.headers.host}`);
		const f = knownFiles[reqPath.pathname];
		if (f) {
			res.writeHead(200, headers = { 'content-type': f.mime });
			fs.createReadStream(f.path).pipe(res);
		} else {
			res.writeHead(404);
			res.end();
		}
	}
}


const sendPushNotifications = () => {
	let sendTo = []
	for(let i = 0; i < endpoints.length; i++){
	  sendTo.push(JSON.parse(endpoints[i]));
	}
	const payload = JSON.stringify({ title: 'New message on BraidChat', click_action: 'https://invisible.college/chat/',  body: "BraidChat", icon: "https://ibb.co/p4wKfsR"});
        console.log("Sending message: " + JSON.stringify(payload));	
	for(let i = 0; i < sendTo.length; i++){
	  sendTo[i]['click_action'] = 'https://invisible.college/chat/'
	  console.log("sending webpush to user");
	  webpush
		.sendNotification(sendTo[i], payload)
		.catch(err => console.error(err));
	}
};



// Create either an http or https server, depending on the existence of ssl certs
var server = (fs.existsSync('certs/private-key') && fs.existsSync('certs/certificate')) ?
	require('https').createServer({
		key: fs.readFileSync('certs/private-key'),
		cert: fs.readFileSync('certs/certificate')
	}, serveFile) :
	require('http').createServer(serveFile);

// Setup the braid sqlite store at a local db
var db = sqlite('db.sqlite');
var node = braid();
node.fissure_lifetime = 1000 * 60 * 60 * 2 // Fissures expire after 2 hours

var braidCallback = braidHttpServer(node);
store(node, db).then(node => {
	// Unsubscribe on error
	// Maybe not needed
	node.on_errors.push((key, origin) => node.unbind(key, origin))

	// For any of the default keys, if we have no versions for them, set an initial version.
	Object.keys(knownKeys)
		.filter(k => Object.keys(node.resource_at(k).current_version).length == 0)
		.forEach(k => node.set(k, knownKeys[k]));
	Object.keys(knownKeys)
		.forEach(k => node.get(k));

	var wss = new ws.Server({ server })
	braidWebsocketServer(node, { port, wss })

	console.log('Keys at startup: ' + JSON.stringify(Object.keys(node.resources)))
	server.listen(port);
})


//App notifications
const notification_node = require("../../braid.js")()
//notification_node.websocket_client({url:'wss://invisible.college:3009'})
notification_node.get('/usr', addUsers)
notification_node.get('/chat', update_messages)
const { Expo } = require("expo-server-sdk");
let expo = new Expo();

function update_messages(newVal){
    let message = newVal[newVal.length -1]
    console.log(JSON.stringify(message))
    console.log(message['body'])
    if(lastSent != message['body']){
	  //web notifications
	  sendPushNotifications()
	  //mobile notifications
	  let notifications = buildMobileNotifications(getName(message), message['body'])
	  sendMobileNotifications(notifications)
      lastSent = message['body']
      console.log("Sent message")
    }else{
      console.log("Didn't send push notification:" +  message['body'])
    }
}

let savedUsers = {}
function addUsers(userDict){
	savedUsers = JSON.parse(JSON.stringify(userDict)); //new json object here
}

function getName(message){
	let name = savedUsers[message['user']]
	if(name == undefined){
		name = "unknown"
	}else{
		name = name['displayname']
	}
	return name
}

let savedPushTokens = []
function saveToken(token) {
	console.log(token.value, savedPushTokens);
	console.log(JSON.stringify(token))
    const exists = savedPushTokens.find(t => t === token.value);
    if (!exists) {
        console.log("new device saved for push notifications")
        savedPushTokens.push(token.value);
    }else{
      console.log("Device was already saved")
    }
};

//creates the mobile notifications. One for every device
const buildMobileNotifications = ( user, message ) => {
    if(message == undefined){
      console.log("message is undefined")
      return undefined
    }
    console.log("Sending push notification from " + " with body \"" + message + "\" subject \"" + user + "\" to "  +savedPushTokens.length + " devices") 
    let notifications = [];
    let index = -1;
    for (let pushToken of savedPushTokens) {
		console.log("sending to device:" + pushToken)
		index ++;
		if (!Expo.isExpoPushToken(pushToken)) {
		console.error(`Push token ${pushToken} is not a valid Expo push token`);
		continue;
		}
		notifications.push({
			to: pushToken,
			sound: "default",
			title: user,
			body: message,
			data: { message }
		});
	}
	return notifications
};

//Sends the notification list 
const sendMobileNotifications = (notifications) => {
  if(!notifications || notifications.length == 0){
	console.log("no devices linked")
	return;
  }else{
     console.log("sending notifications:" + JSON.stringify(notifications[0]))
     let chunks = expo.chunkPushNotifications(notifications);
  
    (async () => {
      for (let chunk of chunks) {
        try {
          let receipts = await expo.sendPushNotificationsAsync(chunk);
          console.log(receipts);
        } catch (error) {
          console.log("Error: sendPushNotificationsAsync");
          console.error(error);
        }
      }
    })();
  }
}
