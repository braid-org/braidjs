const publicVapidKey =
  "BB2ikt9eLJydNI-1LpnaRYiogis3ydcUEw6O615fhaHsOsRRHcMZUfVSTNqun6HVb44M6PdfviDJkMWsdTO7XcM"

async function updateWebSlider() {
    console.log("updateWebSlider")
    if(document.getElementById("webSlider").checked){
        await subscribe();
    }else{
        await unsubscribe();
    }       
}

//Subscibes the user and sends a test notification
async function subscribe() {
  const subscription_str = await getSubscriptionString();
  
  // Send Push Notification
  console.log("Sending Push..." + subscription_str);
  await fetch("/subscribe", {
    method: "POST",
    body: subscription_str,
    headers: {
      "content-type": "application/json"
    }
  });
  console.log("Push Sent...");
}

//Returns a token for sending notifications to client
async function getSubscriptionString(){
  console.log("Registering service worker...");
  const register = await navigator.serviceWorker.register("/worker.js", {
    scope: "/"
  });
  console.log("Service Worker Registered...");
  console.log("Registering Push...");
  const subscription = await register.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
  });
  console.log("Push Registered...");
  return JSON.stringify(subscription)
}


//Sends a server token, and tells it to remove from batch
async function unsubscribe() {
  console.log("remove()")
  const subscription_str = await getSubscriptionString();
  // Send Push Notification
  console.log("Sending Push for removal...");
  await fetch("/unsubscribe", {
    method: "POST",
    body: subscription_str,
    headers: {
      "content-type": "application/json"
    }
  });
  console.log("Push Sent to remove user from list...");
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
