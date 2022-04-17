var public_vapid_key =
  "BB2ikt9eLJydNI-1LpnaRYiogis3ydcUEw6O615fhaHsOsRRHcMZUfVSTNqun6HVb44M6PdfviDJkMWsdTO7XcM"


async function update_web_slider() {
    console.log("update_web_slider")
    if (document.getElementById("web_slider").checked)
        await subscribe()
    else
        await unsubscribe()
}

async function send_notification() {
    await fetch("/message", {
        method: "POST",
        body: JSON.stringify({
            message: {
                user: "User",
                text:"Message"
            }
        }),
        headers: {
          "content-type": "application/json"
        }
    });
}

// Subscibes the user and sends a test notification
async function subscribe() {
  var subscription_str = await get_subscription_string()
  
  // Send Push Notification
  console.log("Sending Push..." + subscription_str)
  await fetch("/subscribe", {
    method: "POST",
    body: subscription_str,
    headers: { "content-type": "application/json" }
  })
  console.log("Push Sent...")
}

// Returns a token for sending notifications to client
async function get_subscription_string () {
  console.log("Registering service worker...")
  var register = await navigator.serviceWorker.register("worker.js", {
    scope: "/chat/"
  })
  console.log("Service Worker Registered...")
  console.log("Registering Push...")
  var subscription = await register.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: url_base64_to_uint8_array(public_vapid_key)
  })
  console.log("Push Registered...")
  return JSON.stringify(subscription)
}


// Sends a server token, and tells it to remove from batch
async function unsubscribe() {
  console.log("remove()")
  var subscription_str = await get_subscription_string()
  // Send Push Notification
  console.log("Sending Push for removal...")
  await fetch("/chat/unsubscribe", {
    method: "POST",
    body: subscription_str,
    headers: {
      "content-type": "application/json"
    }
  })
  console.log("Push Sent to remove user from list...")
}

function url_base64_to_uint8_array(base64_string) {
  var padding = "=".repeat((4 - base64_string.length % 4) % 4);
  var base64 = (base64_string + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");

  var raw_data = window.atob(base64)
  var output_array = new Uint8Array(raw_data.length)

  for (let i=0; i < raw_data.length; ++i) 
    output_array[i] = raw_data.charCodeAt(i)

  return output_array
}

// handles the size of input
function input_size () {
    let textarea = document.getElementById("send-box")
    let header_size = '40'
    var ta_line_height = 45
    if (screen.width < 800) {
        header_size = '100'
        ta_line_height = 45
    }

    let text_area_height = 85
    let grid_container = document.getElementById("grid-container")
    grid_container.style.gridTemplateRows = `${header_size}px auto 85px 1.5em`
    var ta_height = textarea.scrollHeight // Get the scroll height of the textarea
    textarea.style.height = ta_height
    var number_of_lines = Math.floor(ta_height/ta_line_height)
    if (number_of_lines == 1)
        grid_container.style.gridTemplateRows = `${header_size}px auto 85px 1.5em`
    else if (number_of_lines == 2)
        grid_container.style.gridTemplateRows = `${header_size}px auto 125px 1.5em`
    else if (number_of_lines == 3)
        grid_container.style.gridTemplateRows = `${header_size}px auto 175px 1.5em`
    else if (number_of_lines >= 4)
        grid_container.style.gridTemplateRows = `${header_size}px auto 220px 1.5em`

    var message_view = document.getElementById("react-messages")
    message_view.scrollTop = message_view.scrollHeight
}

// If safari mobile, then the screen needs to be cut at the bottom
function screen_size () {
    if (screen.width < 800) {
        var ua = navigator.userAgent.toLowerCase()
        if (ua.indexOf('safari') !== -1) {
            if (ua.indexOf('chrome') > -1) {
                // Chrome
            } else {
                console.log("safari mobile")
                document.body.style.height = '90vh'
            }
        }
    }
}
